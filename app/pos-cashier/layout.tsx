import { ReactNode } from "react";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import type { Metadata } from "next";
import { Orbitron, Space_Grotesk } from "next/font/google";
import { authOptions } from "@/lib/auth";
import { canOperatePos, getRoleHome } from "@/lib/access-control";
import { KioskNotifications } from "../kiosk/kiosk-notifications";
import { LocalDarkScheme } from "@/components/LocalDarkScheme";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-space-grotesk",
});

const orbitron = Orbitron({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-orbitron",
});

export const metadata: Metadata = {
  title: "POS Cashier | Exima",
  description: "Point of Sales cashier counter",
};

export default async function PosCashierLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/login?callbackUrl=/pos-cashier");
  }
  if (!canOperatePos(session.user.role)) {
    redirect(getRoleHome(session.user.role));
  }

  return (
    <LocalDarkScheme
      className={`${spaceGrotesk.variable} ${orbitron.variable} pos-cashier-root`}
      style={{
        minHeight: "100vh",
        width: "100vw",
        background: "#05070f",
        display: "flex",
        flexDirection: "column",
        color: "white",
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
            "radial-gradient(circle at 15% 15%, rgba(56, 189, 248, 0.2), transparent 42%), radial-gradient(circle at 85% 10%, rgba(167, 139, 250, 0.18), transparent 40%), radial-gradient(circle at 55% 90%, rgba(16, 185, 129, 0.14), transparent 45%), linear-gradient(135deg, #05070f 0%, #0b1020 48%, #070b16 100%)",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "linear-gradient(rgba(148, 163, 184, 0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(148, 163, 184, 0.06) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
          opacity: 0.28,
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
              font-family: var(--font-space-grotesk);
              letter-spacing: 0.01em;
              --cashier-panel: rgba(12, 18, 32, 0.88);
              --cashier-panel-soft: rgba(12, 18, 32, 0.68);
              --cashier-stroke: rgba(148, 163, 184, 0.2);
            }
            .pos-cashier-heading {
              font-family: var(--font-orbitron);
              letter-spacing: 0.06em;
              text-transform: uppercase;
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
