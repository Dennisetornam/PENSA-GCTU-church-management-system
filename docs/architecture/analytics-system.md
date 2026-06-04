# PENSA GCTU CMS — Analytics System

**Status:** Proposed (architecture + DB requirements — no code) · **Date:** 2026-06-04
**Runtime:** Cloudflare Workers (Hono) · **Store:** D1 + KV (cache) + R2 (export files) · Cron Triggers (snapshots) · Queues + Browser Rendering (heavy exports)
**Builds on:** members lifecycle (`membership_status`, `membership_history`), attendance rollups (`attendance_session_summary`, `member_attendance_monthly`), and the analytics endpoints sketched in the dashboard/attendance designs.

**Principle:** dashboards read **precomputed aggregates** (live GROUP-BY on indexed columns for *current* numbers, snapshot/rollup tables for *trends*), all **KV-cached** — so latency stays flat as the database grows.

---

## 1. Dashboards (definition · source · refresh)

| # | Dashboard | Definition | Source | Refresh |
|---|---|---|---|---|
| 1 | **Total Members** | `count(members WHERE deleted_at IS NULL AND registration_status='approved')` | live GROUP-BY (indexed) | KV cache (10 min) |
| 2 | **Active Members** | members with attendance in the last **90 days** (engagement) — *secondary view:* `membership_status='actual_member'` | `member_attendance_monthly.last_attended_date` | KV (10 min) |
| 3 | **Visitors** | `membership_status='visitor'` | live count (indexed) | KV (10 min) |
| 4 | **Associates** | `membership_status='associate'` | live count | KV (10 min) |
| 5 | **Alumni** | `membership_status='alumni'` | live count | KV (10 min) |
| 6 | **Department Distribution** | members per department | GROUP-BY `member_departments.department_id` (indexed) | KV (15 min) |
| 7 | **Cell Distribution** | members per cell (Dunamis/Moriah/Peniel) | GROUP-BY `members.cell_id` (indexed) | KV (15 min) |
| 8 | **Baptism Statistics** | counts/% Holy Ghost + Water baptized | partial-indexed counts | KV (15 min) |
| 9 | **Attendance Trends** | attendance/rate over time per gathering type | `attendance_session_summary` | incremental on session close + KV |
| 10 | **Growth Trends** | members over time by status; new approvals/month | `membership_snapshots` (nightly) + `registrations` | Cron nightly + KV |

> **Decision needed — "Active Members":** default = *attended in last 90 days* (engagement). Alternative = *`actual_member` status*. Both are computed; I'll surface the engagement one as the headline KPI unless you prefer the status one.

**Current vs historical:** KPIs 1–8 are **current** snapshots — cheap GROUP-BYs on indexed columns, cached in KV. KPIs 9–10 are **time series** — served from snapshot/rollup tables so they never scan raw history.

---

## 2. Aggregation & Materialization Strategy

```
            ┌──────────── reads ─────────────┐
Dashboard → KV cache → (miss) → D1 aggregate query → cache+return
                                   │
   current KPIs: live GROUP-BY on indexed members/member_departments
   trends:       read membership_snapshots / attendance_* rollups

            ┌──────────── writes ────────────┐
Cron (nightly 00:30) → write membership_snapshots + distribution_snapshots
Session close        → increment attendance rollups + bust attendance KV keys
Member status change → bust membership KV keys (membership_history already logs it)
```

- **Live current KPIs:** single indexed GROUP-BY per metric (`membership_status`, `cell_id`, `department_id`, baptism flags) → milliseconds even at scale; cached in KV with short TTL.
- **Nightly snapshots (Cron Trigger):** one row/day capturing status counts, residence split, baptism counts, and per-cell/department distribution → powers Growth Trends and historical distribution without recomputation.
- **Attendance rollups:** reused from the attendance design (updated on session close).
- **Cache invalidation:** TTL for current KPIs; explicit bust on session close / status change for accuracy where it matters.

---

## 3. Database Requirements (the explicit ask)

### 3.1 New aggregate/snapshot tables
```sql
-- Nightly membership snapshot → Growth Trends + historical status mix
CREATE TABLE membership_snapshots (
    snapshot_date       TEXT PRIMARY KEY,            -- 'YYYY-MM-DD'
    total               INTEGER NOT NULL,
    actual_members      INTEGER NOT NULL,
    visitors            INTEGER NOT NULL,
    associates          INTEGER NOT NULL,
    alumni              INTEGER NOT NULL,
    active_90d          INTEGER NOT NULL,            -- engagement-based active
    hostel_resident     INTEGER NOT NULL,
    non_resident        INTEGER NOT NULL,
    holy_ghost_baptized INTEGER NOT NULL,
    water_baptized      INTEGER NOT NULL,
    new_approved        INTEGER NOT NULL DEFAULT 0,  -- approvals that day
    created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Optional: historical distribution trend per dimension
CREATE TABLE distribution_snapshots (
    snapshot_date TEXT NOT NULL,
    dimension     TEXT NOT NULL,           -- 'cell' | 'department' | 'programme'
    key_id        TEXT NOT NULL,
    member_count  INTEGER NOT NULL,
    PRIMARY KEY (snapshot_date, dimension, key_id)
);

-- Async export jobs (large PDF/Excel via Queue → R2)
CREATE TABLE export_jobs (
    id           TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    format       TEXT NOT NULL CHECK (format IN ('pdf','xlsx','csv')),
    report       TEXT NOT NULL,            -- which dashboard/report
    params       TEXT,                     -- JSON filters
    status       TEXT NOT NULL DEFAULT 'queued'
                     CHECK (status IN ('queued','processing','done','failed')),
    r2_key       TEXT,                     -- output object key
    requested_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    completed_at TEXT,
    error        TEXT
);
CREATE INDEX ix_export_jobs_requester ON export_jobs(requested_by, created_at);
```

