-- Migration 0014 — Department Head role (KNUST portfolio heads).
-- Additive: a new authenticating role. Accounts are created per-campus.

INSERT INTO roles (id, name, description, is_system) VALUES
  ('role_dept_head', 'department_head', 'Portfolio head: own department roster, report submission, attendance view', 1)
ON CONFLICT(id) DO NOTHING;
