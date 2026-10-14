"use client";

import { MantineProvider } from "@mantine/core";
import { ModalsProvider } from "@mantine/modals";
import { Notifications } from "@mantine/notifications";
import { SessionProvider } from "./session-client";
import { theme } from "./theme";
import { LanguageProvider } from "./language";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <LanguageProvider>
      <SessionProvider>
        <MantineProvider theme={theme} defaultColorScheme="light">
          <Notifications position="top-right" />
          <ModalsProvider>{children}</ModalsProvider>
        </MantineProvider>
      </SessionProvider>
    </LanguageProvider>
  );
}
