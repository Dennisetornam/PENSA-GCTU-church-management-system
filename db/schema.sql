-- =============================================================================
-- PENSA GCTU Church Management System — Authoritative Database Schema
-- Engine: Cloudflare D1 (SQLite)
-- Status: v1 (ships in the initial migration 0000_init)
-- Conventions:
--   * IDs: TEXT UUID-like, app- OR db-generated (offline/mobile friendly)
--   * Timestamps: TEXT ISO-8601 UTC via datetime('now')
--   * Booleans: INTEGER 0/1 with CHECK
--   * Enums: enforced via CHECK constraints
--   * Soft delete: deleted_at TEXT NULL (tombstone for sync; NULL = live row)
--   * Mobile sync: created_at / updated_at / deleted_at / row_version on synced tables
-- This file is the design source of truth. Drizzle migrations are generated to match.
-- =============================================================================

PRAGMA foreign_keys = ON;

-- =============================================================================
-- SECTION 1 — IDENTITY & ACCESS CONTROL
-- =============================================================================

CREATE TABLE roles (
    id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    name        TEXT NOT NULL,                          -- super_admin | admin | staff | department_leader | cell_leader
    description TEXT,
    is_system   INTEGER NOT NULL DEFAULT 0 CHECK (is_system IN (0,1)),
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at  TEXT
);
CREATE UNIQUE INDEX ux_roles_name_live ON roles(name) WHERE deleted_at IS NULL;

CREATE TABLE users (
    id            TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    full_name     TEXT NOT NULL,
    email         TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role_id       TEXT NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
    status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
    member_id     TEXT REFERENCES members(id) ON DELETE SET NULL,   -- links a leader-user to their member record (scope)
    failed_login_count  INTEGER NOT NULL DEFAULT 0,
    locked_until        TEXT,
    password_changed_at TEXT,
    last_login_at TEXT,
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at    TEXT
);
CREATE UNIQUE INDEX ux_users_email_live ON users(email) WHERE deleted_at IS NULL;
CREATE INDEX ix_users_role ON users(role_id);
CREATE INDEX ix_users_member ON users(member_id);

