# Phase 0 — Foundations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a deployable, type-safe React Router v7 (Remix) app on Cloudflare Workers with D1/R2/KV bindings, Drizzle ORM, Tailwind/shadcn, testing, linting, and CI — proven by a passing health-check test and a successful staging deploy.

**Architecture:** A single Remix-on-Workers application. Server code lives in route loaders/actions; Cloudflare resources (D1 database, R2 bucket, KV namespace) are injected as Worker bindings and accessed through a typed context. Drizzle owns schema + migrations. Vitest runs inside the real Workers runtime via `@cloudflare/vitest-pool-workers`.

**Tech Stack:** TypeScript (strict), React Router v7 (Remix), Cloudflare Workers, Wrangler, D1 (SQLite), R2, KV, Drizzle ORM, Tailwind CSS, shadcn/ui, Zod, Vitest, Playwright, ESLint, Prettier, GitHub Actions.

**Working directory:** `E:\ALL FOLDERS\PENSA\Management System` (existing git repo, remote `origin` = GitHub `Dennisetornam/PENSA-GCTU-church-management-system`, branch `main`).

---

## File Structure (created in this phase)

| File | Responsibility |
|---|---|
| `package.json` | Dependencies + scripts (dev/build/deploy/test/lint/typecheck/db) |
| `tsconfig.json` | TypeScript strict config + path aliases |
| `vite.config.ts` | Vite + React Router + Cloudflare plugin |
| `wrangler.toml` | Worker name, compatibility, env bindings (D1/R2/KV) for dev/staging/production |
| `worker-configuration.d.ts` | Generated binding types (via `wrangler types`) |
| `app/root.tsx` | App shell, Tailwind import, error boundary |
| `app/routes/_index.tsx` | Placeholder landing route |
| `app/routes/healthz.tsx` | Health-check resource route (DB ping) |
| `app/lib/db/client.ts` | Drizzle client factory from D1 binding |
| `app/lib/db/schema.ts` | Initial schema (single `health_check` table for Phase 0) |
| `app/lib/env.ts` | Typed accessor for Worker bindings/context |
| `drizzle.config.ts` | Drizzle Kit config (schema path, migrations dir, D1 driver) |
| `db/migrations/*` | Generated SQL migrations |
| `app/app.css` | Tailwind entry |
| `tailwind.config.ts`, `postcss.config.js` | Tailwind setup |
| `components.json` | shadcn/ui config |
| `vitest.config.ts` | Vitest + workers pool config |
| `tests/healthz.test.ts` | Health-check integration test |
| `.eslintrc.cjs`, `.prettierrc` | Lint/format config |
| `.github/workflows/ci.yml` | Typecheck + lint + test on PR/push |
| `.github/workflows/deploy.yml` | Deploy to staging/production via Wrangler |
| `.gitignore`, `.dev.vars.example`, `README.md` | Hygiene + docs |

> Note: exact scaffolding output from `create-cloudflare` may name a few files slightly differently (e.g. `app/entry.server.tsx`). Adapt paths to the generated structure; the responsibilities above are the contract.

---

## Prerequisites (already satisfied)

- Node v24.x, npm 11.x installed.
- Wrangler 4.x installed globally and authenticated (`wrangler whoami` shows the account).
- Repo cloned at the working directory with `origin/main` tracking.

---

### Task 1: Scaffold the Remix-on-Cloudflare app in-place

**Files:**
- Create: project scaffold (package.json, vite.config.ts, app/, etc.)

- [ ] **Step 1: Scaffold into a temp dir, then move into the repo**

The repo folder is non-empty (`.git`, `docs/`), so scaffold in a sibling temp dir and copy files in.

Run:
```powershell
$tmp = "$env:TEMP\pensa-scaffold"
npm create cloudflare@latest $tmp -- --framework=react-router --no-deploy --no-git
```
When prompted, accept TypeScript and the default template options. Expected: a generated React Router + Cloudflare project in `$tmp`.

- [ ] **Step 2: Copy generated files into the repo (preserve existing docs/ and .git)**

