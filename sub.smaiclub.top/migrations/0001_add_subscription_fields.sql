-- Up migration: extend the existing login-worker users table for subscriptions.
ALTER TABLE users ADD COLUMN sub_token TEXT;
ALTER TABLE users ADD COLUMN xui_uuid TEXT;
ALTER TABLE users ADD COLUMN sub_status TEXT NOT NULL DEFAULT 'expired';
ALTER TABLE users ADD COLUMN sub_expired_at INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN traffic_total INTEGER NOT NULL DEFAULT 536870912000;
ALTER TABLE users ADD COLUMN traffic_used_vps INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN traffic_updated_at INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_sub_token ON users(sub_token) WHERE sub_token IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_xui_uuid ON users(xui_uuid) WHERE xui_uuid IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_sub_status_expired ON users(sub_status, sub_expired_at);

-- Down migration notes for D1/SQLite:
-- SQLite cannot drop columns in all deployed D1 versions. To roll back, rebuild
-- users into a temporary table without these columns, copy shared columns, drop
-- the old table, and rename the temporary table.
