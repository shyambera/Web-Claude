import { Monitor } from "@prisma/client";
import { prisma } from "../lib/db";
import { performSslCheck } from "../checks/sslCheck";
import { AlertRecipient } from "../alerting/dispatch";
import { evaluateIncidentState } from "./incidentState.service";
import { maybeAlertExpiry, checkCertificateChange, SSL_EXPIRY_THRESHOLDS_DAYS } from "./expiry.service";

export async function runSslCheck(monitor: Monitor, recipient: AlertRecipient): Promise<void> {
  const result = await performSslCheck(monitor.targetUrl);

  const status = result.ok ? "UP" : "DOWN";

  await prisma.checkResult.create({
    data: {
      monitorId: monitor.id,
      status,
      errorMessage: result.errorMessage,
      certExpiresAt: result.expiresAt,
      certDaysRemaining: result.daysRemaining,
      certIssuer: result.issuer,
      certFingerprint: result.fingerprint256,
    },
  });

  await evaluateIncidentState(
    monitor,
    status,
    result.errorMessage ?? "TLS handshake failed",
    recipient
  );

  if (!result.ok || !result.expiresAt || result.daysRemaining === null || !result.fingerprint256) {
    return;
  }

  await checkCertificateChange(monitor, recipient, result.fingerprint256, result.issuer);

  await maybeAlertExpiry(
    monitor,
    recipient,
    "ssl_expiry",
    result.expiresAt,
    result.daysRemaining,
    SSL_EXPIRY_THRESHOLDS_DAYS,
    (thresholdDays) =>
      result.daysRemaining! <= 0
        ? `[EXPIRED] ${monitor.name} certificate has expired`
        : `[SSL] ${monitor.name} certificate expires in ${thresholdDays} day${thresholdDays === 1 ? "" : "s"}`,
    () =>
      `The TLS certificate for ${monitor.name} (${monitor.targetUrl}) ${
        result.daysRemaining! <= 0 ? "has expired" : `expires in ${result.daysRemaining} day(s)`
      }, on ${result.expiresAt!.toISOString().slice(0, 10)}.\n\nIssuer: ${result.issuer ?? "unknown"}`
  );
}
