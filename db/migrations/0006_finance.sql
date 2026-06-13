-- Migration 0006 — Finance: record giving per service.
-- Money is stored in integer minor units (pesewas), never floats.

CREATE TABLE finance_entries (
    id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    category        TEXT NOT NULL CHECK (category IN
                       ('offering_cash','offering_momo','tithe','pledge','fundraising','free_will')),
    amount_minor    INTEGER NOT NULL,                 -- pesewas (GHS * 100)
    currency        TEXT NOT NULL DEFAULT 'GHS',
    service_type_id TEXT REFERENCES gathering_types(id) ON DELETE SET NULL,
    payment_method  TEXT CHECK (payment_method IN ('cash','momo','bank','card','cheque')),
    occurred_on     TEXT NOT NULL,                    -- ISO date of the service
    recorded_by     TEXT REFERENCES users(id) ON DELETE SET NULL,
    notes           TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at      TEXT
);
CREATE INDEX ix_finance_date     ON finance_entries(occurred_on) WHERE deleted_at IS NULL;
CREATE INDEX ix_finance_category ON finance_entries(category)    WHERE deleted_at IS NULL;
