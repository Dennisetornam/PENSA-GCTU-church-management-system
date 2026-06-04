-- =============================================================================
-- PENSA GCTU CMS — Programmes Seed (managed dropdown)
-- Source: GCTU Undergraduate/Postgraduate programme listings (provided 2026-06-04)
-- Idempotent: stable IDs + ON CONFLICT(id) DO NOTHING. Safe to re-run.
-- level ∈ Diploma | Degree | Masters
-- NOTE: BSc. Business Administration specialization list was partially cut off
--       in the source; visible options included below. Add more as a follow-up
--       seed when confirmed.
-- =============================================================================

-- Faculty of Engineering (FoE) ----------------------------------------------
INSERT INTO programmes (id, name, level) VALUES
  ('prog_foe_dip_comp_stats',     'Diploma in Computational Statistics',                 'Diploma'),
  ('prog_foe_dip_telecom',        'Diploma in Telecommunications Engineering',           'Diploma'),
  ('prog_foe_bsc_telecom',        'BSc. Telecommunications Engineering',                 'Degree'),
  ('prog_foe_bsc_comp_eng',       'BSc. Computer Engineering',                           'Degree'),
  ('prog_foe_bsc_maths',          'BSc. Mathematics',                                    'Degree'),
  ('prog_foe_bsc_elec_eng',       'BSc. Electrical and Electronic Engineering',          'Degree'),
  ('prog_foe_bsc_actuarial',      'BSc. Actuarial Science with Data Analytics',          'Degree'),
  ('prog_foe_bsc_comp_stats',     'BSc. Computational Statistics',                       'Degree'),
  ('prog_foe_mphil_comp_eng',     'MPhil Computer Engineering',                          'Masters'),
  ('prog_foe_msc_comp_eng',       'MSc. Computer Engineering',                           'Masters')
ON CONFLICT(id) DO NOTHING;

-- Faculty of Computing & Information Systems (FoCIS) — Bachelor (4 years) -----
INSERT INTO programmes (id, name, level) VALUES
  ('prog_focis_bsc_it',           'BSc. Information Technology',                          'Degree'),
  ('prog_focis_bsc_mobile',       'BSc. Mobile Computing',                               'Degree'),
  ('prog_focis_bsc_cs',           'BSc. Computer Science',                               'Degree'),
  ('prog_focis_bsc_se',           'BSc. Software Engineering',                            'Degree'),
  ('prog_focis_bsc_is',           'BSc. Information Systems',                             'Degree'),
  ('prog_focis_bsc_ds',           'BSc. Data Science and Analytics',                     'Degree'),
  ('prog_focis_bsc_cs_cyber',     'BSc. Computer Science (Cyber Security)',              'Degree'),
  ('prog_focis_bsc_netadmin',     'BSc. Network and System Administration',              'Degree'),
  ('prog_focis_bsc_iot',          'BSc. Internet of Things and Big Data',                'Degree'),
  ('prog_focis_bsc_web',          'BSc. Web Application Development',                     'Degree')
ON CONFLICT(id) DO NOTHING;

-- FoCIS — Diploma (2 years) --------------------------------------------------
INSERT INTO programmes (id, name, level) VALUES
  ('prog_focis_dip_it',           'Diploma in Information Technology',                   'Diploma'),
  ('prog_focis_dip_is',           'Diploma in Information Systems',                      'Diploma'),
  ('prog_focis_dip_ds',           'Diploma in Data Science and Analytics',              'Diploma'),
  ('prog_focis_dip_cyber',        'Diploma in Cyber Security',                          'Diploma'),
  ('prog_focis_dip_cs',           'Diploma in Computer Science',                         'Diploma'),
  ('prog_focis_dip_multimedia',   'Diploma in Multimedia Technology',                   'Diploma'),
  ('prog_focis_dip_web',          'Diploma in Web Application Development',              'Diploma')
ON CONFLICT(id) DO NOTHING;

-- GCTU Business School — Bachelor (4 years) ----------------------------------
INSERT INTO programmes (id, name, level) VALUES
  ('prog_gbs_bsc_acct_comp',      'BSc. Accounting with Computing',                      'Degree'),
  ('prog_gbs_bsc_econ',           'BSc. Economics',                                      'Degree'),
  ('prog_gbs_bsc_procurement',    'BSc. Procurement and Logistics',                      'Degree'),
  ('prog_gbs_bsc_banking',        'BSc. Banking and Finance',                            'Degree'),
  ('prog_gbs_bsc_ecommerce',      'BSc. E-Commerce and Marketing Management',            'Degree'),
  ('prog_gbs_bsc_fintech',        'BSc. Financial Technology',                           'Degree')
ON CONFLICT(id) DO NOTHING;

-- GCTU Business School — BSc. Business Administration specializations ---------
INSERT INTO programmes (id, name, level) VALUES
  ('prog_gbs_bba_hr',             'BSc. Business Administration (Human Resource Management)', 'Degree'),
  ('prog_gbs_bba_marketing',      'BSc. Business Administration (Marketing)',            'Degree'),
  ('prog_gbs_bba_accounting',     'BSc. Business Administration (Accounting)',           'Degree')
ON CONFLICT(id) DO NOTHING;
