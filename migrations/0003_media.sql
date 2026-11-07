-- Owner-uploaded media. One row per logical slot (e.g. 'about.photo'); the bytes live in R2 under object_key.
CREATE TABLE IF NOT EXISTS media (
  slot         TEXT NOT NULL PRIMARY KEY,
  object_key   TEXT NOT NULL,
  content_type TEXT NOT NULL,
  width        INTEGER,
  height       INTEGER,
  bytes        INTEGER NOT NULL DEFAULT 0,
  alt          TEXT NOT NULL DEFAULT '',
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
