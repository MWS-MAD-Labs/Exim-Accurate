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
        background: "var(--sade-espresso)",
        display: "flex",
        flexDirection: "column",
        color: "#F1F0E8",
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
            "radial-gradient(circle at 20% 20%, rgba(111, 139, 106, 0.2), transparent 46%), radial-gradient(circle at 82% 12%, rgba(214, 161, 58, 0.12), transparent 42%), linear-gradient(135deg, #1C2419 0%, #242E21 52%, #1C2419 100%)",
          pointerEvents: "none",
        }}
      />
      <div
        className="kiosk-grid"
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "linear-gradient(rgba(214, 161, 58, 0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(214, 161, 58, 0.025) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
          opacity: 0.18,
          pointerEvents: "none",
          maskImage:
            "radial-gradient(circle at center, black 0%, rgba(0,0,0,0.28) 55%, transparent 80%)",
        }}
      />
      <div
        className="kiosk-scanlines"
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(180deg, rgba(255,250,244,0.025) 0%, transparent 30%)",
          opacity: 0.2,
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
            "radial-gradient(circle, rgba(111, 139, 106, 0.12) 0%, transparent 70%)",
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
            "radial-gradient(circle, rgba(214, 161, 58, 0.1) 0%, transparent 70%)",
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
            "radial-gradient(circle, rgba(111, 139, 106, 0.07) 0%, transparent 60%)",
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
            "radial-gradient(ellipse at center, rgba(214, 161, 58, 0.1) 0%, transparent 70%)",
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
                font-family: var(--font-nunito-sans), "Nunito Sans", sans-serif;
                --kiosk-panel: rgba(43, 55, 38, 0.88);
                --kiosk-panel-strong: rgba(35, 47, 31, 0.96);
                --kiosk-stroke: rgba(230, 234, 223, 0.16);
                --kiosk-glow: rgba(111, 139, 106, 0.2);
                --kiosk-accent: #D6A13A;
                --kiosk-accent-2: #9DB18F;
                --kiosk-success: #9DB18F;
              }
              .kiosk-heading {
                font-family: var(--font-jakarta-sans), "Plus Jakarta Sans", sans-serif;
                letter-spacing: -0.02em;
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
