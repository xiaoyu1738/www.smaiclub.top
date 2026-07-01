-- Up migration: create SMAICLUB Uploading Centre API token metadata.
CREATE TABLE IF NOT EXISTS upload_api_tokens (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  token_prefix TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  last_used_at INTEGER,
  revoked_at INTEGER,
  FOREIGN KEY (username) REFERENCES user_spaces(username) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_upload_api_tokens_username_active
  ON upload_api_tokens(username, created_at)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_upload_api_tokens_hash_active
  ON upload_api_tokens(token_hash)
  WHERE revoked_at IS NULL;

-- Down migration:
-- DROP INDEX IF EXISTS idx_upload_api_tokens_hash_active;
-- DROP INDEX IF EXISTS idx_upload_api_tokens_username_active;
-- DROP TABLE IF EXISTS upload_api_tokens;
