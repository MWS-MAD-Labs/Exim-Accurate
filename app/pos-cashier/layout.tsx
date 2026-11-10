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
        background: "var(--sade-espresso)",
        display: "flex",
        flexDirection: "column",
        color: "#F1F0E8",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <KioskNotifications />
      <div
        className="pos-cashier-gradient"
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(circle at 15% 15%, rgba(111, 139, 106, 0.2), transparent 42%), radial-gradient(circle at 85% 10%, rgba(214, 161, 58, 0.12), transparent 40%), linear-gradient(135deg, #1C2419 0%, #242E21 52%, #1C2419 100%)",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "linear-gradient(rgba(214, 161, 58, 0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(214, 161, 58, 0.025) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
          opacity: 0.16,
          pointerEvents: "none",
          maskImage:
            "radial-gradient(circle at center, black 0%, rgba(0,0,0,0.4) 55%, transparent 82%)",
        }}
      />
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
              --cashier-panel: rgba(43, 55, 38, 0.9);
              --cashier-panel-soft: rgba(43, 55, 38, 0.72);
              --cashier-stroke: rgba(230, 234, 223, 0.18);
            }
            .pos-cashier-heading {
              font-family: var(--font-jakarta-sans), "Plus Jakarta Sans", sans-serif;
              letter-spacing: -0.02em;
            }
            .pos-cashier-gradient {
              animation: cashierGradientShift 18s ease-in-out infinite;
              background-size: 140% 140%;
            }
            @keyframes cashierGradientShift {
              0%, 100% { transform: scale(1); opacity: 0.92; }
              50% { transform: scale(1.025); opacity: 1; }
            }
          `,
        }}
      />
    </LocalDarkScheme>
  );
}
