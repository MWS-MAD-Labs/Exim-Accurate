import { ReactNode } from "react";
import { getServerSession } from "@/lib/session";
import { redirect } from "next/navigation";

import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import type { Metadata } from "next";
import { getRoleHome, hasPermission } from "@/lib/access-control";
import { KioskNotifications } from "../kiosk/kiosk-notifications";
import { LocalDarkScheme } from "@/components/LocalDarkScheme";

export const metadata: Metadata = {
  title: "POS Cashier | Sade",
  description: "Point of Sales cashier counter",
};

export default async function PosCashierLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await getServerSession();
  if (!session?.user?.id) {
    redirect("/login?callbackUrl=/pos-cashier");
  }
  if (!hasPermission(session.user.permissions, "pos.checkout")) {
    redirect(getRoleHome(session.user.role, session.user.permissions));
  }

  return (
    <LocalDarkScheme
      className="pos-cashier-root"
      style={{
        minHeight: "100vh",
        width: "100vw",
        // One background colour and one soft sage glow from the top, nothing else.
        background: "var(--kiosk-glow), var(--kiosk-bg)",
        display: "flex",
        flexDirection: "column",
        color: "var(--kiosk-text)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <KioskNotifications />
      <div
        style={{
          position: "relative",
          zIndex: 1,
          flex: 1,
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
        }}
      >
        {children}
      </div>
      <style
        dangerouslySetInnerHTML={{
          __html: `
            .pos-cashier-root {
              font-family: var(--font-nunito-sans), "Nunito Sans", sans-serif;
            }
            .pos-cashier-heading {
              font-family: var(--font-jakarta-sans), "Plus Jakarta Sans", sans-serif;
              letter-spacing: -0.02em;
            }
          `,
        }}
      />
    </LocalDarkScheme>
  );
}
