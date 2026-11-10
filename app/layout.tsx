import "@mantine/core/styles.css";
import "@mantine/dates/styles.css";
import "@mantine/notifications/styles.css";
import "./globals.css";
import { Providers } from "@/lib/providers";
import { Lora, Nunito_Sans, Plus_Jakarta_Sans } from "next/font/google";

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta-sans",
  weight: ["400", "500", "600", "700", "800"],
});

const nunitoSans = Nunito_Sans({
  subsets: ["latin"],
  variable: "--font-nunito-sans",
  weight: ["400", "500", "600", "700", "800"],
});

const lora = Lora({
  subsets: ["latin"],
  variable: "--font-lora",
  weight: ["400", "500", "600", "700"],
});

// The same script Mantine's ColorSchemeScript renders. That one is a client component, and React warns about it.
const colorSchemeScript = `try {
  var stored = window.localStorage.getItem("mantine-color-scheme-value");
  var scheme = stored === "light" || stored === "dark" || stored === "auto" ? stored : "light";
  var computed = scheme !== "auto" ? scheme : window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  document.documentElement.setAttribute("data-mantine-color-scheme", computed);
} catch (e) {}`;

export const metadata = {
  title: "Sade | Millennia Mart and Resources",
  description: "Millennia Mart and Resources store front.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: colorSchemeScript }} />
      </head>
      <body
        className={`${plusJakartaSans.variable} ${nunitoSans.variable} ${lora.variable}`}
        suppressHydrationWarning
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
