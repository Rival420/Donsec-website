-- donsec.be content store. Source of truth after first deploy; seed/ holds the initial markdown.
CREATE TABLE IF NOT EXISTS services (
  anchor      TEXT    NOT NULL,
  lang        TEXT    NOT NULL CHECK (lang IN ('en','nl')),
  sort        INTEGER NOT NULL DEFAULT 0,
  icon        TEXT    NOT NULL DEFAULT 'apps',
  title       TEXT    NOT NULL,
  headline    TEXT    NOT NULL DEFAULT '',
  summary     TEXT    NOT NULL DEFAULT '',
  cta         TEXT    NOT NULL DEFAULT '',
  cta_topic   TEXT,
  secondary   INTEGER NOT NULL DEFAULT 0,
  card_price  INTEGER,
  prices      TEXT    NOT NULL DEFAULT '[]',   -- JSON: [{label, from?, text?}]
  body        TEXT    NOT NULL DEFAULT '',     -- markdown
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (anchor, lang)
);

CREATE TABLE IF NOT EXISTS work (
  slug        TEXT    NOT NULL,
  lang        TEXT    NOT NULL CHECK (lang IN ('en','nl')),
  sort        INTEGER NOT NULL DEFAULT 0,
  name        TEXT    NOT NULL,
  summary     TEXT    NOT NULL DEFAULT '',
  tags        TEXT    NOT NULL DEFAULT '[]',   -- JSON array of strings
  url         TEXT,
  pillar      TEXT    NOT NULL DEFAULT 'apps',
  nda         INTEGER NOT NULL DEFAULT 0,
  featured    INTEGER NOT NULL DEFAULT 0,
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (slug, lang)
);

CREATE TABLE IF NOT EXISTS settings (
  key         TEXT NOT NULL,
  lang        TEXT NOT NULL CHECK (lang IN ('en','nl')),
  value       TEXT NOT NULL DEFAULT '',
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (key, lang)
);

CREATE TABLE IF NOT EXISTS audit_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  at          TEXT NOT NULL DEFAULT (datetime('now')),
  actor       TEXT NOT NULL,
  action      TEXT NOT NULL,
  target      TEXT NOT NULL
);
