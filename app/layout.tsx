import "@mantine/core/styles.css";
import "@mantine/dates/styles.css";
import "@mantine/notifications/styles.css";
import "./globals.css";
import { Providers } from "@/lib/providers";
import { ColorSchemeScript } from "@mantine/core";

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
        <ColorSchemeScript defaultColorScheme="light" />
      </head>
      <body suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
