import nodemailer, { Transporter } from "nodemailer";
import { env } from "../lib/env";

let transporter: Transporter | null = null;
if (env.smtpHost) {
  transporter = nodemailer.createTransport({
    host: env.smtpHost,
    port: env.smtpPort,
    secure: env.smtpPort === 465,
    auth: env.smtpUser ? { user: env.smtpUser, pass: env.smtpPassword ?? undefined } : undefined,
  });
}

export interface SendAlertResult {
  status: "sent" | "logged" | "failed";
}

/**
 * Sends an alert email, or logs it to the console when no SMTP provider is
 * configured — keeps local development and the MVP demo path working
 * without requiring Amazon SES credentials up front (spec Section 4.1).
 */
export async function sendAlertEmail(to: string, subject: string, text: string): Promise<SendAlertResult> {
  if (!transporter) {
    console.log(`\n[email:dev-mode] To: ${to}\nSubject: ${subject}\n\n${text}\n`);
    return { status: "logged" };
  }

  try {
    await transporter.sendMail({ from: env.alertsFromEmail, to, subject, text });
    return { status: "sent" };
  } catch (err) {
    console.error("Failed to send alert email:", err);
    return { status: "failed" };
  }
}
