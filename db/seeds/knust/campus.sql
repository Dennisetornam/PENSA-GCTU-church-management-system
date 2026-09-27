-- =============================================================================
-- PENSA KNUST – Obuasi Campus — Campus data (hostels, pick-up points, settings)
-- Idempotent: stable IDs + ON CONFLICT(id) DO NOTHING. Safe to re-run.
-- =============================================================================

-- Hostels (managed dropdown for the residence step) --------------------------
INSERT INTO hostels (id, name) VALUES
  ('hostel_knust_lemez',      'Lemez Hostel'),
  ('hostel_knust_sal',        'SAL Hostel'),
  ('hostel_knust_magyeius_b', 'Magyeius B'),
  ('hostel_knust_bkarim',     'B. Karim Hostel'),
  ('hostel_knust_archbishop', 'Archbishop Mensah Hostel'),
  ('hostel_knust_savolink',   'Savolink Hostel'),
  ('hostel_knust_oppong',     'Oppong Hostel'),
  ('hostel_knust_vickys',     'Vicky''s Hostel'),
  ('hostel_knust_phanuel',    'Phanuel Hostel'),
  ('hostel_knust_gyimah',     'Gyimah Hostel'),
  ('hostel_knust_nyarko',     'Nyarko Hostel'),
  ('hostel_knust_mickys',     'Micky''s Hostel'),
  ('hostel_knust_dds',        'DD''s Court & Conti'),
  ('hostel_knust_thormant',   'Thormant Hostel'),
  ('hostel_knust_jabora',     'Jabora'),
  ('hostel_knust_magyeius_a', 'Magyeius A'),
  ('hostel_knust_regimmanuel','Regimmanuel'),
  ('hostel_knust_enning',     'Enning'),
  ('hostel_knust_moinsi',     'Moinsi Valley'),
  ('hostel_knust_adansi',     'Adansi High'),
  ('hostel_knust_pkharmony',  'PK Harmony'),
  ('hostel_knust_hillview',   'Hill View'),
  ('hostel_knust_mactina',    'Mactina'),
  ('hostel_knust_victorious', 'Victorious Hostel')
ON CONFLICT(id) DO NOTHING;

-- Bus pick-up points (all set off 6:30am) ------------------------------------
INSERT INTO pickup_points (id, name, departure_time) VALUES
  ('pickup_knust_campus',     'Campus Zone',     '06:30'),
  ('pickup_knust_oppong',     'Oppong Zone',     '06:30'),
  ('pickup_knust_lemez',      'Lemez Zone',      '06:30'),
  ('pickup_knust_archbishop', 'Archbishop Zone', '06:30')
ON CONFLICT(id) DO NOTHING;

-- Church name for this deployment (branding also comes from the CAMPUS var) ---
INSERT INTO settings (key, value) VALUES
  ('org.name', '"PENSA KNUST – Obuasi Campus"')
ON CONFLICT(key) DO UPDATE SET value = excluded.value;

-- KNUST does not run cells — deactivate the shared defaults so they never show. -
UPDATE cells SET is_active = 0;
