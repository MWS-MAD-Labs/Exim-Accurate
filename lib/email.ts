import { createSign } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import nodemailer from "nodemailer";
import MailComposer from "nodemailer/lib/mail-composer";

// Email images are loaded from the app's public address, never attached, so the message has no attachments.
// Mail clients cannot reach localhost, so without an https address the logo falls back to plain text.
// EMAIL_ASSET_BASE_URL can point at another public host, otherwise NEXTAUTH_URL is used.
export function emailAssetUrl(file: string) {
  const base = (process.env.EMAIL_ASSET_BASE_URL || process.env.NEXTAUTH_URL || "").trim().replace(/\/+$/, "");
  if (!base.startsWith("https://")) return null;
  return `${base}/assets/${file}`;
}

// Text-only header for emails that carry no image (the allowance reminder), and the receipt's fallback.
export function sadeWordmark() {
  return `<span style="font-family:'Plus Jakarta Sans',Arial,sans-serif;font-size:28px;font-weight:800;color:#486142;letter-spacing:-0.5px;">Sade</span>`;
}

// The Sade logo for the receipt email. sade-logo-email.png is Sade-Logo.png scaled to 540x180 (3x for sharp screens).
export function sadeLogoImg(width = 168) {
  const height = Math.round(width / 3);
  const src = emailAssetUrl("sade-logo-email.png");
  if (!src) return sadeWordmark();
  return `<img src="${src}" alt="Sade" width="${width}" height="${height}" style="display:block;width:${width}px;height:${height}px;border:0;outline:none;text-decoration:none;">`;
}

export type EmailMessage = { to: string; subject: string; text: string; html: string };
export type EmailResult = { provider: "gmail" | "smtp"; id: string | null; accepted: string[]; rejected: string[] };

function env(name: string) {
  return process.env[name]?.trim() || "";
}

// EMAIL_PROVIDER=gmail (the default) sends through the Gmail API with a service account; smtp is kept to fall back to.
function emailProvider(): "gmail" | "smtp" {
  const provider = (env("EMAIL_PROVIDER") || "gmail").toLowerCase();
  if (provider === "gmail" || provider === "smtp") return provider;
  throw new Error(`EMAIL_PROVIDER must be gmail or smtp, not "${provider}"`);
}

// ---------------------------------------------------------------------------------------------------------------
// Gmail API with a service account. The service account acts as GMAIL_SENDER_EMAIL through domain-wide delegation:
// a Workspace admin allows its client ID the scope https://www.googleapis.com/auth/gmail.send.
// The key comes from GMAIL_CREDENTIALS_JSON (the JSON itself or base64 of it, for servers where the file is not in the
// image) or from the file at GMAIL_CREDENTIALS_FILE (SADE_GMAIL_CREDENTIALS_FILE is read as another name for it).

const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.send";

export type ServiceAccount = { client_email: string; private_key: string; token_uri?: string };

export function parseServiceAccount(raw: string): ServiceAccount {
  const text = raw.trim().startsWith("{") ? raw : Buffer.from(raw.trim(), "base64").toString("utf8");
  let parsed: Partial<ServiceAccount> & { type?: string };
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Gmail service account credentials are not valid JSON");
  }
  if (parsed.type !== "service_account" || !parsed.client_email || !parsed.private_key) {
    throw new Error("Gmail credentials must be a service account key with client_email and private_key");
  }
  return { client_email: parsed.client_email, private_key: parsed.private_key, token_uri: parsed.token_uri };
}

let serviceAccount: ServiceAccount | null = null;

function loadServiceAccount(): ServiceAccount {
  if (serviceAccount) return serviceAccount;
  const inline = env("GMAIL_CREDENTIALS_JSON");
  if (inline) return (serviceAccount = parseServiceAccount(inline));
  const file = env("GMAIL_CREDENTIALS_FILE") || env("SADE_GMAIL_CREDENTIALS_FILE");
  if (!file) throw new Error("GMAIL_CREDENTIALS_JSON or GMAIL_CREDENTIALS_FILE is required for Gmail delivery");
  let raw: string;
  try {
    raw = readFileSync(path.resolve(process.cwd(), file), "utf8");
  } catch {
    throw new Error(`Gmail credentials file not found at ${file}`);
  }
  return (serviceAccount = parseServiceAccount(raw));
}

function base64Url(input: Buffer | string) {
  return Buffer.from(input).toString("base64url");
}

