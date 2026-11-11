import { ReactNode } from "react";

import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import type { Metadata } from "next";
import { KioskNotifications } from "./kiosk-notifications";
import { LocalDarkScheme } from "@/components/LocalDarkScheme";

export const metadata: Metadata = {
  title: "Sade Kiosk",
  description: "Stasiun checkout inventaris mandiri",
};

export default function KioskLayout({ children }: { children: ReactNode }) {
  return (
    <LocalDarkScheme
      className="kiosk-root"
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
      {/* Content */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          flex: 1,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {children}
      </div>

      <style
        dangerouslySetInnerHTML={{
          __html: `
              .kiosk-root {
                font-family: var(--font-nunito-sans), "Nunito Sans", sans-serif;
              }
              .kiosk-heading {
                font-family: var(--font-jakarta-sans), "Plus Jakarta Sans", sans-serif;
                letter-spacing: -0.02em;
              }
            `,
        }}
      />
    </LocalDarkScheme>
  );
}
