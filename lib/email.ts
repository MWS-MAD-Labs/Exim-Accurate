import nodemailer from "nodemailer";

let transporter: nodemailer.Transporter | null = null;

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
    from: process.env.SMTP_FROM?.trim() || `Exima Notifications <${user}>`,
    ...message,
  });
}
