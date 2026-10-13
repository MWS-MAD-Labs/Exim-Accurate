import "@mantine/core/styles.css";
import "@mantine/dates/styles.css";
import "@mantine/notifications/styles.css";
import "./globals.css";
import { Providers } from "@/lib/providers";

// The same script Mantine's ColorSchemeScript renders. That one is a client component, and React warns about it.
const colorSchemeScript = `try {
  var stored = window.localStorage.getItem("mantine-color-scheme-value");
  var scheme = stored === "light" || stored === "dark" || stored === "auto" ? stored : "light";
  var computed = scheme !== "auto" ? scheme : window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  document.documentElement.setAttribute("data-mantine-color-scheme", computed);
} catch (e) {}`;

export const metadata = {
  title: "Exima - Manajer Ekspor/Impor untuk Accurate",
  description: "Kelola inventory adjustment untuk Accurate Online",
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
      <body suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
