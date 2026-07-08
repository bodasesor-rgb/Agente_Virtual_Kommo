import { Router, type Request, type Response } from "express";
import { db, users } from "@workspace/db";
import { eq, sql, count } from "drizzle-orm";
import crypto from "crypto";
import { signSessionToken, isAuthConfigured } from "../lib/authJwt.js";

const router = Router();

function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password).digest("hex");
}

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/auth/login
// ═══════════════════════════════════════════════════════════════════════════
router.post("/auth/login", async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body as { email?: string; password?: string };

    if (!email || !password) {
      res.status(400).json({ error: "Email y contraseña requeridos" });
      return;
    }

    const user = await db.query.users.findFirst({
      where: eq(users.email, email),
    });

    if (!user || user.passwordHash !== hashPassword(password)) {
      res.status(401).json({ error: "Credenciales inválidas" });
      return;
    }

    await db
      .update(users)
      .set({ lastLoginAt: new Date() })
      .where(eq(users.id, user.id));

    const token = isAuthConfigured()
      ? signSessionToken({
          userId: user.id,
          email: user.email,
          role: user.role,
        })
      : crypto.randomBytes(32).toString("hex");

    res.json({
      token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    });
  } catch (err) {
    req.log?.error(err);
    res.status(500).json({ error: "Error al iniciar sesión" });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/auth/create-user - Setup inicial (sin protección — usar solo una vez)
// ═══════════════════════════════════════════════════════════════════════════
router.post("/auth/create-user", async (req: Request, res: Response) => {
  try {
    const allowBootstrap = process.env["ALLOW_USER_BOOTSTRAP"] === "true";
    const [{ value: userCount }] = await db.select({ value: count() }).from(users);
    if (!allowBootstrap && Number(userCount) > 0) {
      res.status(403).json({ error: "bootstrap_disabled" });
      return;
    }

    const { email, password, name, role = "admin" } = req.body as {
      email?: string; password?: string; name?: string; role?: string;
    };

    if (!email || !password || !name) {
      res.status(400).json({ error: "Email, password y name requeridos" });
      return;
    }

    const existing = await db.query.users.findFirst({
      where: eq(users.email, email),
    });

    if (existing) {
      res.status(400).json({ error: "Usuario ya existe" });
      return;
    }

    const [newUser] = await db
      .insert(users)
      .values({ email, passwordHash: hashPassword(password), name, role })
      .returning();

    res.json({
      user: {
        id: newUser!.id,
        email: newUser!.email,
        name: newUser!.name,
        role: newUser!.role,
      },
    });
  } catch (err) {
    req.log?.error(err);
    res.status(500).json({ error: "Error al crear usuario" });
  }
});

// GET /api/auth/me — validar sesión del admin
router.get("/auth/me", async (req: Request, res: Response) => {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7).trim() : null;
  if (!token) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  const { verifySessionToken } = await import("../lib/authJwt.js");
  const payload = verifySessionToken(token);
  if (!payload) {
    res.status(401).json({ error: "invalid_or_expired_token" });
    return;
  }
  const [user] = await db.select().from(users).where(eq(users.id, payload.userId)).limit(1);
  if (!user) {
    res.status(401).json({ error: "user_not_found" });
    return;
  }
  res.json({
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
  });
});

export default router;
