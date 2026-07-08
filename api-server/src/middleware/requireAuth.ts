import type { Request, Response, NextFunction } from "express";
import { verifySessionToken, type SessionPayload } from "../lib/authJwt.js";

declare global {
  namespace Express {
    interface Request {
      lucyUser?: SessionPayload;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  const bearer = header?.startsWith("Bearer ") ? header.slice(7).trim() : null;
  const cookieToken =
    typeof req.headers.cookie === "string"
      ? req.headers.cookie
          .split(";")
          .map((c) => c.trim())
          .find((c) => c.startsWith("lucy_token="))
          ?.split("=")[1]
      : null;

  const token = bearer || cookieToken;
  if (!token) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }

  const payload = verifySessionToken(decodeURIComponent(token));
  if (!payload) {
    res.status(401).json({ error: "invalid_or_expired_token" });
    return;
  }

  req.lucyUser = payload;
  next();
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.lucyUser) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    if (roles.length > 0 && !roles.includes(req.lucyUser.role)) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    next();
  };
}