Run:
```powershell
$dst = "E:\ALL FOLDERS\PENSA\Management System"
Copy-Item "$env:TEMP\pensa-scaffold\*" $dst -Recurse -Force -Exclude @('.git')
```
Expected: `package.json`, `vite.config.ts`, `app/`, `wrangler.*` now exist in the repo.

- [ ] **Step 3: Install dependencies**

Run: `npm install`
Expected: `node_modules/` created, no peer-dependency errors that block install.

- [ ] **Step 4: Verify dev server boots**

Run: `npm run dev` (then stop with Ctrl+C after it serves)
Expected: Vite prints a local URL and the app compiles without errors.

- [ ] **Step 5: Commit**

```powershell
git add -A
git commit -m "chore: scaffold React Router v7 app on Cloudflare Workers"
```

---

### Task 2: Enforce TypeScript strictness and path aliases

**Files:**
- Modify: `tsconfig.json`

- [ ] **Step 1: Set strict compiler options**

Ensure `tsconfig.json` `compilerOptions` includes:
```json
{
  "strict": true,
  "noUncheckedIndexedAccess": true,
  "noImplicitOverride": true,
  "verbatimModuleSyntax": true,
  "skipLibCheck": true,
  "baseUrl": ".",
  "paths": { "~/*": ["./app/*"] }
}
```

- [ ] **Step 2: Run the type checker**

Run: `npm run typecheck` (add the script `"typecheck": "tsc --noEmit"` if missing)
Expected: PASS with no errors (fix any strictness errors the scaffold introduced).

- [ ] **Step 3: Commit**

```powershell
git add tsconfig.json package.json
git commit -m "chore: enable strict TypeScript and ~ path alias"
```

---

### Task 3: Configure Wrangler bindings for dev/staging/production

**Files:**
- Modify: `wrangler.toml`

- [ ] **Step 1: Define the worker and per-environment bindings**

Set `wrangler.toml` to:
```toml
name = "pensa-gctu-cms"
compatibility_date = "2025-01-01"
compatibility_flags = ["nodejs_compat"]
main = "./workers/app.ts"  # adapt to scaffold's entry path

[[d1_databases]]
binding = "DB"
database_name = "pensa-gctu-dev"
database_id = "PLACEHOLDER_DEV"   # filled in Task 4
migrations_dir = "db/migrations"

[[r2_buckets]]
binding = "MEDIA"
bucket_name = "pensa-gctu-media-dev"

[[kv_namespaces]]
binding = "KV"
id = "PLACEHOLDER_DEV_KV"          # filled in Task 4

[env.staging]
[[env.staging.d1_databases]]
binding = "DB"
database_name = "pensa-gctu-staging"
database_id = "PLACEHOLDER_STAGING"
migrations_dir = "db/migrations"
[[env.staging.r2_buckets]]
binding = "MEDIA"
bucket_name = "pensa-gctu-media-staging"
[[env.staging.kv_namespaces]]
binding = "KV"
id = "PLACEHOLDER_STAGING_KV"

[env.production]
[[env.production.d1_databases]]
binding = "DB"
database_name = "pensa-gctu-production"
database_id = "PLACEHOLDER_PROD"
migrations_dir = "db/migrations"
[[env.production.r2_buckets]]
binding = "MEDIA"
bucket_name = "pensa-gctu-media-production"
[[env.production.kv_namespaces]]
binding = "KV"
id = "PLACEHOLDER_PROD_KV"
```

- [ ] **Step 2: Commit (placeholders intentional until Task 4)**

```powershell
git add wrangler.toml
git commit -m "chore: define D1/R2/KV bindings for dev/staging/production"
```

---

### Task 4: Provision Cloudflare resources and wire real IDs

**Files:**
- Modify: `wrangler.toml`, `worker-configuration.d.ts`

- [ ] **Step 1: Create D1 databases**

Run:
```powershell
wrangler d1 create pensa-gctu-dev
wrangler d1 create pensa-gctu-staging
wrangler d1 create pensa-gctu-production
```
Expected: each prints a `database_id`. Paste each into the matching `database_id` in `wrangler.toml`.

