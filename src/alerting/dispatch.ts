import { prisma } from "../lib/db";
import { sendAlertEmail } from "./email";
import { sendWhatsAppAlert } from "./whatsapp";
import { sendSmsAlert } from "./sms";

export interface AlertRecipient {
  ownerEmail: string;
  alertPhoneNumber: string | null;
}

/**
 * Sends one alert across every channel the account has configured — email
 * always, WhatsApp + SMS when a phone number is on file — and logs each
 * attempt to alert_log (spec Section 4: "Multi-channel ... Alert history").
 */
export async function dispatchAlert(params: {
  monitorId: string;
  incidentId?: string;
  recipient: AlertRecipient;
  subject: string;
  text: string;
}): Promise<void> {
  const { monitorId, incidentId, recipient, subject, text } = params;

  const emailResult = await sendAlertEmail(recipient.ownerEmail, subject, text);
  await prisma.alertLog.create({
    data: { monitorId, incidentId, channel: "EMAIL", recipient: recipient.ownerEmail, subject, status: emailResult.status },
  });

  if (!recipient.alertPhoneNumber) return;

  const [waResult, smsResult] = await Promise.all([
    sendWhatsAppAlert(recipient.alertPhoneNumber, text),
    sendSmsAlert(recipient.alertPhoneNumber, text),
  ]);

  await prisma.alertLog.createMany({
    data: [
      { monitorId, incidentId, channel: "WHATSAPP", recipient: recipient.alertPhoneNumber, subject, status: waResult.status },
      { monitorId, incidentId, channel: "SMS", recipient: recipient.alertPhoneNumber, subject, status: smsResult.status },
    ],
  });
}
