-- Migration 0016 — department flags (registerable, gender_scope) + two head roles.

ALTER TABLE departments ADD COLUMN registerable INTEGER NOT NULL DEFAULT 1 CHECK (registerable IN (0,1));
ALTER TABLE departments ADD COLUMN gender_scope TEXT CHECK (gender_scope IN ('male','female'));

INSERT INTO roles (id, name, description, is_system) VALUES
  ('role_dept_head_att', 'department_head_attendance', 'Department head who also records attendance', 1),
  ('role_finance_head',  'finance_head',               'Department head with full finance access (behind the finance gate)', 1)
ON CONFLICT(id) DO NOTHING;
