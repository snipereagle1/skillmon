-- Character attributes cache table
CREATE TABLE IF NOT EXISTS character_attributes (
  character_id INTEGER PRIMARY KEY,
  charisma INTEGER NOT NULL,
  intelligence INTEGER NOT NULL,
  memory INTEGER NOT NULL,
  perception INTEGER NOT NULL,
  willpower INTEGER NOT NULL,
  bonus_remaps INTEGER,
  accrued_remap_cooldown_date TEXT,
  last_remap_date TEXT,
  cached_at INTEGER NOT NULL,
  FOREIGN KEY (character_id) REFERENCES characters(character_id)
);

CREATE INDEX IF NOT EXISTS idx_character_attributes_character_id ON character_attributes(character_id);

