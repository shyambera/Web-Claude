-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AlertChannel" ADD VALUE 'WHATSAPP';
ALTER TYPE "AlertChannel" ADD VALUE 'SMS';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "MonitorType" ADD VALUE 'SSL';
ALTER TYPE "MonitorType" ADD VALUE 'DOMAIN';

-- AlterTable
ALTER TABLE "accounts" ADD COLUMN     "alertPhoneNumber" TEXT;

-- AlterTable
ALTER TABLE "check_results" ADD COLUMN     "certDaysRemaining" INTEGER,
ADD COLUMN     "certExpiresAt" TIMESTAMP(3),
ADD COLUMN     "certFingerprint" TEXT,
ADD COLUMN     "certIssuer" TEXT,
ADD COLUMN     "domainDaysRemaining" INTEGER,
ADD COLUMN     "domainExpiresAt" TIMESTAMP(3),
ADD COLUMN     "registrar" TEXT;

-- CreateTable
CREATE TABLE "snapshots" (
    "id" TEXT NOT NULL,
    "monitorId" TEXT NOT NULL,
    "snapshotType" TEXT NOT NULL,
    "dataJson" JSONB NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expiry_alert_states" (
    "id" TEXT NOT NULL,
    "monitorId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "thresholdDays" INTEGER NOT NULL,
    "targetDate" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expiry_alert_states_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "snapshots_monitorId_snapshotType_capturedAt_idx" ON "snapshots"("monitorId", "snapshotType", "capturedAt");

-- CreateIndex
CREATE UNIQUE INDEX "expiry_alert_states_monitorId_kind_thresholdDays_targetDate_key" ON "expiry_alert_states"("monitorId", "kind", "thresholdDays", "targetDate");

-- AddForeignKey
ALTER TABLE "snapshots" ADD CONSTRAINT "snapshots_monitorId_fkey" FOREIGN KEY ("monitorId") REFERENCES "monitors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expiry_alert_states" ADD CONSTRAINT "expiry_alert_states_monitorId_fkey" FOREIGN KEY ("monitorId") REFERENCES "monitors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
