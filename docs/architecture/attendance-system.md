# PENSA GCTU CMS — Scalable Attendance System

**Status:** Proposed (architecture only — no code) · **Date:** 2026-06-04
**Runtime:** Cloudflare Workers (Hono) · **Store:** D1 + KV (cache) · optional Durable Object
**Builds on:** existing `attendance_sessions` / `attendance_records` (statuses: present · late · excused · absent), indexes `ux_attendance_session_member`, `ix_attendance_member`, `ix_sessions_type_date`.

**Scale target:** designed for **millions** of attendance rows (well beyond "thousands") with constant-time hot-path reads/writes — via sparse storage, precomputed rollups, and cached aggregates.

---

## 0. The scalability thesis (read this first)

Three decisions keep performance flat as data grows:

1. **Sparse records** — store a row only when a member is **present / late / excused**. **Absent is the absence of a row**, derived against the member roster. This turns "members × sessions" (e.g. 2,000 × 150/yr = 300k/yr, millions over time) into "actual attenders × sessions" and removes the biggest write/storage cost.
2. **Precomputed rollups** — per-session counts and per-member monthly tallies are maintained incrementally, so dashboards never scan the raw fact table.
3. **Cached aggregates** — analytics responses cached in KV keyed by `(query, filters)`; invalidated on session close.

Everything below follows from these.

---

## 1. Data Model (existing + proposed additions)

### Existing (unchanged)
- **attendance_sessions**: `id, gathering_type_id, event_id?, title, session_date, status(open|closed), recorded_by, …`
- **attendance_records**: `id, session_id, member_id, status(present|late|excused|absent), checked_in_at, …` · `UNIQUE(session_id, member_id)` · index `member_id`.

### Proposed additions (design — applied when we build)
```sql
-- how the mark was captured (audit + analytics)
ALTER TABLE attendance_records ADD COLUMN method TEXT
    CHECK (method IN ('manual','qr','kiosk','import'));   -- default 'manual'
ALTER TABLE attendance_records ADD COLUMN recorded_by TEXT REFERENCES users(id);

-- Storage rule: only present/late/excused are persisted; 'absent' is implicit
-- (no row). An explicit 'absent'/'excused' row is allowed when a leader wants to
-- record the distinction, but the default "unmarked = absent" needs no rows.

-- Per-session denormalized counts (1 row per session) → dashboards never scan records
CREATE TABLE attendance_session_summary (
    session_id     TEXT PRIMARY KEY REFERENCES attendance_sessions(id) ON DELETE CASCADE,
    eligible_count INTEGER NOT NULL DEFAULT 0,   -- roster size in scope at close
    present        INTEGER NOT NULL DEFAULT 0,
    late           INTEGER NOT NULL DEFAULT 0,
    excused        INTEGER NOT NULL DEFAULT 0,
    attended       INTEGER NOT NULL DEFAULT 0,   -- present + late
    finalized_at   TEXT
);

-- Per-member monthly rollup → O(1) history & absentee analytics at any scale
CREATE TABLE member_attendance_monthly (
    member_id   TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    year_month  TEXT NOT NULL,                   -- 'YYYY-MM'
    present     INTEGER NOT NULL DEFAULT 0,
    late        INTEGER NOT NULL DEFAULT 0,
    excused     INTEGER NOT NULL DEFAULT 0,
    sessions    INTEGER NOT NULL DEFAULT 0,      -- eligible sessions that month
    last_attended_date TEXT,
    PRIMARY KEY (member_id, year_month)
);

-- QR revocation knob (token signed statelessly; bump to invalidate a member's QR)
ALTER TABLE members ADD COLUMN qr_version INTEGER NOT NULL DEFAULT 1;

-- Composite index to make per-member history fast even with millions of rows
CREATE INDEX ix_attendance_member_session ON attendance_records(member_id, session_id);
```

---

## 2. Attendance Sessions

