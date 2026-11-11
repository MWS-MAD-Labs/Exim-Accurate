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

// Only 401 (signed out) and 403 (access taken away) end the session. A 500 from a dev server that is recompiling or
// a 503 while Central is slow says nothing about the session, so the page stays.
export function sessionEnded(status: number) {
  return status === 401 || status === 403;
}

// The status of /api/session when the tab is looked at again. The Hub access token lives about five minutes, so after
// a longer break it has usually expired, and this check runs at the same moment keepFresh asks for a new one. A 401
// then only means "not renewed yet": renew once and ask again, and leave for the Hub only when that also says 401.
export async function checkSession(refreshUrl: string, fetchImpl: typeof fetch = fetch): Promise<number> {
  const first = await fetchImpl("/api/session", { cache: "no-store" });
  if (first.status !== 401) return first.status;
  const renewed = await fetchImpl(refreshUrl, {
    method: "POST",
    credentials: "include",
    headers: { "X-Requested-With": "mws" },
    cache: "no-store",
  }).catch(() => null);
  if (!renewed?.ok) return renewed?.status === 401 ? 401 : 503;
  return (await fetchImpl("/api/session", { cache: "no-store" })).status;
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
          check: async () => !sessionEnded(await checkSession(session.hub.refreshUrl)),
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
