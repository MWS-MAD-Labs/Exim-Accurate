import { ReactNode } from "react";

import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import type { Metadata } from "next";
import { Orbitron, Space_Grotesk } from "next/font/google";
import { KioskNotifications } from "./kiosk-notifications";
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
  title: "Kiosk Self Checkout | Exima",
  description: "Stasiun checkout inventaris mandiri",
};

export default function KioskLayout({ children }: { children: ReactNode }) {
  return (
    <LocalDarkScheme
      className={`${spaceGrotesk.variable} ${orbitron.variable} kiosk-root`}
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
      {/* Decorative background elements */}
      <div
        className="kiosk-gradient"
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(circle at 20% 20%, rgba(56, 189, 248, 0.18), transparent 45%), radial-gradient(circle at 80% 10%, rgba(167, 139, 250, 0.18), transparent 40%), radial-gradient(circle at 50% 80%, rgba(16, 185, 129, 0.16), transparent 45%), linear-gradient(135deg, #05070f 0%, #0b1020 45%, #070b16 100%)",
          pointerEvents: "none",
        }}
      />
      <div
        className="kiosk-grid"
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "linear-gradient(rgba(148, 163, 184, 0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(148, 163, 184, 0.06) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
          opacity: 0.3,
          pointerEvents: "none",
          maskImage:
            "radial-gradient(circle at center, black 0%, rgba(0,0,0,0.4) 55%, transparent 80%)",
        }}
      />
      <div
        className="kiosk-scanlines"
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(180deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.01) 15%, transparent 25%, transparent 100%)",
          mixBlendMode: "screen",
          opacity: 0.4,
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: "-20%",
          right: "-10%",
          width: "50%",
          height: "50%",
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(59, 130, 246, 0.15) 0%, transparent 70%)",
          filter: "blur(60px)",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: "-20%",
          left: "-10%",
          width: "40%",
          height: "40%",
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(139, 92, 246, 0.1) 0%, transparent 70%)",
          filter: "blur(50px)",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: "60%",
          height: "60%",
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(34, 139, 230, 0.08) 0%, transparent 60%)",
          filter: "blur(80px)",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: "50%",
          transform: "translateX(-50%)",
          width: "75%",
          height: "25%",
          background:
            "radial-gradient(ellipse at center, rgba(56, 189, 248, 0.25) 0%, transparent 70%)",
          filter: "blur(70px)",
          pointerEvents: "none",
        }}
      />

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

      {/* CSS Animation */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
              .kiosk-root {
                font-family: var(--font-space-grotesk);
                letter-spacing: 0.01em;
                --kiosk-panel: rgba(7, 12, 23, 0.82);
                --kiosk-panel-strong: rgba(12, 18, 32, 0.92);
                --kiosk-stroke: rgba(148, 163, 184, 0.16);
                --kiosk-glow: rgba(56, 189, 248, 0.35);
                --kiosk-accent: #60a5fa;
                --kiosk-accent-2: #a78bfa;
                --kiosk-success: #34d399;
              }
              .kiosk-heading {
                font-family: var(--font-orbitron);
                letter-spacing: 0.08em;
                text-transform: uppercase;
              }
              .kiosk-gradient {
                animation: gradientShift 18s ease infinite;
                background-size: 140% 140%;
              }
              .kiosk-scanlines {
                animation: scanlines 8s linear infinite;
              }
              @keyframes gradientShift {
                0% { transform: scale(1); opacity: 0.9; }
                50% { transform: scale(1.02); opacity: 1; }
                100% { transform: scale(1); opacity: 0.9; }
              }
              @keyframes scanlines {
                0% { transform: translateY(-30%); }
                100% { transform: translateY(30%); }
              }
            `,
        }}
      />
    </LocalDarkScheme>
  );
}