-- Rotating refresh tokens (hashed, family-tracked, reuse-detectable)
CREATE TABLE refresh_tokens (
    id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    family_id   TEXT NOT NULL,
    token_hash  TEXT NOT NULL,
    parent_id   TEXT,
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

-- Sessions primarily live in Cloudflare KV; this table is an optional durable
-- mirror for audit/revocation and for environments without KV.
CREATE TABLE sessions (
    id          TEXT PRIMARY KEY,                       -- opaque session id
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    ip          TEXT,
    user_agent  TEXT,
    expires_at  TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX ix_sessions_user ON sessions(user_id);
CREATE INDEX ix_sessions_expiry ON sessions(expires_at);

-- NOTE: password_reset_tokens and account invitations were intentionally removed.
-- Members are records only (no member login). Admin/leader accounts are
-- provisioned directly by a Super Admin; there is no self-service password reset.

-- Generic, append-only audit trail for every sensitive action.
CREATE TABLE audit_log (
    id            TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,  -- NULL = system/public action
    action        TEXT NOT NULL,                       -- e.g. member.create, registration.approve
    entity_type   TEXT NOT NULL,                       -- e.g. member, registration, user
    entity_id     TEXT,
    summary       TEXT,
    changes       TEXT,                                -- JSON: {"before":{...},"after":{...}}
    ip            TEXT,
    user_agent    TEXT,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX ix_audit_entity ON audit_log(entity_type, entity_id);
CREATE INDEX ix_audit_actor ON audit_log(actor_user_id);
CREATE INDEX ix_audit_created ON audit_log(created_at);

-- =============================================================================
-- SECTION 2 — REFERENCE / LOOKUP DATA (extensible: grow by adding rows)
-- =============================================================================

CREATE TABLE cells (
    id               TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    name             TEXT NOT NULL,                     -- Dunamis | Moriah | Peniel
    leader_member_id TEXT REFERENCES members(id) ON DELETE SET NULL,
    description      TEXT,
    is_active        INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
    created_at       TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at       TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at       TEXT
);
CREATE UNIQUE INDEX ux_cells_name_live ON cells(name) WHERE deleted_at IS NULL;

CREATE TABLE departments (
    id               TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    name             TEXT NOT NULL,                     -- Media | Music & Drama | Prayer | Organizing | Bible Studies
    leader_member_id TEXT REFERENCES members(id) ON DELETE SET NULL,
    description      TEXT,
    is_active        INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
    created_at       TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at       TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at       TEXT
);
CREATE UNIQUE INDEX ux_departments_name_live ON departments(name) WHERE deleted_at IS NULL;

CREATE TABLE programmes (
    id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    name        TEXT NOT NULL,                          -- managed dropdown, seeded from GCTU list
    level       TEXT,                                   -- optional: Diploma | Degree | Masters
    is_active   INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at  TEXT
);
CREATE UNIQUE INDEX ux_programmes_name_live ON programmes(name) WHERE deleted_at IS NULL;

CREATE TABLE gathering_types (
    id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    name        TEXT NOT NULL,                          -- Sunday Service | Midweek Service | Adullam | Prayer Fest | Outreach
    cadence     TEXT NOT NULL DEFAULT 'weekly' CHECK (cadence IN ('weekly','periodic','special')),
    is_active   INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at  TEXT
);
CREATE UNIQUE INDEX ux_gathering_types_name_live ON gathering_types(name) WHERE deleted_at IS NULL;

-- =============================================================================
-- SECTION 3 — MEMBERS (core domain)
-- =============================================================================

CREATE TABLE members (
    id                        TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    -- Personal information
    first_name                TEXT NOT NULL,
    last_name                 TEXT NOT NULL,
    other_names               TEXT,
    date_of_birth             TEXT,                     -- ISO date
    gender                    TEXT CHECK (gender IN ('male','female')),   -- optional/recommended
    profile_picture_key       TEXT,                     -- R2 object key
    -- Academic information
    programme_id              TEXT REFERENCES programmes(id) ON DELETE SET NULL,
    -- Residence information
    residence_status          TEXT CHECK (residence_status IN ('hostel_resident','non_resident')),
    residence_during_vacation TEXT,                     -- where they stay during vacation
    -- Cell (one per member)
    cell_id                   TEXT REFERENCES cells(id) ON DELETE SET NULL,
    -- Primary gathering preference (collected at registration)
    primary_gathering_type_id TEXT REFERENCES gathering_types(id) ON DELETE SET NULL,
    -- Spiritual information
    holy_ghost_baptism        INTEGER NOT NULL DEFAULT 0 CHECK (holy_ghost_baptism IN (0,1)),
    holy_ghost_baptism_date   TEXT,
    water_baptism             INTEGER NOT NULL DEFAULT 0 CHECK (water_baptism IN (0,1)),
    water_baptism_date        TEXT,
    -- Contact information
    phone_number              TEXT NOT NULL,
    whatsapp_number           TEXT,
    -- Membership lifecycle
    membership_status         TEXT NOT NULL DEFAULT 'visitor'
                                  CHECK (membership_status IN ('actual_member','visitor','associate','alumni')),
    registration_status       TEXT NOT NULL DEFAULT 'approved'
                                  CHECK (registration_status IN ('pending','approved','rejected')),
    approved_by               TEXT REFERENCES users(id) ON DELETE SET NULL,
    approved_at               TEXT,
    join_date                 TEXT,
    notes                     TEXT,
    -- Audit / sync
    member_code               TEXT,                         -- human-readable ID, auto-assigned on approval: PENSA-YYYY-NNNN
    created_at                TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at                TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at                TEXT,
    row_version               INTEGER NOT NULL DEFAULT 1,   -- mobile offline-sync conflict detection
    qr_version                INTEGER NOT NULL DEFAULT 1,   -- bump to revoke a member's QR token
    -- Stored, indexed concatenation for fast name search (read-only/computed)
    full_name                 TEXT GENERATED ALWAYS AS (trim(first_name || ' ' || coalesce(other_names || ' ', '') || last_name)) STORED
);
-- Fast-lookup indexes (registration/check-in hot paths)
CREATE UNIQUE INDEX ux_members_phone_live   ON members(phone_number) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX ux_members_member_code  ON members(member_code) WHERE member_code IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX ix_members_full_name           ON members(full_name);
CREATE INDEX ix_members_membership_status   ON members(membership_status) WHERE deleted_at IS NULL;
CREATE INDEX ix_members_registration_status ON members(registration_status) WHERE deleted_at IS NULL;
CREATE INDEX ix_members_cell                ON members(cell_id);           -- attendance filter by cell
CREATE INDEX ix_members_programme           ON members(programme_id);
CREATE INDEX ix_members_last_name           ON members(last_name);
CREATE INDEX ix_members_updated             ON members(updated_at);        -- delta sync cursor
CREATE INDEX ix_members_hgb        ON members(holy_ghost_baptism) WHERE deleted_at IS NULL;  -- baptism analytics
CREATE INDEX ix_members_wb         ON members(water_baptism)      WHERE deleted_at IS NULL;
CREATE INDEX ix_members_residence  ON members(residence_status)   WHERE deleted_at IS NULL;

-- Per-year atomic counter for human-readable member codes (PENSA-YYYY-NNNN).
-- Bumped on approval via: INSERT INTO member_code_counters(year,last_seq) VALUES(:y,1)
--   ON CONFLICT(year) DO UPDATE SET last_seq = last_seq + 1 RETURNING last_seq;
CREATE TABLE member_code_counters (
    year     TEXT PRIMARY KEY,
    last_seq INTEGER NOT NULL DEFAULT 0
);

-- Member ↔ Department (many-to-many)
CREATE TABLE member_departments (
    id                 TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    member_id          TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    department_id      TEXT NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
    role_in_department TEXT NOT NULL DEFAULT 'member',   -- member | lead
    joined_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX ux_member_dept ON member_departments(member_id, department_id);
CREATE INDEX ix_member_dept_department ON member_departments(department_id);

-- Membership status lifecycle history (append-only)
CREATE TABLE membership_history (
    id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    member_id   TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    from_status TEXT,                                   -- NULL on initial creation
    to_status   TEXT NOT NULL,
    reason      TEXT,
    changed_by  TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX ix_membership_history_member ON membership_history(member_id);

-- =============================================================================
-- SECTION 4 — REGISTRATION & APPROVAL PIPELINE
-- =============================================================================

CREATE TABLE registrations (
    id                     TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    reference              TEXT,                              -- REG-YYYY-NNNN (assigned on submit)
    status                 TEXT NOT NULL DEFAULT 'draft'
                               CHECK (status IN ('draft','pending','approved','rejected')),
    draft_token            TEXT,                              -- resume key while status='draft'
    full_name              TEXT,
    phone_number           TEXT,
    whatsapp_number        TEXT,
    date_of_birth          TEXT,
    profile_image_key      TEXT,                              -- R2 draft object key
    payload                TEXT,                              -- full JSON submission
    possible_duplicate     INTEGER NOT NULL DEFAULT 0 CHECK (possible_duplicate IN (0,1)),
    duplicate_of_member_id TEXT REFERENCES members(id) ON DELETE SET NULL,
    duplicate_signals      TEXT,                              -- JSON array of signals
    submitted_at           TEXT,
    reviewed_by            TEXT REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at            TEXT,
    member_id              TEXT REFERENCES members(id) ON DELETE SET NULL,  -- set on approval
    rejection_reason       TEXT,
    created_at             TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at             TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX ux_registrations_draft_token ON registrations(draft_token) WHERE draft_token IS NOT NULL;
CREATE UNIQUE INDEX ux_registrations_reference   ON registrations(reference)   WHERE reference IS NOT NULL;
CREATE INDEX ix_registrations_status    ON registrations(status);
CREATE INDEX ix_registrations_phone     ON registrations(phone_number);
CREATE INDEX ix_registrations_submitted ON registrations(submitted_at);

-- Per-year counter for registration references (REG-YYYY-NNNN).
CREATE TABLE registration_ref_counters (
    year     TEXT PRIMARY KEY,
    last_seq INTEGER NOT NULL DEFAULT 0
);

-- =============================================================================
-- SECTION 5 — EVENTS (v1 minimal; Events Module extends this — see future seams)
-- =============================================================================

CREATE TABLE events (
    id                TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    title             TEXT NOT NULL,
    description       TEXT,
    location          TEXT,
    starts_at         TEXT NOT NULL,
    ends_at           TEXT,
    department_id     TEXT REFERENCES departments(id) ON DELETE SET NULL,
    gathering_type_id TEXT REFERENCES gathering_types(id) ON DELETE SET NULL,
    created_by        TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at        TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at        TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at        TEXT
);
CREATE INDEX ix_events_starts ON events(starts_at) WHERE deleted_at IS NULL;
CREATE INDEX ix_events_department ON events(department_id);

-- =============================================================================
-- SECTION 6 — ATTENDANCE ENGINE
-- =============================================================================

CREATE TABLE attendance_sessions (
    id                TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    gathering_type_id TEXT NOT NULL REFERENCES gathering_types(id) ON DELETE RESTRICT,
    event_id          TEXT REFERENCES events(id) ON DELETE SET NULL,
    title             TEXT,
    session_date      TEXT NOT NULL,                    -- ISO date of the gathering
    status            TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
    recorded_by       TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at        TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at        TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at        TEXT
);
CREATE INDEX ix_sessions_type_date ON attendance_sessions(gathering_type_id, session_date);
CREATE INDEX ix_sessions_date ON attendance_sessions(session_date);

CREATE TABLE attendance_records (
    id            TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    session_id    TEXT NOT NULL REFERENCES attendance_sessions(id) ON DELETE CASCADE,
    member_id     TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    status        TEXT NOT NULL CHECK (status IN ('present','late','excused','absent')),
    checked_in_at TEXT,
    method        TEXT CHECK (method IN ('manual','qr','kiosk','import')),
    recorded_by   TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
    row_version   INTEGER NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX ux_attendance_session_member ON attendance_records(session_id, member_id);
CREATE INDEX ix_attendance_member ON attendance_records(member_id);
CREATE INDEX ix_attendance_member_session ON attendance_records(member_id, session_id);

-- Sparse storage: only present/late/excused are persisted; 'absent' = no row.
-- Per-session denormalized counts (filled on close) so dashboards never scan records.
CREATE TABLE attendance_session_summary (
    session_id     TEXT PRIMARY KEY REFERENCES attendance_sessions(id) ON DELETE CASCADE,
    eligible_count INTEGER NOT NULL DEFAULT 0,
    present        INTEGER NOT NULL DEFAULT 0,
    late           INTEGER NOT NULL DEFAULT 0,
    excused        INTEGER NOT NULL DEFAULT 0,
    attended       INTEGER NOT NULL DEFAULT 0,
    finalized_at   TEXT
);

-- Per-member monthly rollup → O(1) history & absentee analytics at any scale.
CREATE TABLE member_attendance_monthly (
    member_id          TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    year_month         TEXT NOT NULL,                -- 'YYYY-MM'
    present            INTEGER NOT NULL DEFAULT 0,
    late               INTEGER NOT NULL DEFAULT 0,
    excused            INTEGER NOT NULL DEFAULT 0,
    last_attended_date TEXT,
    PRIMARY KEY (member_id, year_month)
);

-- =============================================================================
-- SECTION 7 — GENERIC SEAMS (reused by current + future modules)
-- =============================================================================

-- Polymorphic R2-backed attachments (event banners, finance receipts,
-- volunteer documents, alumni media). Member avatar stays denormalized on
-- members.profile_picture_key for the hot path.
CREATE TABLE attachments (
    id           TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    owner_type   TEXT NOT NULL,                         -- member | event | finance_transaction | ...
    owner_id     TEXT NOT NULL,
    r2_key       TEXT NOT NULL,
    kind         TEXT,                                  -- photo | receipt | document
    content_type TEXT,
    size_bytes   INTEGER,
    uploaded_by  TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at   TEXT
);
CREATE INDEX ix_attachments_owner ON attachments(owner_type, owner_id);

-- Key/value application settings (org name, current academic year, feature flags).
CREATE TABLE settings (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,                           -- JSON
    updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Nightly membership snapshot → Growth Trends + historical status mix (Cron).
CREATE TABLE membership_snapshots (
    snapshot_date       TEXT PRIMARY KEY,                -- 'YYYY-MM-DD'
    total               INTEGER NOT NULL DEFAULT 0,
    actual_members      INTEGER NOT NULL DEFAULT 0,
    visitors            INTEGER NOT NULL DEFAULT 0,
    associates          INTEGER NOT NULL DEFAULT 0,
    alumni              INTEGER NOT NULL DEFAULT 0,
    active_90d          INTEGER NOT NULL DEFAULT 0,
    hostel_resident     INTEGER NOT NULL DEFAULT 0,
    non_resident        INTEGER NOT NULL DEFAULT 0,
    holy_ghost_baptized INTEGER NOT NULL DEFAULT 0,
    water_baptized      INTEGER NOT NULL DEFAULT 0,
    new_approved        INTEGER NOT NULL DEFAULT 0,
    created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

-- =============================================================================
-- SECTION 8 — TRIGGERS (updated_at + row_version maintenance)
-- recursive_triggers is OFF by default in SQLite/D1, and the WHEN guard
-- prevents re-entrancy, so these cannot loop.
-- =============================================================================

CREATE TRIGGER trg_members_updated AFTER UPDATE ON members
FOR EACH ROW WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE members SET updated_at = datetime('now'), row_version = OLD.row_version + 1 WHERE id = OLD.id;
END;

CREATE TRIGGER trg_attendance_updated AFTER UPDATE ON attendance_records
FOR EACH ROW WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE attendance_records SET updated_at = datetime('now'), row_version = OLD.row_version + 1 WHERE id = OLD.id;
END;

CREATE TRIGGER trg_users_updated AFTER UPDATE ON users
FOR EACH ROW WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE users SET updated_at = datetime('now') WHERE id = OLD.id;
END;

CREATE TRIGGER trg_events_updated AFTER UPDATE ON events
FOR EACH ROW WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE events SET updated_at = datetime('now') WHERE id = OLD.id;
END;

-- =============================================================================
-- END v1 SCHEMA
-- Future modules (finance, volunteer, alumni, extended events) ship in their
-- own phase migrations. Their forward-compatible DDL lives in
-- docs/architecture/database-design.md §Future Modules and reuses the seams
-- above (UUID PKs, soft delete, attachments, audit_log, settings).
-- =============================================================================
