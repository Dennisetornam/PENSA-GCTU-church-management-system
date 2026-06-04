import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

// Runs tests inside the real Workers runtime so the RATE_LIMITER Durable Object,
// D1 (DB), KV, and R2 bindings from wrangler.toml are available as `env`.
export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: "./wrangler.toml" },
        miniflare: {
          // Apply the SQL schema to the test D1 before the suite runs.
          // (Wire d1 migrations or a setup file here when executing Phase 0.)
        },
      },
    },
  },
});
