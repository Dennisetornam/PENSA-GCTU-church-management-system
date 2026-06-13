-- Migration 0007 — attribute tithes & pledges to a member, track pledge redemption.

ALTER TABLE finance_entries ADD COLUMN member_id     TEXT REFERENCES members(id) ON DELETE SET NULL;
ALTER TABLE finance_entries ADD COLUMN member_name   TEXT;          -- snapshot of giver's name
ALTER TABLE finance_entries ADD COLUMN pledge_status TEXT
    CHECK (pledge_status IN ('fully_redeemed','partly_redeemed'));

CREATE INDEX ix_finance_member ON finance_entries(member_id) WHERE deleted_at IS NULL;
