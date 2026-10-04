-- Migration 0013 — Departmental semester reports + President role.
-- Additive. A fresh DB is built from db/schema.sql; this brings an existing DB
-- up to the same shape and adds the president role.

INSERT INTO roles (id, name, description, is_system) VALUES
  ('role_president', 'president', 'Oversight: read-only across the system + activity log + reports', 1)
ON CONFLICT(id) DO NOTHING;

CREATE TABLE IF NOT EXISTS report_periods (
    id            TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    name          TEXT NOT NULL,
    academic_year TEXT,
    term          TEXT,
    due_date      TEXT,
    status        TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
    created_by    TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    closed_at     TEXT
);
CREATE INDEX IF NOT EXISTS ix_report_periods_status ON report_periods(status);

CREATE TABLE IF NOT EXISTS department_reports (
    id            TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    period_id     TEXT NOT NULL REFERENCES report_periods(id) ON DELETE CASCADE,
    department_id TEXT NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
    file_key      TEXT,
    file_name     TEXT,
    summary       TEXT,
    submitted_by  TEXT REFERENCES users(id) ON DELETE SET NULL,
    submitted_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (period_id, department_id)
);
