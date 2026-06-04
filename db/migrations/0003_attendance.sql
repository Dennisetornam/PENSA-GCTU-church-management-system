-- Migration 0003 — Attendance (rollups, capture method, QR revocation)

ALTER TABLE attendance_records ADD COLUMN method TEXT CHECK (method IN ('manual','qr','kiosk','import'));
ALTER TABLE attendance_records ADD COLUMN recorded_by TEXT REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX ix_attendance_member_session ON attendance_records(member_id, session_id);

ALTER TABLE members ADD COLUMN qr_version INTEGER NOT NULL DEFAULT 1;

CREATE TABLE attendance_session_summary (
    session_id     TEXT PRIMARY KEY REFERENCES attendance_sessions(id) ON DELETE CASCADE,
    eligible_count INTEGER NOT NULL DEFAULT 0,
    present        INTEGER NOT NULL DEFAULT 0,
    late           INTEGER NOT NULL DEFAULT 0,
    excused        INTEGER NOT NULL DEFAULT 0,
    attended       INTEGER NOT NULL DEFAULT 0,
    finalized_at   TEXT
);

CREATE TABLE member_attendance_monthly (
    member_id          TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    year_month         TEXT NOT NULL,
    present            INTEGER NOT NULL DEFAULT 0,
    late               INTEGER NOT NULL DEFAULT 0,
    excused            INTEGER NOT NULL DEFAULT 0,
    last_attended_date TEXT,
    PRIMARY KEY (member_id, year_month)
);
