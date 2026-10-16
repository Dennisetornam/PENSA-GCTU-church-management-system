-- Migration 0015 — Department head as a direct user link (not a member record).
-- Lets a portfolio head log in and be scoped to their department without being a
-- congregation member. Head contact lives on the department (for reminders).

ALTER TABLE departments ADD COLUMN head_user_id TEXT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE departments ADD COLUMN head_name TEXT;
ALTER TABLE departments ADD COLUMN head_phone TEXT;
ALTER TABLE departments ADD COLUMN head_whatsapp TEXT;
