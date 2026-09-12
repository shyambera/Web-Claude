import twilio from "twilio";
import { env } from "../lib/env";

const client =
  env.twilioAccountSid && env.twilioAuthToken ? twilio(env.twilioAccountSid, env.twilioAuthToken) : null;

export interface SendAlertResult {
  status: "sent" | "logged" | "failed";
}

/**
 * Sends a WhatsApp alert via Twilio's WhatsApp Business API, or logs it to
 * the console when Twilio isn't configured — the India-first differentiator
 * from spec Section 4.1/9.2. Note WhatsApp requires Meta Business
 * verification and pre-approved message templates in production; outside a
 * sandbox, `to` also needs to have opted in first.
 */
export async function sendWhatsAppAlert(toPhoneNumber: string, text: string): Promise<SendAlertResult> {
  if (!client || !env.twilioWhatsappFrom) {
    console.log(`\n[whatsapp:dev-mode] To: ${toPhoneNumber}\n\n${text}\n`);
    return { status: "logged" };
  }

  try {
    await client.messages.create({
      from: `whatsapp:${env.twilioWhatsappFrom}`,
      to: `whatsapp:${toPhoneNumber}`,
      body: text,
    });
    return { status: "sent" };
  } catch (err) {
    console.error("Failed to send WhatsApp alert:", err);
    return { status: "failed" };
  }
}
