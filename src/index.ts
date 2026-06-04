// Example Hono application wiring the RateLimiter middleware onto the four
// protected endpoints. Route handlers are stubbed — this file demonstrates
// placement and limits only (business logic lands in later phases).

import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
import type { Env, Variables } from "./types";
import { RateLimiter } from "./rate-limit/rate-limiter.do";
import { rateLimit, auditViolation } from "./rate-limit/middleware";
import { LIMIT_RULES } from "./rate-limit/config";
import { registrationRoutes } from "./registration/routes";

// The Durable Object class must be exported from the Worker entry module.
export { RateLimiter };

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

const deps = { onViolation: auditViolation };

/**
 * Placeholder admin-auth gate. The real implementation (Phase 1) verifies the
 * access JWT and sets `userId`/`role`. Shown here so user-scoped limits have a
 * principal to key on.
 */
const requireAdmin: MiddlewareHandler<{ Bindings: Env; Variables: Variables }> = async (c, next) => {
  // TODO(phase-1): verify JWT from __Host-at cookie / Authorization header.
  // For now, read a trusted header set by upstream auth middleware.
  c.set("userId", c.req.header("X-Admin-User-Id") ?? null);
  c.set("role", c.req.header("X-Admin-Role") ?? null);
  await next();
};

// ── 1. Public Member Registration — multi-step + draft + image + submit ──────
//     (rate limiting is applied inside the registration sub-app per endpoint)
app.route("/register", registrationRoutes);

// ── 2. Admin Login — 5/15min/IP ──────────────────────────────────────────────
app.post("/auth/login", rateLimit(LIMIT_RULES.login, deps), (c) =>
  c.json({ ok: true }),
);

// ── 3. Member Search / Check-In — 300/hour/admin user (anti-scraping) ────────
app.use("/check-in", requireAdmin, rateLimit(LIMIT_RULES.checkin, deps));
app.get("/check-in", (c) => {
  const q = c.req.query("q") ?? "";
  // Looks up by full_name | phone_number | member_code (indexed columns).
  return c.json({ query: q, results: [] });
});

// ── 4. Attendance Submission — 500/hour/admin user ───────────────────────────
app.use("/attendance/*", requireAdmin, rateLimit(LIMIT_RULES.attendance, deps));
app.post("/attendance/mark", (c) => c.json({ ok: true }));
app.patch("/attendance/:id", (c) => c.json({ ok: true, id: c.req.param("id") }));

export default app;
