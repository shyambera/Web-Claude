import { Router } from "express";
import { prisma } from "../lib/db";
import { requireAuth } from "../middleware/requireAuth";

export const incidentsRouter = Router();
incidentsRouter.use(requireAuth);

incidentsRouter.get("/", async (req, res) => {
  const incidents = await prisma.incident.findMany({
    where: { monitor: { accountId: req.auth!.accountId } },
    orderBy: { startedAt: "desc" },
    take: 100,
    include: { monitor: { select: { id: true, name: true, targetUrl: true } } },
  });

  res.json(incidents);
});
