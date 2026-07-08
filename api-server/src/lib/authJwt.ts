import crypto from "crypto";

export interface SessionPayload {
  userId: string;
  email: string;
  role: string;
  exp: number;
}

function getSecret(): string {
  const secret =
    process.env["SESSION_SECRET"]?.trim() ||
    process.env["LUCY_SESSION_SECRET"]?.trim() ||
    "";
  if (!secret) {
    throw new Error("SESSION_SECRET no configurado");
  }
  return secret;
}

function b64url(data: string): string {
  return Buffer.from(data, "utf-8").toString("base64url");
}

function b64urlDecode(data: string): string {
  return Buffer.from(data, "base64url").toString("utf-8");
}

export function signSessionToken(payload: Omit<SessionPayload, "exp">, ttlDays = 7): string {
  const body: SessionPayload = {
    ...payload,
    exp: Date.now() + ttlDays * 24 * 60 * 60 * 1000,
  };
  const encoded = b64url(JSON.stringify(body));
  const sig = crypto.createHmac("sha256", getSecret()).update(encoded).digest("base64url");
  return `${encoded}.${sig}`;
}

export function verifySessionToken(token: string): SessionPayload | null {
  try {
    const secret = process.env["SESSION_SECRET"]?.trim() || process.env["LUCY_SESSION_SECRET"]?.trim();
    if (!secret) return null;

    const [encoded, sig] = token.split(".");
    if (!encoded || !sig) return null;

    const expected = crypto.createHmac("sha256", secret).update(encoded).digest("base64url");
    if (sig.length !== expected.length) return null;
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;

    const payload = JSON.parse(b64urlDecode(encoded)) as SessionPayload;
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export function isAuthConfigured(): boolean {
  return !!(process.env["SESSION_SECRET"]?.trim() || process.env["LUCY_SESSION_SECRET"]?.trim());
}
