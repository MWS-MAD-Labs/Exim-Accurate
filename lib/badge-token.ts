import { createHmac, timingSafeEqual } from "node:crypto";

// What a badge says. `exb1.<person id>.<version>.<signature>`: the signature is made with a
// secret only the server has, so typing somebody's email or id into the reader gets nothing.
// The version goes up to cancel the badges made before it (a lost card).
const PREFIX = "exb1";
const SIGNATURE_LENGTH = 22;

function secret() {
  const value = process.env.EXIMA_BADGE_SECRET?.trim();
  return value && value.length >= 16 ? value : null;
}

export function badgeSecretConfigured() {
  return secret() !== null;
}

function sign(key: string, personId: string, version: number) {
  return createHmac("sha256", key).update(`${PREFIX}.${personId}.${version}`).digest("base64url").slice(0, SIGNATURE_LENGTH);
}

export function issueBadgeToken(personId: string, version: number): string {
  const key = secret();
  if (!key) throw new Error("EXIMA_BADGE_SECRET is not set (16 characters or more)");
  return `${PREFIX}.${personId}.${version}.${sign(key, personId, version)}`;
}

export type VerifiedBadge = { personId: string; version: number };

// null for anything that is not a badge made by this server, whatever the reason.
export function verifyBadgeToken(raw: string): VerifiedBadge | null {
  const key = secret();
  if (!key) return null;
  const parts = raw.trim().split(".");
  if (parts.length !== 4 || parts[0] !== PREFIX) return null;
  const [, personId, versionText, signature] = parts;
  const version = Number(versionText);
  if (!personId || !Number.isInteger(version) || version < 1 || signature.length !== SIGNATURE_LENGTH) return null;
  const expected = Buffer.from(sign(key, personId, version));
  const given = Buffer.from(signature);
  return given.length === expected.length && timingSafeEqual(given, expected) ? { personId, version } : null;
}

export function looksLikeBadgeToken(raw: string) {
  return raw.trim().startsWith(`${PREFIX}.`);
}
