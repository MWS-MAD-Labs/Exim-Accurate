import { ReactNode } from "react";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import type { Metadata } from "next";
import { authOptions } from "@/lib/auth";
import { KioskNotifications } from "../kiosk/kiosk-notifications";
import { LocalDarkScheme } from "@/components/LocalDarkScheme";

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

  return (
    <LocalDarkScheme
      style={{
        minHeight: "100vh",
        width: "100vw",
        background: "#05070f",
        display: "flex",
        flexDirection: "column",
        color: "white",
      }}
    >
      <KioskNotifications />
      {children}
    </LocalDarkScheme>
  );
}
