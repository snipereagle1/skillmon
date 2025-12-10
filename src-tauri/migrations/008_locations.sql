-- Stations table
CREATE TABLE IF NOT EXISTS stations (
  station_id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  system_id INTEGER NOT NULL,
  owner INTEGER,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_stations_system_id ON stations(system_id);

-- Structures table
CREATE TABLE IF NOT EXISTS structures (
  structure_id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  solar_system_id INTEGER NOT NULL,
  type_id INTEGER,
  owner_id INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_structures_solar_system_id ON structures(solar_system_id);

-- Remove location_name column from clones table
-- SQLite doesn't support DROP COLUMN directly, so we need to recreate the table
-- Note: Foreign keys from clone_implants will be preserved since we keep the same id values
CREATE TABLE IF NOT EXISTS clones_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  character_id INTEGER NOT NULL,
  clone_id INTEGER,
  name TEXT,
  location_type TEXT NOT NULL,
  location_id INTEGER NOT NULL,
  is_current INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (character_id) REFERENCES characters(character_id)
);

-- Copy data from old table to new table (excluding location_name)
INSERT INTO clones_new (id, character_id, clone_id, name, location_type, location_id, is_current, updated_at)
SELECT id, character_id, clone_id, name, location_type, location_id, is_current, updated_at
FROM clones;

-- Drop old table and rename new one
DROP TABLE clones;
ALTER TABLE clones_new RENAME TO clones;

-- Recreate indexes
CREATE INDEX IF NOT EXISTS idx_clones_character_id ON clones(character_id);
CREATE INDEX IF NOT EXISTS idx_clones_is_current ON clones(character_id, is_current);
CREATE UNIQUE INDEX IF NOT EXISTS idx_clones_unique_clone_id ON clones(character_id, clone_id) WHERE clone_id IS NOT NULL;

