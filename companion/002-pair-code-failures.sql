CREATE TABLE IF NOT EXISTS companion_pair_code_failures (
  bucket INTEGER NOT NULL,
  code_hash TEXT NOT NULL,
  failures INTEGER NOT NULL,
  PRIMARY KEY (bucket, code_hash)
);
