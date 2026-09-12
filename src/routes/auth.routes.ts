import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/db";
import { hashPassword, signAuthToken, verifyPassword } from "../lib/auth";

export const authRouter = Router();

const signupSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email(),
  password: z.string().min(8).max(200),
  accountName: z.string().min(1).max(200),
});

authRouter.post("/signup", async (req, res) => {
  const parsed = signupSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { name, email, password, accountName } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return res.status(409).json({ error: "An account with this email already exists" });
  }

  const passwordHash = await hashPassword(password);

  const { user, account } = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({ data: { name, email, passwordHash } });
    const account = await tx.account.create({
      data: { name: accountName, ownerId: user.id },
    });
    await tx.accountMember.create({
      data: { accountId: account.id, userId: user.id, role: "OWNER" },
    });
    return { user, account };
  });

  const token = signAuthToken({ userId: user.id, accountId: account.id });
  res.status(201).json({
    token,
    user: { id: user.id, name: user.name, email: user.email },
    account: { id: account.id, name: account.name, planTier: account.planTier },
  });
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

authRouter.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({
    where: { email },
    include: { memberships: { include: { account: true }, take: 1 } },
  });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  const membership = user.memberships[0];
  if (!membership) {
    return res.status(403).json({ error: "This user has no account membership" });
  }

  const token = signAuthToken({ userId: user.id, accountId: membership.accountId });
  res.json({
    token,
    user: { id: user.id, name: user.name, email: user.email },
    account: { id: membership.account.id, name: membership.account.name, planTier: membership.account.planTier },
  });
});
