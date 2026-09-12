import { NextFunction, Request, Response } from "express";
import { verifyAuthToken } from "../lib/auth";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: { userId: string; accountId: string };
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing bearer token" });
  }

  try {
    const payload = verifyAuthToken(header.slice("Bearer ".length));
    req.auth = { userId: payload.userId, accountId: payload.accountId };
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}
