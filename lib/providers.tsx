"use client";

import { MantineProvider } from "@mantine/core";
import { ModalsProvider } from "@mantine/modals";
import { Notifications } from "@mantine/notifications";
import { SessionProvider, useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { sessionRevoked } from "./session-recheck";
import { theme } from "./theme";
import { LanguageProvider } from "./language";

// A session another app's sign-out ended gets the person to the Hub (/login hands them over) once the tab shows it.
function SessionRecheck() {
  const { data, status } = useSession();
  const pathname = usePathname();
  useEffect(() => {
    if (sessionRevoked(status, data?.user?.id, pathname)) window.location.href = "/login";
  }, [data, status, pathname]);
  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <LanguageProvider>
      <SessionProvider>
        <SessionRecheck />
        <MantineProvider theme={theme} defaultColorScheme="light">
          <Notifications position="top-right" />
          <ModalsProvider>{children}</ModalsProvider>
        </MantineProvider>
      </SessionProvider>
    </LanguageProvider>
  );
}
