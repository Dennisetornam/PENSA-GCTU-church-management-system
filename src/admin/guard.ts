// INTERIM admin guard — shared-secret header check.
// TEMPORARY: to be replaced by the Phase-1 JWT auth + RBAC middleware
// (see docs/architecture/auth-design.md). Keeps admin endpoints closed on
// staging until real authentication lands.
import type { MiddlewareHandler } from "hono";
import type { Env, Variables } from "../types";

export const requireAdminToken: MiddlewareHandler<{ Bindings: Env; Variables: Variables }> = async (c, next) => {
  const provided = c.req.header("X-Admin-Token")?.trim();
  const expected = c.env.ADMIN_API_TOKEN?.trim();
  if (!expected || !provided || provided !== expected) {
    return c.json({ error: "unauthorized" }, 401);
  }
  await next();
};
