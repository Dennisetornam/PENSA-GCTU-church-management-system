import { defineConfig } from "vitest/config";

// Node-environment Vitest. Backend logic + Hono routes are tested against a
// D1-compatible shim over node:sqlite (D1 is SQLite) with stub KV/R2/RateLimiter
// — fast and reliable, and avoids the @cloudflare/vitest-pool-workers loader bug
// on Windows paths containing spaces. Final verification runs on real D1 via
// staging deploys. The workers-pool integration spec is excluded here and can
// run in CI on a space-free path.
export default defineConfig({
  ssr: { external: ["node:sqlite"] },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    exclude: ["tests/rate-limit/rate-limiter.test.ts", "node_modules/**"],
    server: { deps: { external: ["node:sqlite", /node:sqlite/] } },
  },
});
