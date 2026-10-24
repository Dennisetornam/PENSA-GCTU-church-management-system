-- Migration 0018 — a department can "manage pick-up points" (the Transport head
-- sees the bus zones + riders on their dashboard).

ALTER TABLE departments ADD COLUMN manages_pickup INTEGER NOT NULL DEFAULT 0 CHECK (manages_pickup IN (0,1));