- **Lifecycle:** `open → closed`. Create with `{gathering_type_id, session_date, title?}`; `recorded_by` set. Marking allowed only while **open**.
- **Idempotent creation:** soft-guard against duplicate sessions for the same `(gathering_type_id, session_date)` (warn/return existing) so two ushers don't create twins.
- **On close (finalize):** compute `attendance_session_summary` once (counts + `eligible_count` from the in-scope roster), then **increment `member_attendance_monthly`** for each attender, and **invalidate** related KV analytics keys. Closing is the single point where rollups update — cheap and bounded by attenders, not membership.
- **Re-open:** allowed by admin; reverses the summary/rollup deltas before edits, re-applies on re-close (or recompute).

---

## 3. Manual Attendance

- **Mark screen:** search a member by **name / phone / member_code** (indexed) → set status. Bulk **"mark all present"** for a filtered roster (by cell/department). Filters narrow the roster to keep the list small on mobile.
- **Write path:** `PUT /sessions/:id/records` accepts `[{memberId, status}]` and performs an **idempotent batch upsert** (`INSERT … ON CONFLICT(session_id,member_id) DO UPDATE`) in one D1 `batch()` — safe to retry, no duplicates. Sparse rule applies: marking "absent" removes/skips the row.
- **Offline-tolerant:** the client queues marks locally and replays them; idempotency makes replay harmless (key for ushers on weak Wi-Fi at large gatherings).

---

## 4. QR Attendance

Members are records-only (no login), so QR is an **input accelerator**, supported in three modes — all funnel into the same idempotent write path:

1. **Member QR card (primary):** each member has a QR encoding a **signed token** `HMAC(member_id, qr_version)` (stateless, forgery-proof, revocable by bumping `qr_version`). An usher opens the dashboard **scanner** (device camera), scans the card/phone, the server resolves the token → member, and marks **present** in the open session. Sub-second, no typing.
2. **Kiosk self-check-in (optional):** a tablet at the entrance runs a **kiosk page** bound to the open session; a member scans their own QR card → records present. No member login needed (the signed token is the identity). Rate-limited + session-bound.
3. **Session QR fallback:** a printed session QR opens the kiosk page on a member's phone, which then asks them to scan/enter their member card — same resolve path.

- **Endpoint:** `POST /check-in {token, sessionId}` → verify HMAC + `qr_version` → resolve member → upsert record (`method='qr'|'kiosk'`). Protected by the existing **RateLimiter** (`/check-in` 300/h/admin) and, for kiosk, a per-session/IP limit to stop scanning abuse.
- **Anti-abuse:** signed tokens prevent ID guessing; duplicate scans are idempotent (already present → no-op); revocation via `qr_version`.

---

## 5. Attendance History

- **Per member:** `GET /members/:id/attendance` → served primarily from **`member_attendance_monthly`** (O(1) per month) for summaries, with `ix_attendance_member_session` for drill-down to individual sessions. Cursor-paginated.
- **Per session:** `GET /sessions/:id/records` → indexed by `session_id` (unique index covers it); roster view joins members for names.
- **Per cell/department:** scoped queries join records → sessions/members; bounded by attenders, not total membership.
- Constant cost as the fact table grows because summaries/rollups answer the common questions without scanning raw rows.

---

## 6. Attendance Reports

Parameterized, filterable (date range · gathering type · cell · department), exportable CSV/print:
- **Attendance summary** (counts + rate per gathering/cell/department) — from `attendance_session_summary` + roster denominators.
- **Absentee list** — **anti-join**: members in scope **without** a record in the selected session(s); for ranges, members whose `member_attendance_monthly` shows no attendance — efficient because rollups carry `last_attended_date`.
- **Per-member attendance sheet**, **new-member first-attendance**, **consecutive-absence watchlist**.
- **Endpoint:** `GET /reports/attendance/:type?range&gatheringTypeId&cellId&departmentId&format=json|csv`. Large CSV exports stream and may run as a background job for big ranges.

---

## 7. Attendance Analytics

