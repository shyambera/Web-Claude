import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/db";
import { requireAuth } from "../middleware/requireAuth";

export const accountRouter = Router();
accountRouter.use(requireAuth);

accountRouter.get("/", async (req, res) => {
  const account = await prisma.account.findUniqueOrThrow({ where: { id: req.auth!.accountId } });
  res.json(account);
});

// E.164 phone number, e.g. +14155552671 or +919812345678 — the format
// Twilio's WhatsApp/SMS APIs require (spec Section 4.1).
const E164_PATTERN = /^\+[1-9]\d{7,14}$/;

const updateAccountSchema = z.object({
  alertPhoneNumber: z.union([z.string().regex(E164_PATTERN, "Use E.164 format, e.g. +14155552671"), z.null()]),
});

accountRouter.patch("/", async (req, res) => {
  const parsed = updateAccountSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const account = await prisma.account.update({
    where: { id: req.auth!.accountId },
    data: parsed.data,
  });

  res.json(account);
});
