# Phase 1 — Authentication & Authorization Implementation Plan

> ⚠️ **AMENDED by `scope-update-2026-06-04.md`.** Members do not authenticate.
> **Remove Task 15 (account activation + password reset)** and all `member`-role
> and invitation references. Canonical roles are the **4** admin/leader roles
> (`super_admin`, `church_admin`, `department_leader`, `cell_leader`). Backend is
> **Hono on Workers**; the RateLimiter Durable Object is already implemented in
> `src/rate-limit/` (see `docs/architecture/rate-limiting.md`), so Task 10 here is
> superseded by that implementation.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the server-side authentication + authorization engine — JWT access tokens, rotating refresh tokens with reuse detection, PBKDF2 password hashing, 5-role RBAC with scope enforcement, Durable-Object rate limiting, Cloudflare Turnstile verification, CSRF protection, audit logging, and Zod validation — all proven by tests. **No UI.**

**Architecture:** See `docs/architecture/auth-design.md`. Stateless access JWTs verified at the edge; stateful rotating refresh tokens in D1; scope re-verified from D1 on every mutation.

**Tech Stack:** Cloudflare Workers, React Router v7 (resource routes), D1 + Drizzle, KV (jti denylist), Durable Objects (rate limiter), `jose`, `zod`, WebCrypto.

**Depends on:** Phase 0 (Foundations) complete — app scaffolded, D1/KV bindings live, Drizzle + Vitest workers pool configured.

**Prerequisite for this plan to run:** `app/lib/db/client.ts` exposes `makeDb(d1)` returning a Drizzle client (from Phase 0).

---

## File Structure (created/modified in this phase)

| File | Responsibility |
|---|---|
| `app/lib/auth/crypto.ts` | base64url, random tokens, sha256, constant-time compare |
| `app/lib/auth/password.ts` | PBKDF2 hash/verify with versioned encoding |
| `app/lib/auth/jwt.ts` | Access-token sign/verify (`jose`, HS256, `kid`) |
| `app/lib/auth/refresh.ts` | Refresh issue/rotate/revoke + reuse detection (D1) |
| `app/lib/auth/turnstile.ts` | Turnstile siteverify |
| `app/lib/auth/csrf.ts` | Double-submit CSRF issue/assert |
| `app/lib/auth/cookies.ts` | `__Host-*` cookie builders |
| `app/lib/rbac/permissions.ts` | Typed role→permission map + `can()` |
| `app/lib/rbac/authorize.ts` | Scope resolution + mutation re-verification |
| `app/lib/auth/context.ts` | `requireUser`, `requirePermission` middleware |
| `app/lib/auth/schemas.ts` | Zod payload schemas |
| `app/lib/audit.ts` | `writeAudit()` helper |
| `workers/rate-limiter.ts` | `RateLimiter` Durable Object |
| `app/lib/auth/rate-limit.ts` | Client wrapper over the DO |
| `app/routes/api.auth.login.ts` | Login endpoint |
| `app/routes/api.auth.refresh.ts` | Refresh endpoint |
| `app/routes/api.auth.logout.ts` | Logout endpoint |
| `app/routes/api.auth.activate.ts` | Account activation (member onboarding) |
| `app/routes/api.auth.reset-request.ts` / `api.auth.reset-confirm.ts` | Password reset |
| `app/lib/db/schema.ts` (modify) | Add users columns, `refresh_tokens`, `account_invitations` |
| `db/migrations/*` | Generated auth migration |
| `db/seeds/reference.sql` (modify) | Update roles to canonical 5 |
| `wrangler.toml` (modify) | DO binding + migration tag |
| `tests/auth/*` | Unit + integration tests |

---

### Task 1: Install dependencies and configure bindings

**Files:** Modify `package.json`, `wrangler.toml`

- [ ] **Step 1: Install libraries**

Run: `npm i jose zod`
Expected: both in `package.json` dependencies.

- [ ] **Step 2: Add the Durable Object + secrets scaffolding to `wrangler.toml`**

Append:
```toml
[[durable_objects.bindings]]
name = "RATE_LIMITER"
class_name = "RateLimiter"

[[migrations]]
tag = "v1"
new_sqlite_classes = ["RateLimiter"]
```
Add the same `durable_objects` block under `[env.staging]` and `[env.production]`.

- [ ] **Step 3: Document required secrets**

