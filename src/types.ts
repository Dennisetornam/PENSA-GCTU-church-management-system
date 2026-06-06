// Worker environment bindings (kept in one place; mirrors wrangler.toml).
import type { RateLimiter } from "./rate-limit/rate-limiter.do";

export interface Env {
  // Data
  DB: D1Database;
  MEDIA: R2Bucket;
  KV: KVNamespace;

  // Durable Objects
  RATE_LIMITER: DurableObjectNamespace<RateLimiter>;

  // Secrets (wrangler secret put …)
  JWT_SECRET: string;
  TURNSTILE_SECRET: string;
  // Public Turnstile site key (non-secret; exposed to the registration form).
  TURNSTILE_SITE_KEY?: string;
  // INTERIM: shared-secret guard for admin endpoints until Phase-1 JWT auth lands.
  ADMIN_API_TOKEN?: string;
}

// Per-request values set by upstream middleware (e.g. auth).
export interface Variables {
  /** Authenticated admin/leader user id, or null for public routes. */
  userId: string | null;
  /** Authenticated user's role, when present. */
  role: string | null;
}
