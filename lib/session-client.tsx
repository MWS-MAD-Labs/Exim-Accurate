"use client";

import { keepFresh, watchSession } from "mws-central-auth/client";
import { createContext, useContext, useEffect, useState } from "react";
import type { Session } from "@/lib/session";

type SessionState = { data: Session | null; status: "loading" | "authenticated" | "unauthenticated" };

const SessionContext = createContext<SessionState>({ data: null, status: "loading" });

interface SessionResponse {
  user: Session["user"];
  hub: { homeUrl: string; refreshUrl: string };
  expiresIn: number;
}

// Reads the Hub session through /api/session, renews it while the page is open, and leaves for the Hub when it ends.
export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<SessionState>({ data: null, status: "loading" });

  useEffect(() => {
    let stopRenewal = () => {};
    let stopWatching = () => {};
    let cancelled = false;

    async function load(): Promise<SessionResponse | null> {
      const response = await fetch("/api/session", { cache: "no-store" });
      return response.ok ? ((await response.json()) as SessionResponse) : null;
    }

    load()
      .then((session) => {
        if (cancelled) return;
        if (!session) {
          setState({ data: null, status: "unauthenticated" });
          return;
        }
        setState({ data: { user: session.user }, status: "authenticated" });
        stopRenewal = keepFresh({
          refreshUrl: session.hub.refreshUrl,
          initialExpiresIn: session.expiresIn,
          onEnded: () => {
            window.location.href = session.hub.homeUrl;
          },
        });
        // A sign-out in the Hub deletes the cookie; looking at the tab again notices.
        stopWatching = watchSession({
          check: async () => (await fetch("/api/session", { cache: "no-store" })).ok,
          onRevoked: () => {
            window.location.href = session.hub.homeUrl;
          },
        });
      })
      .catch(() => {
        if (!cancelled) setState({ data: null, status: "unauthenticated" });
      });

    return () => {
      cancelled = true;
      stopRenewal();
      stopWatching();
    };
  }, []);

  return <SessionContext.Provider value={state}>{children}</SessionContext.Provider>;
}

export function useSession() {
  return useContext(SessionContext);
}
