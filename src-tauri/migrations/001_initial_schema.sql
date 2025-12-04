-- Characters table
CREATE TABLE IF NOT EXISTS characters (
  character_id INTEGER PRIMARY KEY,
  character_name TEXT NOT NULL
);

-- Tokens table
CREATE TABLE IF NOT EXISTS tokens (
  character_id INTEGER PRIMARY KEY,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  FOREIGN KEY (character_id) REFERENCES characters(character_id)
);

-- Index for faster token lookups
CREATE INDEX IF NOT EXISTS idx_tokens_character_id ON tokens(character_id);