Append to `.dev.vars.example`:
```
JWT_SECRET=dev-only-change-me-min-32-bytes-long
TURNSTILE_SECRET=1x0000000000000000000000000000000AA
```
(The Turnstile value above is Cloudflare's always-passes test secret.)

- [ ] **Step 4: Commit**

```powershell
git add package.json wrangler.toml .dev.vars.example
git commit -m "chore(auth): add jose/zod, RateLimiter DO binding, auth secrets"
```

---

### Task 2: Database migration — auth columns, refresh tokens, invitations

**Files:** Modify `app/lib/db/schema.ts`; generate `db/migrations/*`; modify `db/seeds/reference.sql`

- [ ] **Step 1: Add Drizzle table definitions**

In `app/lib/db/schema.ts` add (mirroring `docs/architecture/auth-design.md` §11):
```ts
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

// add columns to the existing users table definition:
//   memberId: text("member_id"),
//   emailVerifiedAt: text("email_verified_at"),
//   failedLoginCount: integer("failed_login_count").notNull().default(0),
//   lockedUntil: text("locked_until"),
//   passwordChangedAt: text("password_changed_at"),

export const refreshTokens = sqliteTable("refresh_tokens", {
  id: text("id").primaryKey().default(sqlRandomId()),
  userId: text("user_id").notNull(),
  familyId: text("family_id").notNull(),
  tokenHash: text("token_hash").notNull(),
  parentId: text("parent_id"),
  issuedAt: text("issued_at").notNull(),
  expiresAt: text("expires_at").notNull(),
  revokedAt: text("revoked_at"),
  replacedBy: text("replaced_by"),
  ip: text("ip"),
  userAgent: text("user_agent"),
});

export const accountInvitations = sqliteTable("account_invitations", {
  id: text("id").primaryKey().default(sqlRandomId()),
  memberId: text("member_id").notNull(),
  email: text("email").notNull(),
  tokenHash: text("token_hash").notNull(),
  roleId: text("role_id").notNull(),
  expiresAt: text("expires_at").notNull(),
  acceptedAt: text("accepted_at"),
  createdBy: text("created_by"),
  createdAt: text("created_at").notNull(),
});
```
(`sqlRandomId()` = `sql\`(lower(hex(randomblob(16))))\``.)

- [ ] **Step 2: Generate the migration**

Run: `npx drizzle-kit generate --name auth`
Expected: a new SQL file under `db/migrations/` with the ALTERs + new tables. Verify it matches §11 of the auth design (add the indexes if drizzle-kit omits partial/extra indexes — edit the generated SQL to include `ux_refresh_token_hash`, `ix_refresh_user`, `ix_refresh_family`, `ix_users_member`, `ix_invitation_member`).

- [ ] **Step 3: Update the roles seed to the canonical 5**

Replace the roles INSERT in `db/seeds/reference.sql` with:
```sql
INSERT INTO roles (id, name, description, is_system) VALUES
  ('role_super_admin',  'super_admin',       'Global owner: users, roles, audit, settings', 1),
  ('role_church_admin', 'church_admin',      'Church Administrator: full domain + approvals + lookups', 1),
  ('role_dept_leader',  'department_leader', 'Manages own department roster & attendance', 1),
  ('role_cell_leader',  'cell_leader',       'Manages own cell roster & attendance', 1),
  ('role_member',       'member',            'Member: own profile and own attendance', 1)
ON CONFLICT(id) DO NOTHING;
-- Remove deprecated 'admin'/'staff' rows from non-prod; in prod, migrate any
-- existing users to church_admin before deleting.
```

- [ ] **Step 4: Apply locally and validate**

Run: `wrangler d1 migrations apply pensa-gctu-dev --local`
Then: `wrangler d1 execute pensa-gctu-dev --local --file db/seeds/reference.sql`
Expected: applies cleanly; `SELECT count(*) FROM roles` = 5.

- [ ] **Step 5: Commit**

```powershell
git add app/lib/db/schema.ts db/migrations db/seeds/reference.sql
git commit -m "feat(auth): migration for auth columns, refresh_tokens, invitations; canonical roles"
```

---

### Task 3: Crypto primitives (TDD)

**Files:** Create `app/lib/auth/crypto.ts`; Test `tests/auth/crypto.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { randomToken, sha256Hex, timingSafeEqual, b64urlEncode } from "~/lib/auth/crypto";

describe("crypto primitives", () => {
  it("randomToken is url-safe and unique", () => {
    const a = randomToken(32), b = randomToken(32);
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
  });
  it("sha256Hex is stable and 64 hex chars", async () => {
    expect(await sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
  it("timingSafeEqual compares correctly", () => {
    expect(timingSafeEqual("abc", "abc")).toBe(true);
    expect(timingSafeEqual("abc", "abd")).toBe(false);
    expect(timingSafeEqual("abc", "ab")).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- tests/auth/crypto.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

`app/lib/auth/crypto.ts`:
```ts
export function b64urlEncode(bytes: Uint8Array): string {
  let s = btoa(String.fromCharCode(...bytes));
  return s.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export function randomToken(byteLen = 32): string {
  const buf = new Uint8Array(byteLen);
  crypto.getRandomValues(buf);
  return b64urlEncode(buf);
}
export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- tests/auth/crypto.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add app/lib/auth/crypto.ts tests/auth/crypto.test.ts
git commit -m "feat(auth): crypto primitives (random, sha256, constant-time compare)"
```

---

### Task 4: Password hashing (TDD)

**Files:** Create `app/lib/auth/password.ts`; Test `tests/auth/password.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "~/lib/auth/password";

describe("password hashing", () => {
  it("verifies a correct password and rejects a wrong one", async () => {
    const enc = await hashPassword("correct horse battery staple", 50_000);
    expect(enc.startsWith("pbkdf2$sha256$50000$")).toBe(true);
    expect(await verifyPassword("correct horse battery staple", enc)).toBe(true);
    expect(await verifyPassword("wrong", enc)).toBe(false);
  });
  it("produces a different salt each time", async () => {
    const a = await hashPassword("same", 50_000);
    const b = await hashPassword("same", 50_000);
    expect(a).not.toBe(b);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- tests/auth/password.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`app/lib/auth/password.ts`:
```ts
import { b64urlEncode, timingSafeEqual } from "./crypto";

const DEFAULT_ITERATIONS = 210_000;

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" }, key, 256);
  return b64urlEncode(new Uint8Array(bits));
}

export async function hashPassword(password: string, iterations = DEFAULT_ITERATIONS): Promise<string> {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  const hash = await derive(password, salt, iterations);
  return `pbkdf2$sha256$${iterations}$${b64urlEncode(salt)}$${hash}`;
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const parts = encoded.split("$");
  if (parts.length !== 5 || parts[0] !== "pbkdf2") return false;
  const iterations = Number(parts[2]);
  const salt = Uint8Array.from(atob(parts[3].replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
  const expected = parts[4];
  const actual = await derive(password, salt, iterations);
  return timingSafeEqual(actual, expected);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- tests/auth/password.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add app/lib/auth/password.ts tests/auth/password.test.ts
git commit -m "feat(auth): PBKDF2 password hashing with versioned encoding"
```

---

### Task 5: Access-token JWT module (TDD)

**Files:** Create `app/lib/auth/jwt.ts`; Test `tests/auth/jwt.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { signAccessToken, verifyAccessToken } from "~/lib/auth/jwt";

const SECRET = "test-secret-at-least-32-bytes-long-xxxxx";

describe("access JWT", () => {
  it("round-trips claims", async () => {
    const token = await signAccessToken(
      { sub: "u1", role: "member", scope: { memberId: "m1", departments: [], cells: [] } }, SECRET);
    const claims = await verifyAccessToken(token, SECRET);
    expect(claims.sub).toBe("u1");
    expect(claims.role).toBe("member");
    expect(claims.scope.memberId).toBe("m1");
  });
  it("rejects a wrong secret", async () => {
    const token = await signAccessToken({ sub: "u1", role: "member", scope: { departments: [], cells: [] } }, SECRET);
    await expect(verifyAccessToken(token, "another-secret-at-least-32-bytes-long")).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- tests/auth/jwt.test.ts` → FAIL.

- [ ] **Step 3: Implement**

`app/lib/auth/jwt.ts`:
```ts
import { SignJWT, jwtVerify } from "jose";

export interface AccessScope { memberId?: string; departments: string[]; cells: string[]; }
export interface AccessClaims { sub: string; role: string; scope: AccessScope; jti: string; }

const ISS = "pensa-gctu";
const AUD = "pensa-gctu-web";
const TTL = "15m";

function key(secret: string) { return new TextEncoder().encode(secret); }

export async function signAccessToken(
  input: { sub: string; role: string; scope: AccessScope }, secret: string, kid = "v1"): Promise<string> {
  const jti = crypto.randomUUID();
  return new SignJWT({ role: input.role, scope: input.scope, jti })
    .setProtectedHeader({ alg: "HS256", kid })
    .setSubject(input.sub).setIssuer(ISS).setAudience(AUD)
    .setIssuedAt().setExpirationTime(TTL).sign(key(secret));
}

export async function verifyAccessToken(token: string, secret: string): Promise<AccessClaims> {
  const { payload } = await jwtVerify(token, key(secret), { issuer: ISS, audience: AUD });
  return { sub: payload.sub as string, role: payload.role as string,
           scope: payload.scope as AccessScope, jti: payload.jti as string };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- tests/auth/jwt.test.ts` → PASS.

- [ ] **Step 5: Commit**

```powershell
git add app/lib/auth/jwt.ts tests/auth/jwt.test.ts
git commit -m "feat(auth): HS256 access-token sign/verify with jose"
```

---

### Task 6: Refresh-token rotation + reuse detection (TDD, integration with D1)

**Files:** Create `app/lib/auth/refresh.ts`; Test `tests/auth/refresh.test.ts`

- [ ] **Step 1: Write the failing test (uses the test D1 binding `env.DB`)**

```ts
import { env } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import { makeDb } from "~/lib/db/client";
import { issueRefreshToken, rotateRefreshToken, RefreshReuseError } from "~/lib/auth/refresh";

const db = makeDb(env.DB);

beforeEach(async () => {
  await env.DB.exec("DELETE FROM refresh_tokens");
  await env.DB.exec("INSERT OR IGNORE INTO users (id, full_name, email, password_hash, role_id) VALUES ('u1','U','u@x','h','role_member')");
});

describe("refresh rotation", () => {
  it("issues then rotates, invalidating the old token", async () => {
    const { token } = await issueRefreshToken(db, { userId: "u1" });
    const rotated = await rotateRefreshToken(db, token, {});
    expect(rotated.token).not.toBe(token);
    expect(rotated.userId).toBe("u1");
    // reusing the original now triggers reuse detection
    await expect(rotateRefreshToken(db, token, {})).rejects.toBeInstanceOf(RefreshReuseError);
  });
  it("revokes the whole family on reuse", async () => {
    const { token } = await issueRefreshToken(db, { userId: "u1" });
    const r2 = await rotateRefreshToken(db, token, {});
    try { await rotateRefreshToken(db, token, {}); } catch {}
    // the newest token in the family is now revoked too
    await expect(rotateRefreshToken(db, r2.token, {})).rejects.toBeInstanceOf(RefreshReuseError);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- tests/auth/refresh.test.ts` → FAIL.

- [ ] **Step 3: Implement**

`app/lib/auth/refresh.ts`:
```ts
import { and, eq } from "drizzle-orm";
import type { DbClient } from "~/lib/db/client";
import { refreshTokens } from "~/lib/db/schema";
import { randomToken, sha256Hex } from "./crypto";

const TTL_MS = 30 * 24 * 60 * 60 * 1000;
export class RefreshReuseError extends Error {}

function iso(d: number) { return new Date(d).toISOString(); }

export async function issueRefreshToken(
  db: DbClient, opts: { userId: string; familyId?: string; parentId?: string; ip?: string; userAgent?: string }) {
  const token = randomToken(32);
  const tokenHash = await sha256Hex(token);
  const familyId = opts.familyId ?? crypto.randomUUID();
  const now = Date.now();
  const [row] = await db.insert(refreshTokens).values({
    userId: opts.userId, familyId, tokenHash, parentId: opts.parentId ?? null,
    issuedAt: iso(now), expiresAt: iso(now + TTL_MS), ip: opts.ip ?? null, userAgent: opts.userAgent ?? null,
  }).returning();
  return { token, userId: opts.userId, familyId, record: row };
}

export async function revokeFamily(db: DbClient, familyId: string) {
  await db.update(refreshTokens).set({ revokedAt: new Date().toISOString() })
    .where(and(eq(refreshTokens.familyId, familyId)));
}

export async function rotateRefreshToken(
  db: DbClient, presented: string, ctx: { ip?: string; userAgent?: string }) {
  const hash = await sha256Hex(presented);
  const [row] = await db.select().from(refreshTokens).where(eq(refreshTokens.tokenHash, hash)).limit(1);
  if (!row) throw new RefreshReuseError("unknown token");
  if (row.revokedAt || new Date(row.expiresAt).getTime() < Date.now()) {
    await revokeFamily(db, row.familyId);          // reuse/expired → nuke family
    throw new RefreshReuseError("reuse detected");
  }
  const next = await issueRefreshToken(db, {
    userId: row.userId, familyId: row.familyId, parentId: row.id, ip: ctx.ip, userAgent: ctx.userAgent });
  await db.update(refreshTokens)
    .set({ revokedAt: new Date().toISOString(), replacedBy: next.record.id })
    .where(eq(refreshTokens.id, row.id));
  return { token: next.token, userId: row.userId, familyId: row.familyId };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- tests/auth/refresh.test.ts` → PASS.

- [ ] **Step 5: Commit**

```powershell
git add app/lib/auth/refresh.ts tests/auth/refresh.test.ts
git commit -m "feat(auth): rotating refresh tokens with family reuse detection"
```

---

### Task 7: Turnstile verification (TDD with fetch stub)

**Files:** Create `app/lib/auth/turnstile.ts`; Test `tests/auth/turnstile.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { verifyTurnstile } from "~/lib/auth/turnstile";

afterEach(() => vi.restoreAllMocks());

describe("turnstile", () => {
  it("returns true on success", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ success: true }), { status: 200 }));
    expect(await verifyTurnstile("tok", "secret", "1.2.3.4")).toBe(true);
  });
  it("returns false on failure", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ success: false }), { status: 200 }));
    expect(await verifyTurnstile("tok", "secret")).toBe(false);
  });
});
```

- [ ] **Step 2: Run → FAIL.** `npm test -- tests/auth/turnstile.test.ts`

- [ ] **Step 3: Implement**

`app/lib/auth/turnstile.ts`:
```ts
const ENDPOINT = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
export async function verifyTurnstile(token: string, secret: string, remoteip?: string): Promise<boolean> {
  if (!token) return false;
  const body = new FormData();
  body.append("secret", secret);
  body.append("response", token);
  if (remoteip) body.append("remoteip", remoteip);
  const res = await fetch(ENDPOINT, { method: "POST", body });
  if (!res.ok) return false;
  const data = (await res.json()) as { success: boolean };
  return data.success === true;
}
```

- [ ] **Step 4: Run → PASS.**

- [ ] **Step 5: Commit**

```powershell
git add app/lib/auth/turnstile.ts tests/auth/turnstile.test.ts
git commit -m "feat(auth): Cloudflare Turnstile server verification"
```

---

### Task 8: RBAC permission map + `can()` (TDD)

**Files:** Create `app/lib/rbac/permissions.ts`; Test `tests/rbac/permissions.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { can } from "~/lib/rbac/permissions";

describe("RBAC can()", () => {
  it("super_admin can manage roles", () => expect(can("super_admin", "roles:manage")).toBe("all"));
  it("church_admin cannot manage roles", () => expect(can("church_admin", "roles:manage")).toBe(false));
  it("department_leader reads members in dept scope", () => expect(can("department_leader", "members:read")).toBe("department"));
  it("cell_leader records attendance in cell scope", () => expect(can("cell_leader", "attendance:record")).toBe("cell"));
  it("member reads own attendance only", () => expect(can("member", "attendance:read")).toBe("self"));
  it("member cannot create members", () => expect(can("member", "members:create")).toBe(false));
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement** (encode the matrix from auth-design §5)

`app/lib/rbac/permissions.ts`:
```ts
export type Scope = "all" | "department" | "cell" | "self";
export type Role = "super_admin" | "church_admin" | "department_leader" | "cell_leader" | "member";
export type Permission =
  | "members:create" | "members:read" | "members:update" | "members:delete"
  | "members:read_own" | "members:update_own"
  | "attendance:record" | "attendance:read"
  | "events:manage" | "events:read" | "registrations:review"
  | "departments:manage" | "cells:manage" | "programmes:manage" | "gathering_types:manage"
  | "analytics:view" | "users:manage" | "roles:manage" | "audit:view";

const M: Record<Role, Partial<Record<Permission, Scope>>> = {
  super_admin: {
    "members:create":"all","members:read":"all","members:update":"all","members:delete":"all",
    "members:read_own":"self","members:update_own":"self","attendance:record":"all","attendance:read":"all",
    "events:manage":"all","events:read":"all","registrations:review":"all","departments:manage":"all",
    "cells:manage":"all","programmes:manage":"all","gathering_types:manage":"all","analytics:view":"all",
    "users:manage":"all","roles:manage":"all","audit:view":"all",
  },
  church_admin: {
    "members:create":"all","members:read":"all","members:update":"all","members:delete":"all",
    "members:read_own":"self","members:update_own":"self","attendance:record":"all","attendance:read":"all",
    "events:manage":"all","events:read":"all","registrations:review":"all","departments:manage":"all",
    "cells:manage":"all","programmes:manage":"all","gathering_types:manage":"all","analytics:view":"all",
    "users:manage":"all",
  },
  department_leader: {
    "members:read":"department","members:update":"department","members:read_own":"self","members:update_own":"self",
    "attendance:record":"department","attendance:read":"department","events:manage":"department",
    "events:read":"all","analytics:view":"department",
  },
  cell_leader: {
    "members:read":"cell","members:read_own":"self","members:update_own":"self",
    "attendance:record":"cell","attendance:read":"cell","events:read":"all","analytics:view":"cell",
  },
  member: {
    "members:read_own":"self","members:update_own":"self","attendance:read":"self","events:read":"all",
  },
};

export function can(role: Role, perm: Permission): Scope | false {
  return M[role]?.[perm] ?? false;
}
```

- [ ] **Step 4: Run → PASS.**

- [ ] **Step 5: Commit**

```powershell
git add app/lib/rbac/permissions.ts tests/rbac/permissions.test.ts
git commit -m "feat(rbac): typed role-permission matrix with scope and can()"
```

---

### Task 9: CSRF double-submit (TDD)

**Files:** Create `app/lib/auth/csrf.ts`; Test `tests/auth/csrf.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { issueCsrfToken, assertCsrf } from "~/lib/auth/csrf";

describe("csrf", () => {
  it("passes when header matches cookie and origin allowed", () => {
    const token = issueCsrfToken();
    const req = new Request("https://app.example/api/x", {
      method: "POST",
      headers: { cookie: `__Host-csrf=${token}`, "x-csrf-token": token, origin: "https://app.example" },
    });
    expect(() => assertCsrf(req, ["https://app.example"])).not.toThrow();
  });
  it("throws on mismatch", () => {
    const req = new Request("https://app.example/api/x", {
      method: "POST",
      headers: { cookie: `__Host-csrf=aaa`, "x-csrf-token": "bbb", origin: "https://app.example" },
    });
    expect(() => assertCsrf(req, ["https://app.example"])).toThrow();
  });
  it("skips safe methods", () => {
    const req = new Request("https://app.example/api/x", { method: "GET" });
    expect(() => assertCsrf(req, ["https://app.example"])).not.toThrow();
  });
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement**

`app/lib/auth/csrf.ts`:
```ts
import { randomToken, timingSafeEqual } from "./crypto";

export class CsrfError extends Error {}
const SAFE = new Set(["GET", "HEAD", "OPTIONS"]);

export function issueCsrfToken(): string { return randomToken(24); }

function readCookie(req: Request, name: string): string | null {
  const raw = req.headers.get("cookie");
  if (!raw) return null;
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return null;
}

export function assertCsrf(req: Request, allowedOrigins: string[]): void {
  if (SAFE.has(req.method)) return;
  const origin = req.headers.get("origin");
  if (origin && !allowedOrigins.includes(origin)) throw new CsrfError("origin not allowed");
  const cookie = readCookie(req, "__Host-csrf");
  const header = req.headers.get("x-csrf-token");
  if (!cookie || !header || !timingSafeEqual(cookie, header)) throw new CsrfError("csrf token mismatch");
}
```

- [ ] **Step 4: Run → PASS.**

- [ ] **Step 5: Commit**

```powershell
git add app/lib/auth/csrf.ts tests/auth/csrf.test.ts
git commit -m "feat(auth): double-submit CSRF with origin allow-list"
```

---

### Task 10: Rate-limiter Durable Object (TDD)

**Files:** Create `workers/rate-limiter.ts`, `app/lib/auth/rate-limit.ts`; Test `tests/auth/rate-limit.test.ts`. Export the DO class from the worker entry.

- [ ] **Step 1: Write the failing test**

```ts
import { env, runInDurableObject } from "cloudflare:test";
import { describe, it, expect } from "vitest";

describe("RateLimiter DO", () => {
  it("allows under the limit and blocks over it", async () => {
    const id = env.RATE_LIMITER.idFromName("login:acct:u1");
    const stub = env.RATE_LIMITER.get(id);
    let last: any;
    for (let i = 0; i < 6; i++) {
      const res = await stub.fetch("https://do/check?limit=5&windowMs=900000");
      last = await res.json();
    }
    expect(last.allowed).toBe(false);
    expect(last.remaining).toBe(0);
  });
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement the DO**

`workers/rate-limiter.ts`:
```ts
export class RateLimiter {
  state: DurableObjectState;
  constructor(state: DurableObjectState) { this.state = state; }
  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const limit = Number(url.searchParams.get("limit") ?? "5");
    const windowMs = Number(url.searchParams.get("windowMs") ?? "900000");
    const now = Date.now();
    let hits = (await this.state.storage.get<number[]>("hits")) ?? [];
    hits = hits.filter((t) => now - t < windowMs);
    const allowed = hits.length < limit;
    if (allowed) { hits.push(now); await this.state.storage.put("hits", hits); }
    return Response.json({ allowed, remaining: Math.max(0, limit - hits.length) });
  }
}
```
Client wrapper `app/lib/auth/rate-limit.ts`:
```ts
export async function checkRateLimit(
  ns: DurableObjectNamespace, key: string, limit: number, windowMs: number): Promise<boolean> {
  const stub = ns.get(ns.idFromName(key));
  const res = await stub.fetch(`https://do/check?limit=${limit}&windowMs=${windowMs}`);
  const { allowed } = (await res.json()) as { allowed: boolean };
  return allowed;
}
```
Re-export `RateLimiter` from the worker entry (`workers/app.ts`) so the binding resolves.

- [ ] **Step 4: Run → PASS.**

- [ ] **Step 5: Commit**

```powershell
git add workers/rate-limiter.ts app/lib/auth/rate-limit.ts workers/app.ts tests/auth/rate-limit.test.ts
git commit -m "feat(auth): Durable Object sliding-window rate limiter"
```

---

### Task 11: Zod schemas + audit helper + cookies (TDD)

**Files:** Create `app/lib/auth/schemas.ts`, `app/lib/audit.ts`, `app/lib/auth/cookies.ts`; Test `tests/auth/schemas.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { loginSchema, activateSchema } from "~/lib/auth/schemas";

describe("auth schemas", () => {
  it("accepts a valid login", () => {
    expect(loginSchema.parse({ email: "A@X.io ", password: "x".repeat(12) }).email).toBe("a@x.io");
  });
  it("rejects a short password on activate", () => {
    expect(activateSchema.safeParse({ token: "t", password: "short" }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement**

`app/lib/auth/schemas.ts`:
```ts
import { z } from "zod";
const password = z.string().min(12).max(128);
const email = z.string().email().transform((s) => s.trim().toLowerCase());
export const loginSchema = z.object({ email, password: z.string().min(1), turnstileToken: z.string().optional() });
export const refreshSchema = z.object({}).passthrough();
export const activateSchema = z.object({ token: z.string().min(1), password });
export const resetRequestSchema = z.object({ email, turnstileToken: z.string().min(1) });
export const resetConfirmSchema = z.object({ token: z.string().min(1), password });
```
`app/lib/audit.ts`:
```ts
import type { DbClient } from "~/lib/db/client";
import { auditLog } from "~/lib/db/schema";  // add this table to schema.ts if not already mapped
export async function writeAudit(db: DbClient, e: {
  actorUserId?: string | null; action: string; entityType: string; entityId?: string | null;
  summary?: string; ip?: string | null; userAgent?: string | null;
}) {
  await db.insert(auditLog).values({
    actorUserId: e.actorUserId ?? null, action: e.action, entityType: e.entityType,
    entityId: e.entityId ?? null, summary: e.summary ?? null, ip: e.ip ?? null,
    userAgent: e.userAgent ?? null, createdAt: new Date().toISOString(),
  });
}
```
`app/lib/auth/cookies.ts`:
```ts
export function buildAuthCookie(name: "__Host-at" | "__Host-rt", value: string, maxAgeSec: number, path = "/"): string {
  return `${name}=${value}; HttpOnly; Secure; SameSite=Strict; Path=${path}; Max-Age=${maxAgeSec}`;
}
export function buildCsrfCookie(value: string): string {
  return `__Host-csrf=${value}; Secure; SameSite=Strict; Path=/; Max-Age=86400`;
}
export function clearCookie(name: string, path = "/"): string {
  return `${name}=; HttpOnly; Secure; SameSite=Strict; Path=${path}; Max-Age=0`;
}
```

- [ ] **Step 4: Run → PASS.**

- [ ] **Step 5: Commit**

```powershell
git add app/lib/auth/schemas.ts app/lib/audit.ts app/lib/auth/cookies.ts tests/auth/schemas.test.ts
git commit -m "feat(auth): Zod schemas, audit helper, hardened cookie builders"
```

---

### Task 12: Auth context middleware (TDD)

**Files:** Create `app/lib/auth/context.ts`, `app/lib/rbac/authorize.ts`; Test `tests/auth/context.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { signAccessToken } from "~/lib/auth/jwt";
import { getAuth, requirePermission, UnauthorizedError, ForbiddenError } from "~/lib/auth/context";

const SECRET = "test-secret-at-least-32-bytes-long-xxxxx";

describe("auth context", () => {
  it("parses a Bearer token into an auth context", async () => {
    const t = await signAccessToken({ sub: "u1", role: "church_admin", scope: { departments: [], cells: [] } }, SECRET);
    const req = new Request("https://x", { headers: { authorization: `Bearer ${t}` } });
    const auth = await getAuth(req, SECRET);
    expect(auth?.role).toBe("church_admin");
  });
  it("requirePermission allows church_admin to create members", async () => {
    const t = await signAccessToken({ sub: "u1", role: "church_admin", scope: { departments: [], cells: [] } }, SECRET);
    const auth = await getAuth(new Request("https://x", { headers: { authorization: `Bearer ${t}` } }), SECRET);
    expect(() => requirePermission(auth!, "members:create")).not.toThrow();
  });
  it("requirePermission forbids member from creating members", async () => {
    const t = await signAccessToken({ sub: "u2", role: "member", scope: { memberId: "m2", departments: [], cells: [] } }, SECRET);
    const auth = await getAuth(new Request("https://x", { headers: { authorization: `Bearer ${t}` } }), SECRET);
    expect(() => requirePermission(auth!, "members:create")).toThrow(ForbiddenError);
  });
  it("getAuth returns null without a token", async () => {
    expect(await getAuth(new Request("https://x"), SECRET)).toBeNull();
  });
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement**

`app/lib/auth/context.ts`:
```ts
import { verifyAccessToken, type AccessScope } from "./jwt";
import { can, type Permission, type Role, type Scope } from "~/lib/rbac/permissions";

export class UnauthorizedError extends Error {}
export class ForbiddenError extends Error {}
export interface AuthContext { userId: string; role: Role; scope: AccessScope; jti: string; }

function bearer(req: Request): string | null {
  const h = req.headers.get("authorization");
  if (h?.startsWith("Bearer ")) return h.slice(7);
  const cookie = req.headers.get("cookie") ?? "";
  const m = cookie.match(/(?:^|;\s*)__Host-at=([^;]+)/);
  return m ? m[1] : null;
}

export async function getAuth(req: Request, secret: string): Promise<AuthContext | null> {
  const token = bearer(req);
  if (!token) return null;
  try {
    const c = await verifyAccessToken(token, secret);
    return { userId: c.sub, role: c.role as Role, scope: c.scope, jti: c.jti };
  } catch { return null; }
}

export function requireUser(auth: AuthContext | null): AuthContext {
  if (!auth) throw new UnauthorizedError("authentication required");
  return auth;
}

export function requirePermission(auth: AuthContext | null, perm: Permission): Scope {
  const a = requireUser(auth);
  const scope = can(a.role, perm);
  if (!scope) throw new ForbiddenError(`missing permission: ${perm}`);
  return scope;
}
```
`app/lib/rbac/authorize.ts` (mutation-time DB re-verification):
```ts
import type { DbClient } from "~/lib/db/client";
import type { AuthContext } from "~/lib/auth/context";
import type { Scope } from "./permissions";
import { ForbiddenError } from "~/lib/auth/context";

// Confirms the actor's live scope covers the target's department/cell.
export async function assertScope(
  _db: DbClient, auth: AuthContext, scope: Scope, target: { departmentId?: string; cellId?: string; memberId?: string }) {
  if (scope === "all") return;
  if (scope === "self" && target.memberId && target.memberId === auth.scope.memberId) return;
  if (scope === "department" && target.departmentId && auth.scope.departments.includes(target.departmentId)) return;
  if (scope === "cell" && target.cellId && auth.scope.cells.includes(target.cellId)) return;
  throw new ForbiddenError("out of scope");
}
```

- [ ] **Step 4: Run → PASS.**

- [ ] **Step 5: Commit**

```powershell
git add app/lib/auth/context.ts app/lib/rbac/authorize.ts tests/auth/context.test.ts
git commit -m "feat(auth): auth context middleware + scope authorization"
```

---

### Task 13: Login endpoint (integration TDD)

**Files:** Create `app/routes/api.auth.login.ts`; Test `tests/auth/login.route.test.ts`

- [ ] **Step 1: Write the failing test** (seed a user, post credentials, assert cookies + audit)

```ts
import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import worker from "../../workers/app";
import { hashPassword } from "~/lib/auth/password";

beforeEach(async () => {
  await env.DB.exec("DELETE FROM users");
  const h = await hashPassword("password-123456", 50_000);
  await env.DB.prepare("INSERT INTO users (id, full_name, email, password_hash, role_id) VALUES (?,?,?,?,?)")
    .bind("u1", "Admin", "admin@pensa.gctu", h, "role_church_admin").run();
});

describe("POST /api/auth/login", () => {
  it("sets auth cookies on valid credentials", async () => {
    const req = new Request("https://app/api/auth/login", {
      method: "POST", headers: { "content-type": "application/json", origin: "https://app" },
      body: JSON.stringify({ email: "admin@pensa.gctu", password: "password-123456" }) });
    const ctx = createExecutionContext();
    const res = await worker.fetch(req, env, ctx);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie") ?? "").toContain("__Host-at=");
  });
  it("rejects bad credentials uniformly with 401", async () => {
    const req = new Request("https://app/api/auth/login", {
      method: "POST", headers: { "content-type": "application/json", origin: "https://app" },
      body: JSON.stringify({ email: "admin@pensa.gctu", password: "wrong" }) });
    const ctx = createExecutionContext();
    const res = await worker.fetch(req, env, ctx);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement the action**

`app/routes/api.auth.login.ts`:
```ts
import type { ActionFunctionArgs } from "react-router";
import { eq } from "drizzle-orm";
import { makeDb } from "~/lib/db/client";
import { users } from "~/lib/db/schema";
import { loginSchema } from "~/lib/auth/schemas";
import { verifyPassword } from "~/lib/auth/password";
import { signAccessToken } from "~/lib/auth/jwt";
import { issueRefreshToken } from "~/lib/auth/refresh";
import { buildAuthCookie, buildCsrfCookie } from "~/lib/auth/cookies";
import { issueCsrfToken } from "~/lib/auth/csrf";
import { checkRateLimit } from "~/lib/auth/rate-limit";
import { verifyTurnstile } from "~/lib/auth/turnstile";
import { writeAudit } from "~/lib/audit";
import { resolveScope } from "~/lib/rbac/scope";   // small helper: load departments/cells/memberId for a user

const UNIFORM_401 = () => Response.json({ error: "invalid credentials" }, { status: 401 });

export async function action({ request, context }: ActionFunctionArgs) {
  const env = (context as any).cloudflare.env;
  const ip = request.headers.get("CF-Connecting-IP") ?? undefined;
  const ua = request.headers.get("user-agent") ?? undefined;
  const body = loginSchema.parse(await request.json());

  if (!(await checkRateLimit(env.RATE_LIMITER, `login:ip:${ip}`, 20, 900_000)) ||
      !(await checkRateLimit(env.RATE_LIMITER, `login:acct:${body.email}`, 5, 900_000))) {
    return Response.json({ error: "too many attempts" }, { status: 429 });
  }

  const db = makeDb(env.DB);
  const [user] = await db.select().from(users).where(eq(users.email, body.email)).limit(1);
  const valid = user && !user.deletedAt && (!user.lockedUntil || new Date(user.lockedUntil) < new Date())
    && (await verifyPassword(body.password, user.passwordHash));

  if (!valid) {
    if (user) await db.update(users).set({ failedLoginCount: (user.failedLoginCount ?? 0) + 1 }).where(eq(users.id, user.id));
    await writeAudit(db, { actorUserId: user?.id ?? null, action: "auth.login.failure", entityType: "user", entityId: user?.id, ip, userAgent: ua });
    return UNIFORM_401();
  }
  // optional Turnstile escalation after a prior failure
  if ((user.failedLoginCount ?? 0) > 0 && !(await verifyTurnstile(body.turnstileToken ?? "", env.TURNSTILE_SECRET, ip))) {
    return Response.json({ error: "challenge required" }, { status: 401 });
  }

  await db.update(users).set({ failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date().toISOString() }).where(eq(users.id, user.id));
  const scope = await resolveScope(db, user);                 // { memberId?, departments[], cells[] }
  const access = await signAccessToken({ sub: user.id, role: user.roleName, scope }, env.JWT_SECRET);
  const { token: refresh } = await issueRefreshToken(db, { userId: user.id, ip, userAgent: ua });
  await writeAudit(db, { actorUserId: user.id, action: "auth.login.success", entityType: "user", entityId: user.id, ip, userAgent: ua });

  const headers = new Headers();
  headers.append("set-cookie", buildAuthCookie("__Host-at", access, 900));
  headers.append("set-cookie", buildAuthCookie("__Host-rt", refresh, 2_592_000, "/api/auth"));
  headers.append("set-cookie", buildCsrfCookie(issueCsrfToken()));
  return Response.json({ ok: true }, { headers });
}
```
> Note: `resolveScope` (`app/lib/rbac/scope.ts`) and joining `users.role_id → roles.name` (exposed as `user.roleName`) are small helpers; add them with unit tests in this task. `resolveScope` returns `{ memberId: user.memberId ?? undefined, departments: [...led department ids], cells: [...led cell ids] }`.

- [ ] **Step 4: Run → PASS.**

- [ ] **Step 5: Commit**

```powershell
git add app/routes/api.auth.login.ts app/lib/rbac/scope.ts tests/auth/login.route.test.ts
git commit -m "feat(auth): login endpoint (rate-limit, hash verify, tokens, audit)"
```

---

### Task 14: Refresh + logout endpoints (integration TDD)

**Files:** Create `app/routes/api.auth.refresh.ts`, `app/routes/api.auth.logout.ts`; Test `tests/auth/refresh.route.test.ts`

- [ ] **Step 1: Write the failing test** — login, capture `__Host-rt`, call refresh, assert a new `__Host-at`; call refresh again with the OLD cookie and assert 401.

```ts
// (abridged) extract the __Host-rt value from login's set-cookie, then:
const res = await worker.fetch(new Request("https://app/api/auth/refresh", {
  method: "POST", headers: { cookie: `__Host-rt=${rt}`, origin: "https://app", "x-csrf-token": csrf, "__Host-csrf": csrf } }), env, ctx);
expect(res.status).toBe(200);
expect(res.headers.get("set-cookie") ?? "").toContain("__Host-at=");
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement**

`app/routes/api.auth.refresh.ts`:
```ts
import type { ActionFunctionArgs } from "react-router";
import { makeDb } from "~/lib/db/client";
import { rotateRefreshToken, RefreshReuseError } from "~/lib/auth/refresh";
import { signAccessToken } from "~/lib/auth/jwt";
import { buildAuthCookie } from "~/lib/auth/cookies";
import { assertCsrf } from "~/lib/auth/csrf";
import { resolveScopeByUserId } from "~/lib/rbac/scope";
import { writeAudit } from "~/lib/audit";

export async function action({ request, context }: ActionFunctionArgs) {
  const env = (context as any).cloudflare.env;
  assertCsrf(request, [new URL(request.url).origin]);
  const rt = (request.headers.get("cookie") ?? "").match(/__Host-rt=([^;]+)/)?.[1];
  if (!rt) return Response.json({ error: "no refresh token" }, { status: 401 });
  const db = makeDb(env.DB);
  try {
    const ip = request.headers.get("CF-Connecting-IP") ?? undefined;
    const { token, userId } = await rotateRefreshToken(db, rt, { ip });
    const { role, scope } = await resolveScopeByUserId(db, userId);
    const access = await signAccessToken({ sub: userId, role, scope }, env.JWT_SECRET);
    await writeAudit(db, { actorUserId: userId, action: "auth.token.refresh", entityType: "user", entityId: userId, ip });
    const headers = new Headers();
    headers.append("set-cookie", buildAuthCookie("__Host-at", access, 900));
    headers.append("set-cookie", buildAuthCookie("__Host-rt", token, 2_592_000, "/api/auth"));
    return Response.json({ ok: true }, { headers });
  } catch (e) {
    if (e instanceof RefreshReuseError) {
      await writeAudit(db, { action: "auth.token.reuse_detected", entityType: "user" });
      return Response.json({ error: "session invalidated" }, { status: 401 });
    }
    throw e;
  }
}
```
`app/routes/api.auth.logout.ts`:
```ts
import type { ActionFunctionArgs } from "react-router";
import { makeDb } from "~/lib/db/client";
import { sha256Hex } from "~/lib/auth/crypto";
import { revokeFamily } from "~/lib/auth/refresh";
import { refreshTokens } from "~/lib/db/schema";
import { eq } from "drizzle-orm";
import { clearCookie } from "~/lib/auth/cookies";
import { assertCsrf } from "~/lib/auth/csrf";

export async function action({ request, context }: ActionFunctionArgs) {
  const env = (context as any).cloudflare.env;
  assertCsrf(request, [new URL(request.url).origin]);
  const rt = (request.headers.get("cookie") ?? "").match(/__Host-rt=([^;]+)/)?.[1];
  if (rt) {
    const db = makeDb(env.DB);
    const [row] = await db.select().from(refreshTokens).where(eq(refreshTokens.tokenHash, await sha256Hex(rt))).limit(1);
    if (row) await revokeFamily(db, row.familyId);
  }
  const headers = new Headers();
  headers.append("set-cookie", clearCookie("__Host-at"));
  headers.append("set-cookie", clearCookie("__Host-rt", "/api/auth"));
  return Response.json({ ok: true }, { headers });
}
```

- [ ] **Step 4: Run → PASS.**

- [ ] **Step 5: Commit**

```powershell
git add app/routes/api.auth.refresh.ts app/routes/api.auth.logout.ts tests/auth/refresh.route.test.ts
git commit -m "feat(auth): refresh (rotation/reuse) and logout endpoints"
```

---

### Task 15: Account activation + password reset endpoints (integration TDD)

**Files:** Create `app/routes/api.auth.activate.ts`, `app/routes/api.auth.reset-request.ts`, `app/routes/api.auth.reset-confirm.ts`; Test `tests/auth/activation.route.test.ts`, `tests/auth/reset.route.test.ts`

- [ ] **Step 1: Write the failing tests**

Activation: insert an `account_invitations` row with `token_hash = sha256(token)`; POST `{token, password}`; assert a `users` row is created with `role=member`, `member_id` set, and the invitation marked accepted.
Reset: insert a user + `password_reset_tokens` row; POST `{token, password}`; assert the hash changed and all refresh families for the user are revoked. Reset-request always returns 200 (uniform) regardless of whether the email exists.

```ts
// activation (abridged)
const token = "invite-token-123";
await env.DB.prepare("INSERT INTO account_invitations (id, member_id, email, token_hash, role_id, expires_at) VALUES (?,?,?,?,?,?)")
  .bind("i1","m1","new@pensa.gctu", await sha256Hex(token), "role_member", new Date(Date.now()+3600e3).toISOString()).run();
const res = await worker.fetch(new Request("https://app/api/auth/activate", {
  method:"POST", headers:{ "content-type":"application/json", origin:"https://app" },
  body: JSON.stringify({ token, password: "brand-new-pass-123" }) }), env, ctx);
expect(res.status).toBe(200);
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement**

`app/routes/api.auth.activate.ts`:
```ts
import type { ActionFunctionArgs } from "react-router";
import { eq } from "drizzle-orm";
import { makeDb } from "~/lib/db/client";
import { accountInvitations, users, members } from "~/lib/db/schema";
import { activateSchema } from "~/lib/auth/schemas";
import { sha256Hex } from "~/lib/auth/crypto";
import { hashPassword } from "~/lib/auth/password";
import { writeAudit } from "~/lib/audit";

export async function action({ request, context }: ActionFunctionArgs) {
  const env = (context as any).cloudflare.env;
  const { token, password } = activateSchema.parse(await request.json());
  const db = makeDb(env.DB);
  const [inv] = await db.select().from(accountInvitations)
    .where(eq(accountInvitations.tokenHash, await sha256Hex(token))).limit(1);
  if (!inv || inv.acceptedAt || new Date(inv.expiresAt) < new Date())
    return Response.json({ error: "invalid or expired invitation" }, { status: 400 });
  const [member] = await db.select().from(members).where(eq(members.id, inv.memberId)).limit(1);
  const hash = await hashPassword(password);
  await db.insert(users).values({
    fullName: `${member.firstName} ${member.lastName}`, email: inv.email, passwordHash: hash,
    roleId: inv.roleId, memberId: inv.memberId, emailVerifiedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  });
  await db.update(accountInvitations).set({ acceptedAt: new Date().toISOString() }).where(eq(accountInvitations.id, inv.id));
  await writeAudit(db, { action: "auth.account.activated", entityType: "member", entityId: inv.memberId });
  return Response.json({ ok: true });
}
```
`app/routes/api.auth.reset-request.ts`:
```ts
import type { ActionFunctionArgs } from "react-router";
import { eq } from "drizzle-orm";
import { makeDb } from "~/lib/db/client";
import { users, passwordResetTokens } from "~/lib/db/schema";
import { resetRequestSchema } from "~/lib/auth/schemas";
import { verifyTurnstile } from "~/lib/auth/turnstile";
import { randomToken, sha256Hex } from "~/lib/auth/crypto";
import { writeAudit } from "~/lib/audit";

export async function action({ request, context }: ActionFunctionArgs) {
  const env = (context as any).cloudflare.env;
  const ip = request.headers.get("CF-Connecting-IP") ?? undefined;
  const body = resetRequestSchema.parse(await request.json());
  if (!(await verifyTurnstile(body.turnstileToken, env.TURNSTILE_SECRET, ip)))
    return Response.json({ ok: true });                       // uniform
  const db = makeDb(env.DB);
  const [user] = await db.select().from(users).where(eq(users.email, body.email)).limit(1);
  if (user) {
    const token = randomToken(32);
    await db.insert(passwordResetTokens).values({
      userId: user.id, tokenHash: await sha256Hex(token),
      expiresAt: new Date(Date.now() + 3600e3).toISOString(), createdAt: new Date().toISOString() });
    // TODO(email): send `token` link via Resend (Phase 6 wiring)
    await writeAudit(db, { actorUserId: user.id, action: "auth.password.reset_request", entityType: "user", entityId: user.id, ip });
  }
  return Response.json({ ok: true });                          // always 200
}
```
`app/routes/api.auth.reset-confirm.ts`:
```ts
import type { ActionFunctionArgs } from "react-router";
import { and, eq } from "drizzle-orm";
import { makeDb } from "~/lib/db/client";
import { users, passwordResetTokens, refreshTokens } from "~/lib/db/schema";
import { resetConfirmSchema } from "~/lib/auth/schemas";
import { sha256Hex } from "~/lib/auth/crypto";
import { hashPassword } from "~/lib/auth/password";
import { writeAudit } from "~/lib/audit";

export async function action({ request, context }: ActionFunctionArgs) {
  const env = (context as any).cloudflare.env;
  const { token, password } = resetConfirmSchema.parse(await request.json());
  const db = makeDb(env.DB);
  const [row] = await db.select().from(passwordResetTokens)
    .where(eq(passwordResetTokens.tokenHash, await sha256Hex(token))).limit(1);
  if (!row || row.usedAt || new Date(row.expiresAt) < new Date())
    return Response.json({ error: "invalid or expired token" }, { status: 400 });
  await db.update(users).set({ passwordHash: await hashPassword(password), passwordChangedAt: new Date().toISOString() }).where(eq(users.id, row.userId));
  await db.update(passwordResetTokens).set({ usedAt: new Date().toISOString() }).where(eq(passwordResetTokens.id, row.id));
  await db.update(refreshTokens).set({ revokedAt: new Date().toISOString() }).where(eq(refreshTokens.userId, row.userId));
  await writeAudit(db, { actorUserId: row.userId, action: "auth.password.changed", entityType: "user", entityId: row.userId });
  return Response.json({ ok: true });
}
```

- [ ] **Step 4: Run → PASS.**

- [ ] **Step 5: Commit**

```powershell
git add app/routes/api.auth.activate.ts app/routes/api.auth.reset-request.ts app/routes/api.auth.reset-confirm.ts tests/auth/activation.route.test.ts tests/auth/reset.route.test.ts
git commit -m "feat(auth): account activation and password reset endpoints"
```

---

### Task 16: Verification gate

- [ ] **Step 1: Full local suite**

Run: `npm run typecheck && npm run lint && npm test`
Expected: all PASS.

- [ ] **Step 2: Apply migration + seed to staging and smoke test**

Run:
```powershell
wrangler d1 migrations apply pensa-gctu-staging --env staging --remote
wrangler d1 execute pensa-gctu-staging --env staging --remote --file db/seeds/reference.sql
wrangler deploy --env staging
```
Then create a bootstrap admin (via `db/seed.ts`) and `curl -i` the login endpoint; expect `200` + `__Host-at` cookie. Bad password → `401`. Six rapid bad attempts → `429`.

- [ ] **Step 3: Commit any fixes and push**

```powershell
git push
```

---

## Definition of Done (Phase 1)

- All unit + integration tests green; typecheck + lint clean.
- Login issues access + rotating refresh + CSRF cookies; bad creds uniform 401; lockout + 429 under abuse.
- Refresh rotates and detects reuse (family revoke); logout revokes family.
- Member activation creates a scoped `member` account; password reset revokes sessions.
- RBAC `can()` + scope checks enforced; mutations re-verify scope from D1.
- Turnstile verified server-side; auth events in `audit_log`.
- Canonical 5-role seed applied; deprecated `admin`/`staff` removed/migrated.

## Self-Review Notes

- **Spec coverage:** JWT (Task 5), sessions/cookies (11/13), hashing (4), refresh tokens (6/14), RBAC (8/12), rate limiting (10/13), audit (11, wired throughout), Turnstile (7/13/15), CSRF (9/14), input validation (11). All ten requirements mapped.
- **Type consistency:** `signAccessToken`/`verifyAccessToken`/`AccessScope`/`can()`/`Scope`/`AuthContext` names are reused verbatim across tasks. `resolveScope`/`resolveScopeByUserId`/`user.roleName` are defined as helpers in Task 13 and reused in 14.
- **No UI:** every artifact is a server module, resource route, test, or migration. UI is a later phase.
- **Iteration counts:** tests use 50_000 iterations for speed; production default is 210_000 (configurable).
