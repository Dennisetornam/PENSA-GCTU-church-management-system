-- Migration 0001 — Registration module
-- Adds the member gathering preference, rebuilds `registrations` with draft
-- status + dedupe/image/reference columns, and a per-year reference counter.
-- Safe on the current DBs: `registrations` has no rows yet.

-- 1) Member gathering preference (collected at registration)
ALTER TABLE members ADD COLUMN primary_gathering_type_id TEXT REFERENCES gathering_types(id) ON DELETE SET NULL;

-- 2) Rebuild registrations (empty table → drop & recreate is safe; nothing FKs to it)
DROP TABLE IF EXISTS registrations;
CREATE TABLE registrations (
    id                     TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    reference              TEXT,                              -- REG-YYYY-NNNN (assigned on submit)
    status                 TEXT NOT NULL DEFAULT 'draft'
                               CHECK (status IN ('draft','pending','approved','rejected')),
    draft_token            TEXT,                              -- resume key while status='draft'
    -- structured, queryable subset (used for dedupe + admin queue display)
    full_name              TEXT,
    phone_number           TEXT,
    whatsapp_number        TEXT,
    date_of_birth          TEXT,
    profile_image_key      TEXT,                              -- R2 draft object key
    payload                TEXT,                              -- full JSON submission
    -- duplicate detection (advisory, resolved by admin)
    possible_duplicate     INTEGER NOT NULL DEFAULT 0 CHECK (possible_duplicate IN (0,1)),
    duplicate_of_member_id TEXT REFERENCES members(id) ON DELETE SET NULL,
    duplicate_signals      TEXT,                              -- JSON array of signals
    -- lifecycle
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

-- 3) Per-year counter for registration references (REG-YYYY-NNNN)
CREATE TABLE registration_ref_counters (
    year     TEXT PRIMARY KEY,
    last_seq INTEGER NOT NULL DEFAULT 0
);
