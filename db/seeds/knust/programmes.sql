-- =============================================================================
-- PENSA KNUST – Obuasi Campus — Programmes Seed (managed dropdown)
-- Source: programme list provided by the campus (2026-09-26).
-- Idempotent: stable IDs + ON CONFLICT(id) DO NOTHING. Safe to re-run.
-- NOTE: lines given as "A/B" were split into separate selectable programmes so a
-- student picks exactly one. Edit/merge/rename freely in the admin data.
-- =============================================================================

-- Business Administration ----------------------------------------------------
INSERT INTO programmes (id, name, level) VALUES
  ('prog_knust_bba_hr',        'Human Resource Management',             'Degree'),
  ('prog_knust_bba_mgmt',      'Management',                            'Degree'),
  ('prog_knust_bba_marketing', 'Marketing',                             'Degree'),
  ('prog_knust_bba_intbiz',    'International Business',                 'Degree'),
  ('prog_knust_bba_accounting','Accounting',                            'Degree'),
  ('prog_knust_bba_banking',   'Banking & Finance',                     'Degree'),
  ('prog_knust_bba_logistics', 'Logistics & Supply Chain Management',   'Degree'),
  ('prog_knust_bba_bit',       'Business Information Technology',        'Degree')
ON CONFLICT(id) DO NOTHING;

-- Engineering ----------------------------------------------------------------
INSERT INTO programmes (id, name, level) VALUES
  ('prog_knust_eng_civil',        'Civil Engineering',                   'Degree'),
  ('prog_knust_eng_geomatic',     'Geomatic Engineering',                'Degree'),
  ('prog_knust_eng_materials',    'Materials Engineering',               'Degree'),
  ('prog_knust_eng_mech',         'Mechanical Engineering',              'Degree'),
  ('prog_knust_eng_elec',         'Electrical & Electronic Engineering', 'Degree'),
  ('prog_knust_eng_geological',   'Geological Engineering',              'Degree'),
  ('prog_knust_eng_metallurgical','Metallurgical Engineering',          'Degree')
ON CONFLICT(id) DO NOTHING;

-- Health Sciences ------------------------------------------------------------
INSERT INTO programmes (id, name, level) VALUES
  ('prog_knust_health_nursing',   'Nursing',                             'Degree'),
  ('prog_knust_health_midwifery', 'Midwifery',                           'Degree'),
  ('prog_knust_health_medlab',    'Medical Laboratory Technology',       'Degree')
ON CONFLICT(id) DO NOTHING;

-- Science --------------------------------------------------------------------
INSERT INTO programmes (id, name, level) VALUES
  ('prog_knust_sci_env',          'Environmental Science',               'Degree')
ON CONFLICT(id) DO NOTHING;
