-- Up migration: create SMAICLUB Uploading Centre metadata tables.
CREATE TABLE IF NOT EXISTS user_spaces (
  username TEXT PRIMARY KEY,
  display_name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'user',
  space_id TEXT NOT NULL UNIQUE,
  short_code TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  note_cleanup_notice_dismissed INTEGER NOT NULL DEFAULT 0 CHECK (note_cleanup_notice_dismissed IN (0, 1))
);

CREATE TABLE IF NOT EXISTS upload_files (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL,
  username TEXT NOT NULL,
  r2_key TEXT NOT NULL UNIQUE,
  object_path TEXT NOT NULL,
  filename TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  project TEXT NOT NULL DEFAULT 'general',
  content_type TEXT NOT NULL DEFAULT 'application/octet-stream',
  size INTEGER NOT NULL DEFAULT 0 CHECK (size >= 0),
  public_id TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  deleted_at INTEGER,
  FOREIGN KEY (username) REFERENCES user_spaces(username) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_upload_files_space_path_active
  ON upload_files(space_id, object_path)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_upload_files_space_expires
  ON upload_files(space_id, expires_at)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_upload_files_public_id
  ON upload_files(public_id)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS online_notes (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL,
  code TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  password_hash TEXT,
  password_salt TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  UNIQUE (space_id, code),
  FOREIGN KEY (space_id) REFERENCES user_spaces(space_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_online_notes_space_expires
  ON online_notes(space_id, expires_at);

-- Down migration:
-- DROP INDEX IF EXISTS idx_online_notes_space_expires;
-- DROP TABLE IF EXISTS online_notes;
-- DROP INDEX IF EXISTS idx_upload_files_public_id;
-- DROP INDEX IF EXISTS idx_upload_files_space_expires;
-- DROP INDEX IF EXISTS idx_upload_files_space_path_active;
-- DROP TABLE IF EXISTS upload_files;
-- DROP TABLE IF EXISTS user_spaces;