- **Charts:** attendance **trend per gathering type** (multi-line), **rate by cell**, **department participation**, **visitor→member** progression, **absentee watchlist**, **retention**.
- **Source:** `attendance_session_summary` (trends/rates) + `member_attendance_monthly` (retention/absentees) — never the raw fact table.
- **Caching:** responses cached in **KV** keyed by `(metric, filters, range)` with short TTL; **invalidated on session close**. Hot dashboards serve from cache → flat latency regardless of history size.
- **Endpoint:** `GET /analytics/attendance/:metric?range&gatheringTypeId&cellId&departmentId`.

---

## 8. Scalability Architecture (summary)

| Lever | Mechanism | Effect |
|---|---|---|
| **Sparse storage** | only present/late/excused persisted; absent derived | rows scale with *attenders×sessions*, not *members×sessions* |
| **Indexes** | `UNIQUE(session_id,member_id)`, `(member_id,session_id)`, `(gathering_type_id,session_date)` | O(log n) roster, history, range queries |
| **Per-session rollup** | `attendance_session_summary` filled on close | dashboards read 1 row/session, never scan records |
| **Per-member rollup** | `member_attendance_monthly` incremented on close | O(1) history & absentee analytics |
| **KV cache** | aggregate responses cached, invalidated on close | flat analytics latency |
| **Idempotent batch writes** | `ON CONFLICT … DO UPDATE` in D1 `batch()` | safe retries, no dupes, fast bulk marking |
| **Offline queue + replay** | client buffers marks, replays idempotently | reliable at large gatherings on weak networks |
| **Read scaling** | D1 **read replication** for analytics reads | reads scale out from writes |
| **Extreme concurrency (optional)** | **Durable Object per open session** to serialize check-ins | only if a single gathering exceeds D1 write concurrency comfort |
| **Pagination** | cursor-based on all history/list endpoints | bounded payloads |

**Capacity sanity check:** 2,000 members, ~3 gatherings/week → ~150 sessions/yr. Even if everyone attended everything (worst case), ~300k rows/yr; realistic sparse load is far less. D1 handles **millions** of indexed rows comfortably; rollups + cache mean the dashboard cost is **independent** of that row count.

---

## 9. API Surface (attendance)

| Method | Route | Purpose | Min role / scope |
|---|---|---|---|
| GET | `/api/attendance/sessions?gatheringTypeId&date&page` | list sessions | scope ▲ |
| POST | `/api/attendance/sessions` | create session | staff scope ▲ |
| GET | `/api/attendance/sessions/:id` | session + summary | scope ▲ |
| GET | `/api/attendance/sessions/:id/roster?cellId&departmentId&q` | mark roster | scope ▲ |
| PUT | `/api/attendance/sessions/:id/records` | idempotent batch upsert | scope ▲ |
| POST | `/api/attendance/sessions/:id/close` | finalize → rollups + cache bust | scope ▲ |
| POST | `/api/check-in` | QR/kiosk mark (signed token) | scope ▲ / kiosk |
| GET | `/api/members/:id/attendance` | per-member history | scope ▲ |
| GET | `/api/reports/attendance/:type` | reports (CSV/json) | scope ▲ |
| GET | `/api/analytics/attendance/:metric` | charts (KV-cached) | scope ▲ |
| GET | `/api/members/:id/qr` | member QR token/image | staff |

All: authenticate (JWT) → authorize (role+scope) → validate (Zod) → service → audit. Leader scope (cell/department) applied to roster, history, reports, analytics.

---

## 10. Security & Integrity
- **Signed QR tokens** (HMAC + `qr_version`) — unforgeable, revocable; no member PII in the QR.
- **Idempotency** via the unique constraint → exactly-once marks under retries/concurrency.
- **Rate limiting** on `/check-in` and `/attendance/*` (RateLimiter DO, already live).
- **Audit:** session create/close, bulk marks (count), QR revocation logged to `audit_log`.
- **Integrity:** marking only on open sessions; rollups recomputed on re-open/edit to stay consistent.

---

## 11. Out of Scope (future)
Geofenced check-in, NFC cards, real-time live attendance counters (could layer a Durable Object broadcast), and biometric capture.