- [ ] **Step 2: Create KV namespaces**

Run:
```powershell
wrangler kv namespace create KV
wrangler kv namespace create KV --env staging
wrangler kv namespace create KV --env production
```
Expected: each prints an `id`. Paste into the matching `kv_namespaces.id`.

- [ ] **Step 3: Create R2 buckets**

Run:
```powershell
wrangler r2 bucket create pensa-gctu-media-dev
wrangler r2 bucket create pensa-gctu-media-staging
wrangler r2 bucket create pensa-gctu-media-production
```
Expected: "Created bucket" for each.

- [ ] **Step 4: Generate binding types**

Run: `wrangler types`
Expected: `worker-configuration.d.ts` (or `Env` interface) now includes `DB`, `MEDIA`, `KV`.

- [ ] **Step 5: Commit**

```powershell
git add wrangler.toml worker-configuration.d.ts
git commit -m "chore: provision D1/R2/KV and wire resource IDs"
```

---

### Task 5: Add Drizzle ORM with an initial schema and migration

**Files:**
- Create: `drizzle.config.ts`, `app/lib/db/schema.ts`, `app/lib/db/client.ts`
- Create: `db/migrations/*` (generated)

- [ ] **Step 1: Install Drizzle**

Run: `npm i drizzle-orm && npm i -D drizzle-kit`
Expected: both added to `package.json`.

- [ ] **Step 2: Write the Drizzle config**

`drizzle.config.ts`:
```ts
import type { Config } from "drizzle-kit";
export default {
  schema: "./app/lib/db/schema.ts",
  out: "./db/migrations",
  dialect: "sqlite",
  driver: "d1-http",
} satisfies Config;
```

- [ ] **Step 3: Write the initial schema (health_check table)**

`app/lib/db/schema.ts`:
```ts
import { sqliteTable, integer, text } from "drizzle-orm/sqlite-core";

export const healthCheck = sqliteTable("health_check", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  status: text("status").notNull().default("ok"),
  checkedAt: text("checked_at").notNull(),
});
```

- [ ] **Step 4: Write the client factory**

`app/lib/db/client.ts`:
```ts
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export function makeDb(d1: D1Database) {
  return drizzle(d1, { schema });
}
export type DbClient = ReturnType<typeof makeDb>;
```

- [ ] **Step 5: Generate the migration**

Run: `npx drizzle-kit generate`
Expected: a new SQL file in `db/migrations/` creating `health_check`.

- [ ] **Step 6: Apply the migration to local dev D1**

Run: `wrangler d1 migrations apply pensa-gctu-dev --local`
Expected: "Migrations applied" against the local SQLite file.

- [ ] **Step 7: Commit**

```powershell
git add drizzle.config.ts app/lib/db db/migrations package.json
git commit -m "feat: add Drizzle ORM with initial health_check schema and migration"
```

---

### Task 6: Health-check route proven by a test (TDD)

**Files:**
- Create: `app/routes/healthz.tsx`, `app/lib/env.ts`
- Test: `tests/healthz.test.ts`, `vitest.config.ts`

- [ ] **Step 1: Install and configure the Workers test pool**

Run: `npm i -D vitest @cloudflare/vitest-pool-workers`

`vitest.config.ts`:
```ts
import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";
export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: { wrangler: { configPath: "./wrangler.toml" } },
    },
  },
});
```
Add script: `"test": "vitest run"`.

- [ ] **Step 2: Write the failing test**

`tests/healthz.test.ts`:
```ts
import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import worker from "../workers/app"; // adapt to scaffold entry

describe("GET /healthz", () => {
  it("returns 200 and ok status", async () => {
    const req = new Request("https://x/healthz");
    const ctx = createExecutionContext();
    const res = await worker.fetch(req, env, ctx);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ status: "ok" });
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test -- tests/healthz.test.ts`
Expected: FAIL (route `/healthz` not found → 404, or import error).

