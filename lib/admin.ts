import { getPrincipalWithPermission } from "@/lib/principal";

export async function getCurrentAdmin() {
  return getPrincipalWithPermission("app.admin");
}