### 3.2 Indexes to add (make current KPIs index-only)
```sql
CREATE INDEX ix_members_hgb ON members(holy_ghost_baptism)  WHERE deleted_at IS NULL;
CREATE INDEX ix_members_wb  ON members(water_baptism)        WHERE deleted_at IS NULL;
CREATE INDEX ix_members_residence ON members(residence_status) WHERE deleted_at IS NULL;
-- already present: ix_members_membership_status, ix_members_cell,
--                  ix_member_dept_department, attendance_* rollup indexes
```

### 3.3 Reused (already designed)
- `attendance_session_summary`, `member_attendance_monthly` (attendance trends, active-90d).
- `membership_history` (status-change provenance for funnels).
- `members.membership_status / cell_id / residence_status / holy_ghost_baptism / water_baptism` (all current-KPI sources).

### 3.4 Scheduling & bindings (wrangler)
```toml
[triggers]
crons = ["30 0 * * *"]            # nightly snapshot builder

[[queues.producers]]              # heavy export jobs
binding = "EXPORT_QUEUE"
queue = "pensa-exports"
[[queues.consumers]]
queue = "pensa-exports"
```
KV (existing `KV`) holds cached aggregate JSON; R2 (existing `MEDIA` or a dedicated `EXPORTS` bucket) holds generated files.

---

## 4. API Surface (analytics + export)

| Method | Route | Purpose | Role/scope |
|---|---|---|---|
| GET | `/api/analytics/summary` | KPI block (Total/Active/Visitors/Associates/Alumni + baptism) | scope ▲ |
| GET | `/api/analytics/distribution?dimension=cell\|department\|programme` | distribution charts | scope ▲ |
| GET | `/api/analytics/baptism` | Holy Ghost / Water counts + % | scope ▲ |
| GET | `/api/analytics/attendance-trend?range&gatheringTypeId&cellId&departmentId` | attendance over time | scope ▲ |
| GET | `/api/analytics/growth?range&granularity=day\|week\|month` | growth trends (snapshots) | scope ▲ |
| POST | `/api/exports` `{report, format, params}` | request an export (sync small / queued large) | scope ▲ |
| GET | `/api/exports/:id` | export job status + signed download URL | requester |

All: authenticate → authorize (role + cell/department scope) → validate → serve from cache/rollup → audit. Leaders' analytics are auto-scoped.

---

## 5. Export Pipeline (PDF · Excel · CSV)

**Tiered by size — small exports synchronous, large exports queued:**

```
POST /api/exports {report, format, params}
  ├─ small (dashboard snapshot / filtered table within limit)
  │     → build dataset → format inline → stream file (Content-Disposition) → audit
  └─ large (full roster, wide date range)
        → create export_jobs(queued) → enqueue EXPORT_QUEUE → 202 {jobId}
        → consumer: build dataset → format → write R2 → status=done, r2_key
        → client polls GET /api/exports/:id → signed R2 download URL
```

| Format | Mechanism | Notes |
|---|---|---|
| **CSV** | Worker generates `text/csv`, streamed | trivial, always synchronous |
| **Excel (.xlsx)** | **SheetJS (`xlsx`)** in the Worker (`nodejs_compat`) → workbook buffer; multi-sheet (one sheet per dashboard) | queued for very large datasets |
| **PDF** | **Cloudflare Browser Rendering** (`@cloudflare/puppeteer`) renders a branded, print-optimized **HTML report template** (charts as inline SVG) → PDF → R2 → signed link | best fidelity + PENSA branding; runs in the Queue consumer |

- **Charts in PDF:** the report template renders charts as **SVG** server-side (no client needed), so the PDF is self-contained and consistent.
- **Alternative (lightweight) PDF:** client-side `jsPDF + autotable` for quick ad-hoc exports without Browser Rendering — offered as a fast path; Browser Rendering is the high-fidelity path for leadership/board reports.
- **Downloads:** files in R2 served via **short-lived signed URLs**; `export_jobs` tracks lifecycle; old exports GC'd by the nightly Cron.
- **Audit:** every export request logged (who, report, format, filters).

---

## 6. Scalability & Performance

| Concern | Mechanism |
|---|---|
| Current KPIs at scale | indexed GROUP-BY (membership_status/cell/department/baptism) + KV cache |
| Trends at scale | snapshot + rollup tables (no raw scans); cursor pagination |
| Export of large datasets | Queue + R2 + signed link (never blocks the request) |
| Hot dashboards | KV-cached JSON, TTL + targeted invalidation |
| Read load | D1 read replication for analytics reads |
| Freshness vs cost | nightly snapshots for trends; short TTL for current KPIs; explicit bust on key events |

Result: dashboard and export latency are **independent of total history size**.

---

## 7. Access & Security
- **Role-scoped:** Department/Cell Leaders see only their scope; Church/Super Admin global. Scope applied to every query and every export dataset.
- **Exports:** signed, expiring R2 URLs; jobs owned by requester; audit-logged.
- **No PII leakage** in aggregate endpoints; row-level exports respect scope + soft-delete.

---

## 8. Out of Scope (future)
Scheduled/emailed reports, custom report builder, year-over-year cohort analysis, predictive growth modeling, and finance/volunteer analytics (their schema seams already exist).