- [ ] **Step 4: Implement the health-check route**

`app/lib/env.ts`:
```ts
export type AppEnv = { DB: D1Database; MEDIA: R2Bucket; KV: KVNamespace };
```

`app/routes/healthz.tsx`:
```ts
import type { LoaderFunctionArgs } from "react-router";
import { makeDb } from "~/lib/db/client";

export async function loader({ context }: LoaderFunctionArgs) {
  const env = (context as { cloudflare: { env: any } }).cloudflare.env;
  const db = makeDb(env.DB);
  await db.run("SELECT 1");
  return Response.json({ status: "ok" });
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- tests/healthz.test.ts`
Expected: PASS (200, `{ status: "ok" }`).

- [ ] **Step 6: Commit**

```powershell
git add app/routes/healthz.tsx app/lib/env.ts tests/healthz.test.ts vitest.config.ts package.json
git commit -m "feat: add /healthz route with DB ping and passing test"
```

---

### Task 7: Tailwind CSS + shadcn/ui

**Files:**
- Create: `app/app.css`, `tailwind.config.ts`, `postcss.config.js`, `components.json`
- Modify: `app/root.tsx`

- [ ] **Step 1: Install Tailwind**

Run: `npm i -D tailwindcss postcss autoprefixer && npx tailwindcss init -p`

- [ ] **Step 2: Configure content globs**

`tailwind.config.ts` `content`: `["./app/**/*.{ts,tsx}"]`. Add Tailwind directives to `app/app.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 3: Import the stylesheet in root**

In `app/root.tsx`, import `app.css` as the document stylesheet (via the `links` export or direct import per scaffold convention).

- [ ] **Step 4: Initialize shadcn/ui**

Run: `npx shadcn@latest init` (choose defaults; base color slate). Then add one component to verify: `npx shadcn@latest add button`.
Expected: `components.json` and `app/components/ui/button.tsx` created.

- [ ] **Step 5: Verify build still compiles**

Run: `npm run build`
Expected: production build succeeds.

- [ ] **Step 6: Commit**

```powershell
git add app/app.css tailwind.config.ts postcss.config.js components.json app/components app/root.tsx package.json
git commit -m "feat: add Tailwind CSS and shadcn/ui with Button component"
```

---

### Task 8: Linting and formatting

**Files:**
- Create: `.eslintrc.cjs`, `.prettierrc`, `.prettierignore`
- Modify: `package.json` (scripts)

- [ ] **Step 1: Install tools**

Run: `npm i -D eslint prettier @typescript-eslint/parser @typescript-eslint/eslint-plugin eslint-plugin-react eslint-plugin-react-hooks`

- [ ] **Step 2: Add config**

`.eslintrc.cjs`:
```js
module.exports = {
  parser: "@typescript-eslint/parser",
  parserOptions: { ecmaVersion: 2022, sourceType: "module", ecmaFeatures: { jsx: true } },
  plugins: ["@typescript-eslint", "react", "react-hooks"],
  extends: ["eslint:recommended", "plugin:@typescript-eslint/recommended", "plugin:react-hooks/recommended"],
  settings: { react: { version: "detect" } },
  ignorePatterns: ["build/", "node_modules/", "worker-configuration.d.ts"],
};
```
`.prettierrc`: `{ "semi": true, "singleQuote": false, "printWidth": 100 }`

- [ ] **Step 3: Add scripts**

In `package.json`: `"lint": "eslint app tests"`, `"format": "prettier --write ."`.

- [ ] **Step 4: Run lint**

Run: `npm run lint`
Expected: PASS (fix any reported issues).

- [ ] **Step 5: Commit**

```powershell
git add .eslintrc.cjs .prettierrc .prettierignore package.json
git commit -m "chore: add ESLint and Prettier"
```

---

### Task 9: CI workflow (typecheck + lint + test)

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Write the CI workflow**

`.github/workflows/ci.yml`:
```yaml
name: CI
on:
  push: { branches: [main] }
  pull_request: { branches: [main] }
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npm run typecheck
      - run: npm run lint
      - run: npm test
