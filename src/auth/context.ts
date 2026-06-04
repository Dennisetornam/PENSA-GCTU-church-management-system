// Request auth context + permission guards, from the access JWT (cookie or Bearer).
import type { MiddlewareHandler } from "hono";
import { verifyAccessToken, type AccessScope } from "./jwt";
import { readCookie, AT_COOKIE } from "./cookies";
import { can, type Permission, type Role, type Scope } from "../rbac/permissions";
import type { Env, Variables } from "../types";

export class UnauthorizedError extends Error {}
export class ForbiddenError extends Error {}

export interface AuthContext {
  userId: string;
  role: Role;
  scope: AccessScope;
  jti: string;
}

function bearer(req: Request): string | null {
  const h = req.headers.get("authorization");
  if (h?.startsWith("Bearer ")) return h.slice(7);
  return readCookie(req, AT_COOKIE);
}

export async function getAuth(req: Request, secret: string): Promise<AuthContext | null> {
  const token = bearer(req);
  if (!token) return null;
  try {
    const c = await verifyAccessToken(token, secret);
    return { userId: c.sub, role: c.role as Role, scope: c.scope, jti: c.jti };
  } catch {
    return null;
  }
}

export function requireUser(auth: AuthContext | null): AuthContext {
  if (!auth) throw new UnauthorizedError("authentication required");
  return auth;
}

export function requirePermission(auth: AuthContext | null, perm: Permission): Scope {
  const a = requireUser(auth);
  const scope = can(a.role, perm);
  if (!scope) throw new ForbiddenError(`missing permission: ${perm}`);
  return scope;
}

/** Hono middleware: populate c.var.auth (401 if no/invalid token). */
export function requireAuth(): MiddlewareHandler<{ Bindings: Env; Variables: Variables }> {
  return async (c, next) => {
    const auth = await getAuth(c.req.raw, c.env.JWT_SECRET);
    if (!auth) return c.json({ error: "unauthorized" }, 401);
    c.set("userId", auth.userId);
    c.set("role", auth.role);
    await next();
  };
}
