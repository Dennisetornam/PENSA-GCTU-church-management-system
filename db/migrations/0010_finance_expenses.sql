-- Migration 0010 — record expenses. Net ("actual") = giving received minus expenses.
-- Money in integer minor units (pesewas). Kept separate from giving so the
-- category summaries, quota, and analytics over income stay untouched.

CREATE TABLE finance_expenses (
    id                 TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    category           TEXT NOT NULL,                 -- purpose/category (free text)
    amount_minor       INTEGER NOT NULL,
    currency           TEXT NOT NULL DEFAULT 'GHS',
    payment_method     TEXT CHECK (payment_method IN ('cash','momo','bank','card','cheque')),
    occurred_on        TEXT NOT NULL,
    recorded_by        TEXT REFERENCES users(id) ON DELETE SET NULL,
    receipt_image_key  TEXT,                          -- R2 key of a receipt photo (optional)
    notes              TEXT,
    created_at         TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at         TEXT
);
CREATE INDEX ix_expense_date ON finance_expenses(occurred_on) WHERE deleted_at IS NULL;
