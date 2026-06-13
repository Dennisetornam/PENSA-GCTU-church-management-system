-- Migration 0008 — link giving to the attendance session it was collected during.

ALTER TABLE finance_entries ADD COLUMN session_id TEXT
    REFERENCES attendance_sessions(id) ON DELETE SET NULL;

CREATE INDEX ix_finance_session ON finance_entries(session_id) WHERE deleted_at IS NULL;
