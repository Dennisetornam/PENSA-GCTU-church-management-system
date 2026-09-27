-- Migration 0012 — Campus features (KNUST): pick-up points, hostels, help desk,
-- and the registration tweaks (no-department opt-out, pick-up point on member).
-- Additive and safe. A fresh KNUST database is built from db/schema.sql; this
-- file brings an existing database up to the same shape.

ALTER TABLE members ADD COLUMN pickup_point_id TEXT;
ALTER TABLE members ADD COLUMN no_department INTEGER NOT NULL DEFAULT 0 CHECK (no_department IN (0,1));

CREATE TABLE IF NOT EXISTS pickup_points (
    id             TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    name           TEXT NOT NULL,
    departure_time TEXT,
    location       TEXT,
    is_active      INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
    created_at     TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at     TEXT
);

CREATE TABLE IF NOT EXISTS hostels (
    id         TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    name       TEXT NOT NULL,
    is_active  INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS help_desk_tickets (
    id           TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    reference    TEXT,
    category     TEXT NOT NULL DEFAULT 'enquiry'
                     CHECK (category IN ('enquiry','assistance','concern','other')),
    subject      TEXT,
    message      TEXT NOT NULL,
    is_anonymous INTEGER NOT NULL DEFAULT 0 CHECK (is_anonymous IN (0,1)),
    name         TEXT,
    contact      TEXT,
    member_id    TEXT,
    status       TEXT NOT NULL DEFAULT 'open'
                     CHECK (status IN ('open','in_progress','resolved')),
    admin_notes  TEXT,
    handled_by   TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
    resolved_at  TEXT
);
CREATE INDEX IF NOT EXISTS ix_helpdesk_status ON help_desk_tickets(status);
CREATE INDEX IF NOT EXISTS ix_helpdesk_created ON help_desk_tickets(created_at);