// The signed JWT the service account trades for an access token (OAuth 2.0 JWT bearer grant).
export function serviceAccountAssertion(account: ServiceAccount, subject: string, now = Math.floor(Date.now() / 1000)) {
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64Url(
    JSON.stringify({
      iss: account.client_email,
      sub: subject,
      scope: GMAIL_SCOPE,
      aud: account.token_uri || "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  );
  const signature = createSign("RSA-SHA256").update(`${header}.${claims}`).sign(account.private_key);
  return `${header}.${claims}.${base64Url(signature)}`;
}

let cachedToken: { value: string; subject: string; expiresAt: number } | null = null;

async function gmailAccessToken(account: ServiceAccount, subject: string, fetchImpl: typeof fetch) {
  if (cachedToken && cachedToken.subject === subject && cachedToken.expiresAt - 60_000 > Date.now()) {
    return cachedToken.value;
  }
  const response = await fetchImpl(account.token_uri || "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: serviceAccountAssertion(account, subject),
    }),
    signal: AbortSignal.timeout(10_000),
  });
  const body = (await response.json().catch(() => null)) as
    | { access_token?: string; expires_in?: number; error?: string; error_description?: string }
    | null;
  if (!response.ok || !body?.access_token) {
    // unauthorized_client here usually means domain-wide delegation is not set up for this client ID and scope.
    const reason = body?.error_description || body?.error || `HTTP ${response.status}`;
    throw new Error(`Gmail token request failed for ${subject}: ${reason}`);
  }
  cachedToken = { value: body.access_token, subject, expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000 };
  return body.access_token;
}

function senderAddress() {
  const email = env("GMAIL_SENDER_EMAIL");
  if (!email) throw new Error("GMAIL_SENDER_EMAIL is required for Gmail delivery");
  return email;
}

// The From line. GMAIL_SENDER_NAME, then EMAIL_FROM / SMTP_FROM as a whole "Name <address>", then the default.
function fromLine(address: string) {
  const name = env("GMAIL_SENDER_NAME");
  if (name) return `${name.replace(/["\\]/g, "")} <${address}>`;
  return env("EMAIL_FROM") || env("SMTP_FROM") || `Sade Notifications <${address}>`;
}

export async function sendWithGmail(message: EmailMessage, fetchImpl: typeof fetch = fetch): Promise<EmailResult> {
  const sender = senderAddress();
  const account = loadServiceAccount();
  const raw = await new MailComposer({ from: fromLine(sender), ...message }).compile().build();
  const token = await gmailAccessToken(account, sender, fetchImpl);
  const response = await fetchImpl("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ raw: base64Url(raw) }),
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await response.json().catch(() => null)) as { id?: string; error?: { message?: string } } | null;
  if (!response.ok || !body?.id) {
    throw new Error(`Gmail send failed: ${body?.error?.message || `HTTP ${response.status}`}`);
  }
  return { provider: "gmail", id: body.id, accepted: [message.to], rejected: [] };
}

// ---------------------------------------------------------------------------------------------------------------
// SMTP, only when EMAIL_PROVIDER=smtp.

let transporter: nodemailer.Transporter | null = null;

function requireSmtp(name: "SMTP_USER" | "SMTP_PASSWORD") {
  const value = env(name);
  if (!value) throw new Error(`${name} is required for SMTP delivery`);
  return value;
}

async function sendWithSmtp(message: EmailMessage): Promise<EmailResult> {
  const user = requireSmtp("SMTP_USER");
  transporter ??= nodemailer.createTransport({
    host: env("SMTP_HOST") || "smtp.gmail.com",
    port: Number(env("SMTP_PORT") || 465),
    secure: (env("SMTP_SECURE") || "true").toLowerCase() === "true",
    auth: { user, pass: requireSmtp("SMTP_PASSWORD") },
  });
  const info = await transporter.sendMail({ from: env("SMTP_FROM") || `Sade Notifications <${user}>`, ...message });
  const list = (value: unknown) => (Array.isArray(value) ? value.map(String) : []);
  return { provider: "smtp", id: info.messageId ?? null, accepted: list(info.accepted), rejected: list(info.rejected) };
}

export async function sendEmail(message: EmailMessage): Promise<EmailResult> {
  return emailProvider() === "smtp" ? sendWithSmtp(message) : sendWithGmail(message);
}
