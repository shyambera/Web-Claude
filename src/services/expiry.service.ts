import { Monitor } from "@prisma/client";
import { prisma } from "../lib/db";
import { dispatchAlert, AlertRecipient } from "../alerting/dispatch";

export const SSL_EXPIRY_THRESHOLDS_DAYS = [30, 14, 7, 1];
export const DOMAIN_EXPIRY_THRESHOLDS_DAYS = [60, 30, 14, 7];

/**
 * Sends exactly one expiry warning per check, for the most urgent threshold
 * newly crossed (the smallest configured threshold still >= daysRemaining).
 * Idempotent across repeated daily checks via the ExpiryAlertState unique
 * constraint — a renewed cert/domain gets a new expiresAt and so a fresh
 * set of thresholds to alert through. Matches spec Section 6 ("alerts at
 * 60/30/14/7 days") and Section 4 ("SSL expiry ... 30/14/7/1 days").
 */
export async function maybeAlertExpiry(
  monitor: Monitor,
  recipient: AlertRecipient,
  kind: "ssl_expiry" | "domain_expiry",
  expiresAt: Date,
  daysRemaining: number,
  thresholds: number[],
  subjectFor: (thresholdDays: number) => string,
  textFor: (thresholdDays: number) => string
): Promise<void> {
  const currentThreshold = thresholds.filter((t) => daysRemaining <= t).sort((a, b) => a - b)[0];
  if (currentThreshold === undefined) return;

  try {
    await prisma.expiryAlertState.create({
      data: { monitorId: monitor.id, kind, thresholdDays: currentThreshold, targetDate: expiresAt },
    });
  } catch (err) {
    // P2002 = unique constraint violation: this threshold was already
    // alerted for this exact expiry date, so there is nothing new to send.
    if ((err as { code?: string }).code === "P2002") return;
    throw err;
  }

  await dispatchAlert({
    monitorId: monitor.id,
    recipient,
    subject: subjectFor(currentThreshold),
    text: textFor(currentThreshold),
  });
}

/**
 * Certificate-change detection (spec Section 3.5): compares the new
 * SHA-256 fingerprint to the last stored snapshot and alerts on any
 * unexpected change (a reissue the operator didn't plan is a possible
 * compromise or misconfiguration signal). The first-ever check just
 * establishes the baseline silently — there is nothing to diff against yet.
 */
export async function checkCertificateChange(
  monitor: Monitor,
  recipient: AlertRecipient,
  fingerprint256: string,
  issuer: string | null
): Promise<void> {
  const previous = await prisma.snapshot.findFirst({
    where: { monitorId: monitor.id, snapshotType: "ssl_fingerprint" },
    orderBy: { capturedAt: "desc" },
  });

  const previousFingerprint = (previous?.dataJson as { fingerprint256?: string } | null)?.fingerprint256;

  if (previous && previousFingerprint && previousFingerprint !== fingerprint256) {
    await dispatchAlert({
      monitorId: monitor.id,
      recipient,
      subject: `[SECURITY] ${monitor.name} certificate changed unexpectedly`,
      text: `The TLS certificate for ${monitor.name} (${monitor.targetUrl}) changed.\n\nPrevious fingerprint: ${previousFingerprint}\nNew fingerprint: ${fingerprint256}\nNew issuer: ${issuer ?? "unknown"}\n\nIf this wasn't a planned renewal, investigate immediately — this can indicate a compromised certificate or a misconfiguration.`,
    });
  }

  if (!previous || previousFingerprint !== fingerprint256) {
    await prisma.snapshot.create({
      data: { monitorId: monitor.id, snapshotType: "ssl_fingerprint", dataJson: { fingerprint256, issuer } },
    });
  }
}
