import { redirect } from "next/navigation";
import { DashboardLayout } from "@/components/DashboardLayout";
import { getCurrentAdmin } from "@/lib/admin";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const admin = await getCurrentAdmin();

  if (!admin) {
    redirect("/dashboard");
  }

  return <DashboardLayout>{children}</DashboardLayout>;
}
