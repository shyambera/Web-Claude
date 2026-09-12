import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  databaseUrl: required("DATABASE_URL"),
  redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",
  jwtSecret: required("JWT_SECRET"),
  port: Number(process.env.PORT ?? 4000),
  smtpHost: process.env.SMTP_HOST || null,
  smtpPort: Number(process.env.SMTP_PORT ?? 587),
  smtpUser: process.env.SMTP_USER || null,
  smtpPassword: process.env.SMTP_PASSWORD || null,
  alertsFromEmail: process.env.ALERTS_FROM_EMAIL ?? "alerts@monitoring.local",
  schedulerPollIntervalMs: Number(process.env.SCHEDULER_POLL_INTERVAL_MS ?? 5000),
};
