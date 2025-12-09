-- Clones table
CREATE TABLE IF NOT EXISTS clones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  character_id INTEGER NOT NULL,
  clone_id INTEGER,
  name TEXT,
  location_type TEXT NOT NULL,
  location_id INTEGER NOT NULL,
  location_name TEXT,
  is_current INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (character_id) REFERENCES characters(character_id)
);

CREATE INDEX IF NOT EXISTS idx_clones_character_id ON clones(character_id);
CREATE INDEX IF NOT EXISTS idx_clones_is_current ON clones(character_id, is_current);
-- Partial unique index: ensure unique (character_id, clone_id) when clone_id is not NULL
CREATE UNIQUE INDEX IF NOT EXISTS idx_clones_unique_clone_id ON clones(character_id, clone_id) WHERE clone_id IS NOT NULL;

-- Clone implants junction table
CREATE TABLE IF NOT EXISTS clone_implants (
  clone_id INTEGER NOT NULL,
  implant_type_id INTEGER NOT NULL,
  slot INTEGER,
  PRIMARY KEY (clone_id, implant_type_id),
  FOREIGN KEY (clone_id) REFERENCES clones(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_clone_implants_clone_id ON clone_implants(clone_id);
CREATE INDEX IF NOT EXISTS idx_clone_implants_type_id ON clone_implants(implant_type_id);

