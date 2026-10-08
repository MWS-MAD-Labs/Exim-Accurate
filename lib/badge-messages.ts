export type BadgeRefusal = "unknown" | "revoked" | "inactive";

// What the person at the counter reads when a badge is refused.
export function badgeRefusal(reason: BadgeRefusal): { code: string; error: string } {
  if (reason === "revoked") return { code: "BADGE_REVOKED", error: "Badge sudah dicabut, ambil badge baru di halaman staf." };
  if (reason === "inactive") return { code: "BADGE_INACTIVE", error: "Akses staf ini sudah tidak aktif." };
  return { code: "BADGE_UNKNOWN", error: "Badge tidak dikenali sebagai staf Exima." };
}
