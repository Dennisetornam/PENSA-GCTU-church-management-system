// Finance step-up gate. A separate, confidential login (credentials stored as
// Cloudflare secrets, never in the repo) that must be passed before the Finance
// section's UI OR API will reveal anything. Backed by a short-lived signed
// cookie so the lock survives a page refresh but re-prompts after the TTL.
import { SignJWT, jwtVerify } from "jose";
import type { MiddlewareHandler } from "hono";
import { readCookie } from "./cookies";
import type { Env, Variables } from "../types";

export const FIN_COOKIE = "__Host-fin";
const ISS = "pensa-gctu";
const AUD = "pensa-gctu-finance";
export const FIN_TTL_SECONDS = 8 * 60 * 60; // 8 hours
const key = (secret: string) => new TextEncoder().encode(secret);

export async function signFinanceToken(sub: string, secret: string): Promise<string> {
  return new SignJWT({ fin: true })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(sub)
    .setIssuer(ISS)
    .setAudience(AUD)
    .setIssuedAt()
    .setExpirationTime(`${FIN_TTL_SECONDS}s`)
    .sign(key(secret));
}

export async function isFinanceUnlocked(req: Request, secret: string): Promise<boolean> {
  const token = readCookie(req, FIN_COOKIE);
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, key(secret), { issuer: ISS, audience: AUD });
    return payload.fin === true;
  } catch {
    return false;
  }
}

export function financeCookie(token: string): string {
  return `${FIN_COOKIE}=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${FIN_TTL_SECONDS}`;
}

export function clearFinanceCookie(): string {
  return `${FIN_COOKIE}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`;
}

/** Hono middleware: 403 unless the finance gate has been unlocked this session. */
export function requireFinanceUnlock(): MiddlewareHandler<{ Bindings: Env; Variables: Variables }> {
  return async (c, next) => {
    if (!(await isFinanceUnlocked(c.req.raw, c.env.JWT_SECRET))) {
      return c.json({ error: "finance_locked" }, 403);
    }
    await next();
  };
}
