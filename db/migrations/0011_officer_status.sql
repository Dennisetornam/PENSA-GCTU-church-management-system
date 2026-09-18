-- Migration 0011 — Officer status
-- Adds an optional ordained-office role (Deacon / Deaconess / Elder) to members
-- so the church can keep a register of its officers. NULL = ordinary member.

ALTER TABLE members ADD COLUMN officer_status TEXT
    CHECK (officer_status IN ('deacon','deaconess','elder'));

-- Fast lookup of the (small) set of officers.
CREATE INDEX ix_members_officer ON members(officer_status)
    WHERE officer_status IS NOT NULL AND deleted_at IS NULL;
