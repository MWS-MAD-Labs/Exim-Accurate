import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import { prisma } from "./prisma";
import bcrypt from "bcryptjs";

const googleClientId = process.env.WOKO_GOOGLE_OAUTH_CLIENT_ID;
const googleClientSecret = process.env.WOKO_GOOGLE_OAUTH_CLIENT_SECRET;

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error("Email and password required");
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
        });

        if (!user) {
          throw new Error("Invalid credentials");
        }

        const isPasswordValid = await bcrypt.compare(
          credentials.password,
          user.password
        );

        if (!isPasswordValid) {
          throw new Error("Invalid credentials");
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        };
      },
    }),
    ...(googleClientId && googleClientSecret
      ? [
          GoogleProvider({
            clientId: googleClientId,
            clientSecret: googleClientSecret,
          }),
        ]
      : []),
  ],
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async signIn({ account, profile, user }) {
      if (account?.provider !== "google") return true;

      const googleProfile = profile as { email_verified?: boolean } | undefined;
      if (!googleProfile?.email_verified || !user.email) return false;

      const existingUser = await prisma.user.findFirst({
        where: {
          email: {
            equals: user.email,
            mode: "insensitive",
          },
        },
        select: { id: true },
      });

      return Boolean(existingUser);
    },
    async jwt({ token, user, account }) {
      if (account?.provider === "google" && user.email) {
        const existingUser = await prisma.user.findFirst({
          where: {
            email: {
              equals: user.email,
              mode: "insensitive",
            },
          },
          select: { id: true, email: true, name: true, role: true },
        });

        if (existingUser) {
          token.id = existingUser.id;
          token.email = existingUser.email;
          token.name = existingUser.name;
          token.role = existingUser.role;
        }
      } else if (user) {
        token.id = user.id;
        token.name = user.name;
        token.role = user.role;
      } else if (token.id) {
        const currentUser = await prisma.user.findUnique({
          where: { id: token.id as string },
          select: { name: true, role: true },
        });
        token.name = currentUser?.name ?? null;
        token.role = currentUser?.role ?? "";
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.name = token.name as string | null;
        session.user.role = token.role as string;
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};
