-- =============================================================================
-- PENSA KNUST – Obuasi Campus — Gathering types.
-- Runs AFTER the shared reference.sql (which seeds the GCTU defaults). Turns off
-- the ones that don't apply here and adds KNUST's constant programs. Sunday
-- Service (gt_sunday) and Outreach (gt_outreach) already exist and stay active.
-- Idempotent: safe to re-run.
-- =============================================================================

UPDATE gathering_types SET is_active = 0 WHERE id IN ('gt_midweek', 'gt_adullam', 'gt_prayer_fest');

INSERT INTO gathering_types (id, name, cadence) VALUES
  ('gt_knust_fire',     'Fire In My Bones',  'periodic'),
  ('gt_knust_total',    'Total Experience',  'periodic'),
  ('gt_knust_predamus', 'Pre-DAMUS Launch',  'special'),
  ('gt_knust_damus',    'Main DAMUS Launch', 'special'),
  ('gt_knust_allnight', 'All Night Service', 'periodic')
ON CONFLICT(id) DO NOTHING;
