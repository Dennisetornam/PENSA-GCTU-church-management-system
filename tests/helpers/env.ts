// Builds a fake Worker `Env` for tests: D1 shim + in-memory KV/R2 + a permissive
// RateLimiter stub + secrets. Loads db/schema.sql (and optionally seeds).
import { readFileSync } from "node:fs";
import { createTestDb, type TestDb } from "./d1";

export interface TestEnv {
  DB: TestDb;
  KV: { get: (k: string) => Promise<unknown>; put: (k: string, v: unknown) => Promise<void>; delete: (k: string) => Promise<void> };
  MEDIA: {
    put: (key: string, body: unknown, opts?: { httpMetadata?: unknown }) => Promise<unknown>;
    get: (key: string) => Promise<{ body: unknown; httpMetadata?: unknown } | null>;
    delete: (key: string) => Promise<void>;
  };
  RATE_LIMITER: { idFromName: (n: string) => string; get: (id: string) => { limit: () => Promise<unknown> } };
  JWT_SECRET: string;
  TURNSTILE_SECRET: string;
  ADMIN_API_TOKEN: string;
  __r2: Map<string, { body: unknown; httpMetadata?: unknown }>;
}

export function makeTestEnv(opts: { seed?: boolean } = {}): TestEnv {
  const DB = createTestDb();
  DB.__raw.exec(readFileSync("db/schema.sql", "utf8"));
  if (opts.seed) {
    DB.__raw.exec(readFileSync("db/seeds/reference.sql", "utf8"));
    DB.__raw.exec(readFileSync("db/seeds/programmes.sql", "utf8"));
  }

  const kv = new Map<string, unknown>();
  const r2 = new Map<string, { body: unknown; httpMetadata?: unknown }>();

  return {
    DB,
    KV: {
      get: async (k) => kv.get(k) ?? null,
      put: async (k, v) => void kv.set(k, v),
      delete: async (k) => void kv.delete(k),
    },
    MEDIA: {
      put: async (key, body, o) => {
        r2.set(key, { body, httpMetadata: o?.httpMetadata });
        return {};
      },
      get: async (key) => r2.get(key) ?? null,
      delete: async (key) => void r2.delete(key),
    },
    RATE_LIMITER: {
      idFromName: (n) => n,
      get: () => ({
        limit: async () => ({ allowed: true, limit: 999, remaining: 999, resetAtMs: Date.now() + 1000, retryAfterSec: 0 }),
      }),
    },
    JWT_SECRET: "test-secret-at-least-32-bytes-long-xxxxx",
    TURNSTILE_SECRET: "test-turnstile-secret",
    ADMIN_API_TOKEN: "test-admin-token",
    __r2: r2,
  };
}
