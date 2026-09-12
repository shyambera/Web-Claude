import twilio from "twilio";
import { env } from "../lib/env";

const client =
  env.twilioAccountSid && env.twilioAuthToken ? twilio(env.twilioAccountSid, env.twilioAuthToken) : null;

export interface SendAlertResult {
  status: "sent" | "logged" | "failed";
}

/**
 * Sends an SMS alert via Twilio, or logs it to the console when Twilio
 * isn't configured. India deployments should swap this for an MSG91
 * adapter (spec Section 9.2) — Indian SMS delivery requires DLT sender-ID
 * and template registration that Twilio's generic API doesn't handle.
 */
export async function sendSmsAlert(toPhoneNumber: string, text: string): Promise<SendAlertResult> {
  if (!client || !env.twilioSmsFrom) {
    console.log(`\n[sms:dev-mode] To: ${toPhoneNumber}\n\n${text}\n`);
    return { status: "logged" };
  }

  try {
    await client.messages.create({
      from: env.twilioSmsFrom,
      to: toPhoneNumber,
      body: text,
    });
    return { status: "sent" };
  } catch (err) {
    console.error("Failed to send SMS alert:", err);
    return { status: "failed" };
  }
}
