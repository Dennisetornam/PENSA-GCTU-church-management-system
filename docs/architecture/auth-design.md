# PENSA GCTU CMS — Authentication & Authorization Design

**Status:** Proposed (awaiting approval) · **Date:** 2026-06-04
**Runtime:** Cloudflare Workers · **DB:** D1 · **Edge state:** KV + Durable Objects
**Supersedes:** the provisional role set in `system-design.md` (`admin`/`staff`) — see §1.

> Scope of this document: architecture only. The companion implementation plan is
> `docs/implementation-plans/phase-1-auth.md`. **No UI is designed here** — only the
> server-side auth/authz engine and the API contract the UI will later consume.

---

## 1. Roles (canonical, updated)

| # | Role key | Display | Scope | Logs in? |
|---|---|---|---|---|
| 1 | `super_admin` | Super Admin | Global, incl. users/roles/audit/settings | Yes |
| 2 | `church_admin` | Church Administrator | Global domain (members, attendance, events, lookups, approvals, analytics); cannot manage `super_admin` accounts | Yes |
| 3 | `department_leader` | Department Leader | Own department(s) only | Yes |
| 4 | `cell_leader` | Cell Leader | Own cell only | Yes |
| 5 | `member` | Member | Self only (own profile + own attendance) | Yes |

This replaces the earlier `admin`/`staff` placeholders. The implementation plan includes a migration + seed update and a one-line note in `system-design.md`.

**Account ↔ member linkage:** `users.member_id` (nullable FK → `members.id`). Staff/admin accounts may have `member_id = NULL`; a Member-role account always links to exactly one member row. Members receive an account via **invitation after approval** (not open self-signup), preserving the approval gate.

---

## 2. Token Architecture (build-to-scale core)

Hybrid model — **stateless short access JWT + stateful rotating opaque refresh token**:

| Token | Type | Lifetime | Storage | Verification |
|---|---|---|---|---|
| **Access** | Signed JWT (HS256, `jose`) | 15 min | `__Host-at` httpOnly cookie **and/or** `Authorization: Bearer` (mobile) | Stateless at the edge — no DB hit |
| **Refresh** | Opaque 256-bit random | 30 days (sliding) | `__Host-rt` httpOnly cookie, path-scoped to `/api/auth` | Hashed (SHA-256) lookup in D1 `refresh_tokens` |

**Why this split:** access tokens are verified purely from signature + claims (scales to any RPS with zero database load), while refresh tokens are the only thing touching the DB and only every 15 minutes per user.

**Access JWT claims:** `sub` (user id), `role`, `scope` (`{departments:[...], cells:[...], memberId}` for leader/member authorization without a DB round-trip), `jti`, `iss=pensa-gctu`, `aud=pensa-gctu-web`, `iat`, `exp`.

**Refresh token rotation + reuse detection:**
- Each refresh issues a **new** refresh token and revokes the presented one (one-time use).
- Tokens belong to a **family** (`family_id`). Presenting an already-used/revoked token = theft signal → **revoke the entire family** and force re-login. This is the OWASP-recommended refresh-token-rotation-with-reuse-detection pattern.
- Logout revokes the family; "logout everywhere" revokes all families for the user.

**Signing key — scale path:** v1 uses HS256 with `JWT_SECRET` (Wrangler secret) plus a `kid` header so we can rotate secrets without downtime (verify against current + previous). Documented upgrade to **EdDSA (Ed25519) asymmetric** signing + JWKS when multiple services must verify tokens without sharing the signing key.

---

## 3. Password Hashing

- **Algorithm:** PBKDF2-HMAC-SHA256 via **WebCrypto** (native in Workers — zero dependencies, no WASM cold-start, no memory-pressure surprises).
- **Parameters:** 210,000 iterations (tunable via `settings('auth.pbkdf2_iterations')`), 16-byte random salt, 32-byte derived key.
- **Encoding:** `pbkdf2$sha256$<iterations>$<salt_b64>$<hash_b64>` — iteration count stored per-hash so we can raise the cost over time and re-hash on next successful login.
- **Comparison:** constant-time (compare derived bytes, not strings).
- **Scale/cost note:** PBKDF2 at this cost is meaningful CPU per login; production should run on the **Workers Paid plan** (higher CPU budget). Documented upgrade to **Argon2id (hash-wasm)** if memory-hardness is later required.

---

## 4. Session Management

- **Web:** tokens delivered as cookies with hardened attributes:
  - `__Host-at`: `HttpOnly; Secure; SameSite=Strict; Path=/`
  - `__Host-rt`: `HttpOnly; Secure; SameSite=Strict; Path=/api/auth`
  - `__Host-` prefix forces Secure + host-only (no `Domain`) — blocks subdomain cookie injection.
- **Mobile/API (future):** identical access JWT via `Authorization: Bearer`; refresh via JSON body to `/api/auth/refresh`. Same backend, no rework.
- **Idle + absolute expiry:** access 15 min (idle), refresh family absolute max 30 days; re-auth required after.
- **Revocation:** because access tokens are stateless, a short-TTL **KV denylist of `jti`** supports immediate revocation (e.g., on account suspension) within the 15-min window.

