-- Migration 0017 — Help Desk routing: tickets carry the department they're
-- routed to, so the relevant department head sees them on their dashboard.

ALTER TABLE help_desk_tickets ADD COLUMN department_id TEXT REFERENCES departments(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS ix_helpdesk_department ON help_desk_tickets(department_id);