```

- [ ] **Step 2: Commit and push**

```powershell
git add .github/workflows/ci.yml
git commit -m "ci: add typecheck/lint/test workflow"
git push
```
Expected: GitHub Actions runs and the `verify` job passes (check the Actions tab).

---

### Task 10: Deploy workflow + first staging deploy

**Files:**
- Create: `.github/workflows/deploy.yml`

- [ ] **Step 1: Create a Cloudflare API token for CI**

In the Cloudflare dashboard, create an API token with Workers/D1/R2/KV edit permissions. Add it to GitHub repo secrets as `CLOUDFLARE_API_TOKEN` and the account id as `CLOUDFLARE_ACCOUNT_ID`.

- [ ] **Step 2: Write the deploy workflow**

`.github/workflows/deploy.yml`:
```yaml
name: Deploy
on:
  push: { branches: [main] }
jobs:
  deploy-staging:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npx wrangler d1 migrations apply pensa-gctu-staging --env staging --remote
        env: { CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}, CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }} }
      - run: npx wrangler deploy --env staging
        env: { CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}, CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }} }
```
> Production deploy is gated to a manual/release trigger in a later phase; staging auto-deploys from `main`.

- [ ] **Step 3: Apply migrations to remote staging once manually (first time)**

Run: `wrangler d1 migrations apply pensa-gctu-staging --env staging --remote`
Expected: migration creates `health_check` on staging.

- [ ] **Step 4: Deploy to staging manually to verify end-to-end**

Run: `wrangler deploy --env staging`
Expected: prints the deployed `*.workers.dev` URL.

- [ ] **Step 5: Smoke-test the deployed health check**

Run: `curl https://<staging-url>/healthz`
Expected: `{"status":"ok"}`.

- [ ] **Step 6: Commit and push**

```powershell
git add .github/workflows/deploy.yml
git commit -m "ci: add staging deploy workflow"
git push
```

---

### Task 11: Project hygiene and docs

**Files:**
- Create/Modify: `.gitignore`, `.dev.vars.example`, `README.md`

- [ ] **Step 1: Ensure ignores**

`.gitignore` includes: `node_modules/`, `build/`, `.dev.vars`, `.wrangler/`, `dist/`, `*.local`.

- [ ] **Step 2: Document local env**

`.dev.vars.example`:
```
SESSION_SECRET=replace-me
RESEND_API_KEY=replace-me
```

- [ ] **Step 3: Write README quickstart**

`README.md` covers: install (`npm install`), dev (`npm run dev`), test (`npm test`), migrate (`wrangler d1 migrations apply pensa-gctu-dev --local`), deploy (`wrangler deploy --env staging`), and a link to `docs/architecture/system-design.md`.

- [ ] **Step 4: Final verification gate**

Run all of: `npm run typecheck && npm run lint && npm test && npm run build`
Expected: all PASS.

- [ ] **Step 5: Commit and push**

```powershell
git add .gitignore .dev.vars.example README.md
git commit -m "docs: add README quickstart and project hygiene"
git push
```

---

## Definition of Done (Phase 0)

- `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` all pass locally.
- CI workflow green on GitHub.
- `/healthz` returns `{"status":"ok"}` locally and on the deployed staging URL.
- D1/R2/KV provisioned for dev/staging/production with IDs wired in `wrangler.toml`.
- Drizzle migration system working (generate + apply).
- No application/business code yet beyond the health check — foundation only.

## Self-Review Notes

- **Spec coverage:** Implements the Technology Stack (§2), Folder Structure (§3), and the Phase 0 row of the Roadmap (§16) from `docs/architecture/system-design.md`. Business modules (members, attendance, etc.) are intentionally out of scope here — they are later phases.
- **Adaptation flag:** Exact filenames from `create-cloudflare` may differ slightly; the File Structure table defines responsibilities, and steps note where to adapt the entry path.
- **No secrets committed:** API tokens live in GitHub secrets; `.dev.vars` is git-ignored.
