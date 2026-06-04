// Hono middleware that enforces a LimitRule via the RateLimiter Durable Object.
// Generic and dependency-injected so it is testable and reusable across routes.

import type { Context, MiddlewareHandler } from "hono";
import type { Env, Variables } from "../types";
import type { LimitRule } from "./config";

type AppContext = Context<{ Bindings: Env; Variables: Variables }>;

export interface RateLimitDeps {
  /** Hook to record a violation (e.g. write to audit_log). */
  onViolation?: (c: AppContext, info: { rule: LimitRule; key: string; ip: string }) => Promise<void> | void;
}

function clientIp(c: AppContext): string {
  return c.req.header("CF-Connecting-IP") ?? c.req.header("X-Forwarded-For") ?? "unknown";
}

/**
 * Build a Hono middleware that applies `rule`. IP-scoped rules key on the client
 * IP; user-scoped rules key on the authenticated admin user id (falling back to
 * IP if somehow unauthenticated, so the route is never left unprotected).
 */
export function rateLimit(rule: LimitRule, deps: RateLimitDeps = {}): MiddlewareHandler<{ Bindings: Env; Variables: Variables }> {
  return async (c, next) => {
    const ip = clientIp(c);
    const principal = rule.scope === "ip" ? ip : (c.get("userId") ?? ip);
    const key = `${rule.name}:${rule.scope}:${principal}`;

    const ns = c.env.RATE_LIMITER;
    const stub = ns.get(ns.idFromName(key));
    const res = await stub.limit({ key, limit: rule.limit, windowMs: rule.windowMs });

    // Standard, observable rate-limit headers on every response.
    const resetSec = Math.max(0, Math.ceil((res.resetAtMs - Date.now()) / 1000));
    c.header("RateLimit-Limit", String(res.limit));
    c.header("RateLimit-Remaining", String(res.remaining));
    c.header("RateLimit-Reset", String(resetSec));

    if (!res.allowed) {
      if (deps.onViolation) await deps.onViolation(c, { rule, key, ip });
      c.header("Retry-After", String(res.retryAfterSec));
      return c.json(
        {
          error: "rate_limited",
          message: "Too many requests. Please try again later.",
          retryAfter: res.retryAfterSec,
        },
        429,
      );
    }

    await next();
  };
}

/** Default violation logger: append-only row in the audit_log table. */
export async function auditViolation(
  c: AppContext,
  info: { rule: LimitRule; key: string; ip: string },
): Promise<void> {
  await c.env.DB.prepare(
    `INSERT INTO audit_log (id, action, entity_type, summary, ip, user_agent, created_at)
     VALUES (lower(hex(randomblob(16))), ?, 'rate_limit', ?, ?, ?, datetime('now'))`,
  )
    .bind(
      "ratelimit.exceeded",
      `rule=${info.rule.name} scope=${info.rule.scope} limit=${info.rule.limit} key=${info.key}`,
      info.ip,
      c.req.header("user-agent") ?? null,
    )
    .run();
}