---

## 5. Role-Based Access Control

**Model:** roles in D1; a **typed permission map in code** (single source of truth, testable) maps `role → Set<permission>` plus a **scope qualifier** (`all | department | cell | self`).

**Permissions (resource:action):** `members:create|read|update|delete`, `members:read_own|update_own`, `attendance:record|read`, `events:manage|read`, `registrations:review`, `departments:manage`, `cells:manage`, `programmes:manage`, `gathering_types:manage`, `analytics:view`, `users:manage`, `roles:manage`, `audit:view`.

**Permission matrix:**

| Permission | super_admin | church_admin | department_leader | cell_leader | member |
|---|:--:|:--:|:--:|:--:|:--:|
| members:create | ✔ | ✔ | — | — | — |
| members:read | ✔ | ✔ | ▲ dept | ▲ cell | — |
| members:read_own / update_own | ✔ | ✔ | ✔ | ✔ | ✔ self |
| members:update | ✔ | ✔ | ▲ dept | — | — |
| members:delete | ✔ | ✔ | — | — | — |
| registrations:review | ✔ | ✔ | — | — | — |
| attendance:record | ✔ | ✔ | ▲ dept | ▲ cell | — |
| attendance:read | ✔ | ✔ | ▲ dept | ▲ cell | ▲ self |
| events:manage | ✔ | ✔ | ▲ dept | — | — |
| events:read | ✔ | ✔ | ✔ | ✔ | ✔ |
| departments/cells/programmes/gathering_types:manage | ✔ | ✔ | — | — | — |
| analytics:view | ✔ | ✔ | ▲ dept | ▲ cell | — |
| users:manage | ✔ | ✔* | — | — | — |
| roles:manage | ✔ | — | — | — | — |
| audit:view | ✔ | — | — | — | — |

`✔ = allowed · ▲ = own-scope only · —  = denied · * church_admin cannot create/modify super_admin accounts.`

**Enforcement points (defense in depth):**
1. **Edge / fast path:** `role` + `scope` read from the verified JWT authorize reads without a DB hit.
2. **Resource check:** for scoped reads/writes, the requested entity's department/cell is checked against the token's scope.
3. **DB re-verification:** every **mutation** re-derives the actor's scope from D1 (membership in `member_departments` / `cells.leader_member_id`) — tokens are never trusted for writes. This closes the window where a leader is removed mid-token-life.

Scope is pre-modeled in the schema (no redesign): department leaders via `member_departments.role_in_department='lead'` or `departments.leader_member_id`; cell leaders via `cells.leader_member_id`.

---

## 6. CSRF Protection

Cookie-based auth requires CSRF defense even with `SameSite=Strict`:
- **Double-submit token:** a non-HttpOnly `__Host-csrf` cookie + matching `X-CSRF-Token` header required on all unsafe methods (POST/PUT/PATCH/DELETE). Server compares constant-time.
- **Origin/Referer allow-list** check on unsafe methods.
- `SameSite=Strict` on auth cookies as the first layer.
- Bearer-token (mobile) requests are exempt (no ambient cookies → no CSRF surface).

---

## 7. Rate Limiting

Layered, build-to-scale:
- **Edge (Cloudflare WAF rate-limiting rules):** coarse per-IP caps on `/api/auth/*` as a first wall (configured in dashboard/Terraform, documented).
- **Application (Durable Object `RateLimiter`):** strongly-consistent sliding-window counters for precise per-identity limits — keyed by **IP** and by **account**:
  - login: 5 failures / 15 min per account, 20 / 15 min per IP → then throttle + Turnstile escalation;
  - refresh: 60 / 15 min per account; register & password-reset: 5 / hour per IP.
- **Account lockout:** `users.failed_login_count` + `users.locked_until`; exponential backoff; reset on success.
- All limit breaches are audit-logged.

Durable Objects (not KV) are chosen for counters because they give **race-free** atomic increments — KV's eventual consistency would let attackers exceed limits via parallel requests.

---

## 8. Cloudflare Turnstile

- Turnstile widget on **login, registration, and password-reset** (UI later). The server **verifies** the `cf-turnstile-response` token against `https://challenges.cloudflare.com/turnstile/v0/siteverify` with `TURNSTILE_SECRET` before processing.
- Verification is **mandatory** for register/reset, and **escalated** for login after the first failure (frictionless first attempt, challenge on suspicion).
- Failures are rate-limited and audit-logged; the remote IP (`CF-Connecting-IP`) is passed to siteverify.

---

## 9. Audit Logging

Every auth event writes to the existing `audit_log` table (append-only):
`auth.login.success`, `auth.login.failure`, `auth.logout`, `auth.token.refresh`, `auth.token.reuse_detected`, `auth.lockout`, `auth.password.reset_request`, `auth.password.changed`, `auth.account.activated`, `user.role.changed`, `user.suspended`.
Captured: actor (nullable for failed/anonymous), `entity_type='user'`, `entity_id`, `ip` (`CF-Connecting-IP`), `user_agent`, and a non-sensitive `summary` (**never** passwords or token values).

