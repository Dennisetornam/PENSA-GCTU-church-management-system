-- Migration 0002 — Authentication
-- Adds user security/scope columns and the rotating refresh-token table.

ALTER TABLE users ADD COLUMN member_id TEXT REFERENCES members(id) ON DELETE SET NULL;
ALTER TABLE users ADD COLUMN failed_login_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN locked_until TEXT;
ALTER TABLE users ADD COLUMN password_changed_at TEXT;
CREATE INDEX ix_users_member ON users(member_id);

CREATE TABLE refresh_tokens (
    id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    family_id   TEXT NOT NULL,
    token_hash  TEXT NOT NULL,
    parent_id   TEXT,
    issued_at   TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at  TEXT NOT NULL,
    revoked_at  TEXT,
    replaced_by TEXT,
    ip          TEXT,
    user_agent  TEXT
);
CREATE UNIQUE INDEX ux_refresh_token_hash ON refresh_tokens(token_hash);
CREATE INDEX ix_refresh_user ON refresh_tokens(user_id);
CREATE INDEX ix_refresh_family ON refresh_tokens(family_id);
