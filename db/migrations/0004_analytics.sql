-- Migration 0004 — Analytics (snapshots + index-only current KPIs)

CREATE INDEX ix_members_hgb       ON members(holy_ghost_baptism) WHERE deleted_at IS NULL;
CREATE INDEX ix_members_wb        ON members(water_baptism)      WHERE deleted_at IS NULL;
CREATE INDEX ix_members_residence ON members(residence_status)   WHERE deleted_at IS NULL;

CREATE TABLE membership_snapshots (
    snapshot_date       TEXT PRIMARY KEY,
    total               INTEGER NOT NULL DEFAULT 0,
    actual_members      INTEGER NOT NULL DEFAULT 0,
    visitors            INTEGER NOT NULL DEFAULT 0,
    associates          INTEGER NOT NULL DEFAULT 0,
    alumni              INTEGER NOT NULL DEFAULT 0,
    active_90d          INTEGER NOT NULL DEFAULT 0,
    hostel_resident     INTEGER NOT NULL DEFAULT 0,
    non_resident        INTEGER NOT NULL DEFAULT 0,
    holy_ghost_baptized INTEGER NOT NULL DEFAULT 0,
    water_baptized      INTEGER NOT NULL DEFAULT 0,
    new_approved        INTEGER NOT NULL DEFAULT 0,
    created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
