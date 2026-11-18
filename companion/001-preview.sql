CREATE TABLE IF NOT EXISTS companion_checks (
  match_id TEXT PRIMARY KEY,
  next_check INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  official_core TEXT
);
CREATE INDEX IF NOT EXISTS companion_due ON companion_checks(next_check) WHERE official_core IS NULL;
CREATE INDEX IF NOT EXISTS companion_checks_expiry ON companion_checks(expires_at);

CREATE TABLE IF NOT EXISTS companion_previews (
  destination TEXT NOT NULL,
  match_id TEXT NOT NULL,
  digest TEXT NOT NULL,
  core TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending',
  payload BLOB,
  PRIMARY KEY (destination, match_id)
);
CREATE INDEX IF NOT EXISTS companion_previews_match ON companion_previews(match_id);
CREATE INDEX IF NOT EXISTS companion_previews_expiry ON companion_previews(expires_at);

CREATE TABLE IF NOT EXISTS companion_pairing (
  destination TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS companion_pairing_expiry ON companion_pairing(expires_at);

CREATE TABLE IF NOT EXISTS companion_sessions (
  token_hash TEXT PRIMARY KEY,
  destination TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS companion_sessions_expiry ON companion_sessions(expires_at);

CREATE TABLE IF NOT EXISTS companion_pair_budget (
  bucket INTEGER PRIMARY KEY,
  attempts INTEGER NOT NULL
);
