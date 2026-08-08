import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { canUseStaffStore, getRoleHome } from "@/lib/access-control";

export default async function StoreLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/login?callbackUrl=/store");
  }
  if (!canUseStaffStore(session.user.role)) {
    redirect(getRoleHome(session.user.role));
  }

  return children;
}
