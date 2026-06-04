// Integration tests for the RateLimiter Durable Object + Hono middleware.
// Runs in the real Workers runtime via @cloudflare/vitest-pool-workers.
//
// Prerequisite: vitest.config.ts uses defineWorkersConfig pointing at
// wrangler.toml so the RATE_LIMITER binding and DB are available as `env`.

import { env, runInDurableObject } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import app from "../../src/index";
import type { RateLimiter } from "../../src/rate-limit/rate-limiter.do";

function ipReq(path: string, ip = "203.0.113.7") {
  return new Request(`https://app.pensa.gctu${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "CF-Connecting-IP": ip },
    body: "{}",
  });
}

describe("RateLimiter DO (direct)", () => {
  it("blocks after the configured limit and reports retry-after", async () => {
    const id = env.RATE_LIMITER.idFromName("login:ip:test");
    const stub = env.RATE_LIMITER.get(id);
    let last;
    for (let i = 0; i < 6; i++) {
      last = await stub.limit({ key: "login:ip:test", limit: 5, windowMs: 900_000 });
    }
    expect(last!.allowed).toBe(false);
    expect(last!.remaining).toBe(0);
    expect(last!.retryAfterSec).toBeGreaterThan(0);
  });

  it("purges expired entries on alarm", async () => {
    const id = env.RATE_LIMITER.idFromName("cleanup:test");
    const stub = env.RATE_LIMITER.get(id);
    await stub.limit({ key: "old", limit: 1, windowMs: 1 }); // already expired window
    await runInDurableObject(stub, async (instance: RateLimiter) => {
      await instance.alarm();
      expect(await instance.peek("old")).toBeNull();
    });
  });
});

describe("Hono middleware (end-to-end)", () => {
  it("returns 429 with Retry-After once /auth/login limit is exceeded for an IP", async () => {
    let res!: Response;
    for (let i = 0; i < 6; i++) {
      res = await app.fetch(ipReq("/auth/login", "198.51.100.5"), env);
    }
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBeTruthy();
    const body = (await res.json()) as { error: string; retryAfter: number };
    expect(body.error).toBe("rate_limited");
  });

  it("limits /register at 10 per hour per IP", async () => {
    let allowed = 0;
    for (let i = 0; i < 12; i++) {
      const r = await app.fetch(ipReq("/register", "198.51.100.9"), env);
      if (r.status === 200) allowed++;
    }
    expect(allowed).toBe(10);
  });

  it("writes an audit_log row on violation", async () => {
    for (let i = 0; i < 6; i++) await app.fetch(ipReq("/auth/login", "198.51.100.42"), env);
    const row = await env.DB.prepare(
      "SELECT count(*) AS c FROM audit_log WHERE action = 'ratelimit.exceeded'",
    ).first<{ c: number }>();
    expect((row?.c ?? 0)).toBeGreaterThan(0);
  });
});
