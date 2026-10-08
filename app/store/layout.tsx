import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { getRoleHome, hasPermission } from "@/lib/access-control";

export default async function StoreLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/login?callbackUrl=/store");
  }
  if (!hasPermission(session.user.permissions, "store.use")) {
    redirect(getRoleHome(session.user.role, session.user.permissions));
  }

  return children;
}
