"use client";

import { MantineProvider } from "@mantine/core";
import { ModalsProvider } from "@mantine/modals";
import { Notifications } from "@mantine/notifications";
import { SessionProvider, useSession } from "next-auth/react";
import { useEffect } from "react";
import { theme } from "./theme";
import { LanguageProvider } from "./language";

// A session another app's sign-out ended comes back with an empty id once the tab refreshes it on focus.
// /login hands the person to the Hub.
function SessionRecheck() {
  const { data, status } = useSession();
  useEffect(() => {
    if (status === "authenticated" && !data?.user?.id) window.location.href = "/login";
  }, [data, status]);
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
