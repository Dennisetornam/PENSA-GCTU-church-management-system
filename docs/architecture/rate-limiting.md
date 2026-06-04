# PENSA GCTU CMS — Rate Limiting (RateLimiter Durable Object)

**Status:** Implemented · **Date:** 2026-06-04
**Code:** `src/rate-limit/*`, `src/index.ts`, `wrangler.toml` · **Tests:** `tests/rate-limit/*`

Protects the system from spam submissions, brute-force attacks, and member-record scraping. Members do **not** authenticate, so there is **no** invitation, password-reset, or member-login limiting — only the four endpoints below.

---

## 1. Protected endpoints & limits

| # | Endpoint | Limit | Keyed by |
|---|---|---|---|
| 1 | `POST /register` (public, QR) | 10 / hour | IP |
| 2 | `POST /auth/login` (admin) | 5 / 15 min | IP |
| 3 | `GET /check-in` (member search) | 300 / hour | admin user (anti-scraping) |
| 4 | `*/attendance/*` (mark/update) | 500 / hour | admin user |

Defined once in `src/rate-limit/config.ts` (`LIMIT_RULES`). **Adding a new limited endpoint = add one rule** — the DO and middleware are generic (future-proofing requirement satisfied).

---

## 2. Components

- **`src/rate-limit/window.ts`** — pure fixed-window math (`evaluateWindow`). No Workers deps → unit-tested in plain Node. Returns `{allowed, remaining, resetAtMs, retryAfterSec}` and auto-resets when the window elapses.
- **`src/rate-limit/rate-limiter.do.ts`** — the `RateLimiter` Durable Object. RPC method `limit({key, limit, windowMs})`; stores `{count, windowStartMs, windowMs}` per key in DO storage; sets a storage **alarm** to purge expired counters; `peek()` for inspection.
- **`src/rate-limit/middleware.ts`** — `rateLimit(rule, deps)` Hono middleware. Computes the key (`name:scope:principal`), calls the DO, sets `RateLimit-Limit/Remaining/Reset` headers, and on breach returns **HTTP 429** with `Retry-After` + JSON `{error:"rate_limited", retryAfter}`. `auditViolation` writes an append-only `audit_log` row.
- **`src/index.ts`** — example Hono app applying the middleware to all four routes; exports the `RateLimiter` class from the Worker entry.

**Why Durable Objects (not KV):** a single DO instance per key serializes increments, giving **race-free** counters. KV's eventual consistency would let parallel requests overshoot the limit.

**Consistency model:** one DO is addressed via `idFromName(key)`, so all hits for a given IP/user converge on the same instance globally.

---

## 3. Response contract

- **Allowed:** request proceeds; headers `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset` (seconds).
- **Blocked:** `429 Too Many Requests`, header `Retry-After: <seconds>`, body:
  ```json
  { "error": "rate_limited", "message": "Too many requests. Please try again later.", "retryAfter": 740 }
  ```
- **Audit:** each violation appends `audit_log(action='ratelimit.exceeded', entity_type='rate_limit', summary, ip, user_agent)`.

---

## 4. Wrangler configuration & bindings

`wrangler.toml` declares the DO binding and the SQLite-backed migration:
```toml
[[durable_objects.bindings]]
name = "RATE_LIMITER"
class_name = "RateLimiter"

[[migrations]]
tag = "v1"
new_sqlite_classes = ["RateLimiter"]
```
Env bindings are typed in `src/types.ts` (`Env.RATE_LIMITER: DurableObjectNamespace<RateLimiter>`), and replicated under `[env.staging]` and `[env.production]`. Secrets (`JWT_SECRET`, `TURNSTILE_SECRET`) are set via `wrangler secret put`, never committed.

---

## 5. Future expansion (no architecture change)

- **New endpoint:** add a `LimitRule` to `LIMIT_RULES`, attach `rateLimit(rule)` to the route.
- **New scope (e.g. per-department):** add a scope value + principal resolver in the middleware; DO and storage are unchanged.
- **Sliding window / token bucket:** swap `evaluateWindow` for an alternative pure function; the DO contract (`limit()`) stays identical.
- **Tiered limits / allow-lists:** branch on principal in the middleware before calling the DO.

---

## 6. Testing Strategy

**Layer 1 — pure unit tests (fast, no infra):** `tests/rate-limit/window.test.ts` exercises `evaluateWindow` for allow-up-to-limit, block, `retryAfter`, and auto-reset. Runnable in Node directly (already verified) and under Vitest.

**Layer 2 — Durable Object integration:** `tests/rate-limit/rate-limiter.test.ts` runs in the real Workers runtime via `@cloudflare/vitest-pool-workers`:
- calls `stub.limit(...)` past the limit → asserts `allowed=false`, `remaining=0`, `retryAfterSec>0`;
- `runInDurableObject` + `alarm()` → asserts expired keys are purged.

**Layer 3 — middleware end-to-end:** drives the Hono `app.fetch()`:
- 6× `/auth/login` from one IP → `429` + `Retry-After` + `{error:"rate_limited"}`;
- 12× `/register` from one IP → exactly 10 allowed;
- asserts an `audit_log` row with `action='ratelimit.exceeded'` is written.

**Layer 4 — manual smoke (staging):** `for ($i=0;$i -lt 6;$i++){ curl -i -X POST https://<staging>/auth/login }` → first 5 `200/401`, 6th `429` with `Retry-After`.

**Determinism note:** window math is time-dependent; unit tests inject `nowMs` explicitly. Integration tests assert ordering/counts (not wall-clock reset) to stay deterministic in CI.

**CI:** all three automated layers run under `npm test` (Vitest) in the GitHub Actions pipeline.