---

## 10. Input Validation

- **Zod** schemas validate every auth payload at the boundary (login, register, refresh, activate, reset-request, reset-confirm, change-password).
- Email normalized (lowercase/trim); password policy enforced (min length 12, not in a small common-passwords denylist); phone normalized to E.164 where applicable.
- A standardized error envelope; validation errors never leak whether an email exists (uniform "invalid credentials" / "if an account exists…" responses).

---

## 11. Data Model Additions (ship in the Phase-1 migration)

```sql
-- users: account/security columns
ALTER TABLE users ADD COLUMN member_id TEXT REFERENCES members(id) ON DELETE SET NULL;
ALTER TABLE users ADD COLUMN email_verified_at   TEXT;
ALTER TABLE users ADD COLUMN failed_login_count  INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN locked_until        TEXT;
ALTER TABLE users ADD COLUMN password_changed_at TEXT;
CREATE INDEX ix_users_member ON users(member_id);

-- rotating refresh tokens (hashed, family-tracked, reuse-detectable)
CREATE TABLE refresh_tokens (
    id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    family_id   TEXT NOT NULL,                       -- rotation lineage
    token_hash  TEXT NOT NULL,                       -- sha256(token)
    parent_id   TEXT,                                -- previous token in the chain
    issued_at   TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at  TEXT NOT NULL,
    revoked_at  TEXT,
    replaced_by TEXT,
    ip          TEXT,
    user_agent  TEXT
);
CREATE UNIQUE INDEX ux_refresh_token_hash ON refresh_tokens(token_hash);
CREATE INDEX ix_refresh_user ON refresh_tokens(user_id);
CREATE INDEX ix_refresh_family ON refresh_tokens(family_id);

-- one-time account activation invitations (member onboarding after approval)
CREATE TABLE account_invitations (
    id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    member_id   TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    email       TEXT NOT NULL,
    token_hash  TEXT NOT NULL,
    role_id     TEXT NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
    expires_at  TEXT NOT NULL,
    accepted_at TEXT,
    created_by  TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX ix_invitation_member ON account_invitations(member_id);
```
`password_reset_tokens` already exists in the base schema and is reused.
**Bindings added to `wrangler.toml`:** `RATE_LIMITER` (Durable Object) and existing `KV` (jti denylist). New secrets: `JWT_SECRET`, `TURNSTILE_SECRET`.

---

## 12. Core Auth Flows

**Login**
```
POST /api/auth/login {email, password, turnstileToken?}
  → Zod validate → rate-limit (DO, by ip+account)
  → (Turnstile verify if escalated)
  → load user (live) → verify PBKDF2 hash (constant-time)
     fail → inc failed_login_count, maybe lock, audit login.failure, 401 uniform
  → success → reset counters → issue access JWT + refresh (new family)
  → set __Host-at / __Host-rt / __Host-csrf cookies → audit login.success
```

**Refresh (rotation + reuse detection)**
```
POST /api/auth/refresh  (reads __Host-rt)
  → hash token → lookup
     not found/expired → 401
     revoked/used  → REUSE: revoke whole family + KV-denylist jtis → audit reuse_detected → 401
  → valid → revoke presented, issue new refresh (same family) + new access → audit token.refresh
```

**Logout** → revoke refresh family + KV-denylist current jti + clear cookies → audit logout.

**Member onboarding** → admin approves registration → creates `account_invitations` (emailed link) → member sets password (`POST /api/auth/activate {token, password}`) → user row created/linked with `role=member`, `member_id` set → audit account.activated.

**Password reset** → `POST /api/auth/reset-request {email, turnstileToken}` (uniform response) → emailed one-time token → `POST /api/auth/reset-confirm {token, password}` → re-hash, revoke all refresh families → audit password.changed.

---

## 13. Threat Model & Scale Summary

| Concern | Mitigation |
|---|---|
| Credential stuffing / brute force | DO rate limiting + lockout + Turnstile escalation |
| Token theft / replay | Short access TTL + refresh rotation + reuse detection (family revoke) + KV jti denylist |
| XSS stealing tokens | HttpOnly `__Host-` cookies (JS can't read tokens) |
| CSRF | Double-submit token + SameSite=Strict + Origin check |
| Privilege escalation | DB re-verification of scope on every mutation; tokens never trusted for writes |
| Account enumeration | Uniform responses on login/reset |
| Bot signups | Mandatory Turnstile on register/reset |
| Throughput | Stateless access-token verification → zero DB load on the hot path; DB touched only on 15-min refresh |
| Key rotation | `kid`-tagged HS256 now; EdDSA + JWKS upgrade path |
| Mobile readiness | Same JWT via Bearer; refresh via JSON; no redesign |

**Libraries:** `jose` (JWT/WebCrypto), `zod` (validation), WebCrypto (PBKDF2, SHA-256, random) — minimal, Workers-native dependency surface.
