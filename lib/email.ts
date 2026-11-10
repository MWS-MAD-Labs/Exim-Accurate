import nodemailer from "nodemailer";

let transporter: nodemailer.Transporter | null = null;

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

function requireEmailEnvironment(name: "SMTP_USER" | "SMTP_PASSWORD") {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for email delivery`);
  return value;
}

export function getEmailTransporter() {
  if (transporter) return transporter;

  const user = requireEmailEnvironment("SMTP_USER");
  const password = requireEmailEnvironment("SMTP_PASSWORD");
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST?.trim() || "smtp.gmail.com",
    port: Number(process.env.SMTP_PORT || 465),
    secure: (process.env.SMTP_SECURE || "true").toLowerCase() === "true",
    auth: { user, pass: password },
  });
  return transporter;
}

export async function sendEmail(message: { to: string; subject: string; text: string; html: string }) {
  const user = requireEmailEnvironment("SMTP_USER");
  return getEmailTransporter().sendMail({
    from: process.env.SMTP_FROM?.trim() || `Sade Notifications <${user}>`,
    ...message,
  });
}
