-- =============================================================================
-- PENSA GCTU CMS — Reference Data Seed (idempotent, all environments)
-- Safe to run repeatedly: uses stable IDs + ON CONFLICT DO NOTHING.
-- Order respects foreign keys. Programmes are seeded separately once the
-- official GCTU programme list is provided.
-- =============================================================================

-- Roles ----------------------------------------------------------------------
INSERT INTO roles (id, name, description, is_system) VALUES
  ('role_super_admin', 'super_admin',       'Full system owner: users, roles, audit, settings', 1),
  ('role_admin',       'admin',             'Pastoral/exec leadership: full domain + approvals + lookups', 1),
  ('role_staff',       'staff',             'Ushers/secretaries: members, attendance, registrations', 1),
  ('role_dept_leader', 'department_leader', 'Manages own department roster & attendance', 1),
  ('role_cell_leader', 'cell_leader',       'Manages own cell roster & attendance', 1)
ON CONFLICT(id) DO NOTHING;

-- Cells ----------------------------------------------------------------------
INSERT INTO cells (id, name) VALUES
  ('cell_dunamis', 'Dunamis'),
  ('cell_moriah',  'Moriah'),
  ('cell_peniel',  'Peniel')
ON CONFLICT(id) DO NOTHING;

-- Departments ----------------------------------------------------------------
INSERT INTO departments (id, name) VALUES
  ('dept_media',         'Media'),
  ('dept_music_drama',   'Music and Drama'),
  ('dept_prayer',        'Prayer'),
  ('dept_organizing',    'Organizing'),
  ('dept_bible_studies', 'Bible Studies')
ON CONFLICT(id) DO NOTHING;

-- Gathering types ------------------------------------------------------------
INSERT INTO gathering_types (id, name, cadence) VALUES
  ('gt_sunday',     'Sunday Service',  'weekly'),
  ('gt_midweek',    'Midweek Service', 'weekly'),
  ('gt_adullam',    'Adullam',         'periodic'),
  ('gt_prayer_fest','Prayer Fest',     'special'),
  ('gt_outreach',   'Outreach',        'special')
ON CONFLICT(id) DO NOTHING;

-- App settings ---------------------------------------------------------------
INSERT INTO settings (key, value) VALUES
  ('org.name',            '"PENSA GCTU"'),
  ('academic.year',       '"2025/2026"'),
  ('features.finance',    'false'),
  ('features.volunteer',  'false'),
  ('features.alumni',     'false')
ON CONFLICT(key) DO NOTHING;
