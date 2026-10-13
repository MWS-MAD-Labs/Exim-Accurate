"use client";

import { MantineProvider } from "@mantine/core";
import { ModalsProvider } from "@mantine/modals";
import { Notifications } from "@mantine/notifications";
import { SessionProvider } from "next-auth/react";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { watchSession } from "mws-central-auth/client";
import { isSignInPath, sessionRevoked } from "./session-recheck";
import { theme } from "./theme";
import { LanguageProvider } from "./language";

// A session another app's sign-out ended gets the person to the Hub (/login hands them over) once the tab shows it.
function SessionRecheck() {
  const pathname = usePathname();
  useEffect(() => {
    if (isSignInPath(pathname)) return undefined;
    return watchSession({
      check: async () => {
        const response = await fetch("/api/auth/session", { cache: "no-store" });
        return !sessionRevoked(await response.json().catch(() => null));
      },
      onRevoked: () => {
        window.location.href = "/login";
      },
    });
  }, [pathname]);
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
