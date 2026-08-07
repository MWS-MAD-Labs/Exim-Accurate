import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function getCurrentAdmin() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return null;
  }

  return prisma.user.findFirst({
    where: { id: session.user.id, role: "admin" },
    select: { id: true, email: true, role: true },
  });
}
