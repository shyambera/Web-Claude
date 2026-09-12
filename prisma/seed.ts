import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = "demo@monitoring.local";
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log("Demo user already exists, skipping seed.");
    return;
  }

  const passwordHash = await bcrypt.hash("password123", 10);
  const user = await prisma.user.create({
    data: { name: "Demo User", email, passwordHash },
  });
  const account = await prisma.account.create({
    data: { name: "Demo Co", ownerId: user.id },
  });
  await prisma.accountMember.create({
    data: { accountId: account.id, userId: user.id, role: "OWNER" },
  });
  await prisma.monitor.create({
    data: {
      accountId: account.id,
      name: "Example Site",
      targetUrl: "https://example.com",
      checkIntervalSec: 60,
      nextRunAt: new Date(),
    },
  });

  console.log(`Seeded demo account. Sign in with ${email} / password123`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
