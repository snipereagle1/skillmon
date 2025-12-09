-- Character skills table
CREATE TABLE IF NOT EXISTS character_skills (
  character_id INTEGER NOT NULL,
  skill_id INTEGER NOT NULL,
  active_skill_level INTEGER NOT NULL,
  skillpoints_in_skill INTEGER NOT NULL,
  trained_skill_level INTEGER NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%s','now')),
  PRIMARY KEY (character_id, skill_id),
  FOREIGN KEY (character_id) REFERENCES characters(character_id)
);

CREATE INDEX IF NOT EXISTS idx_character_skills_character_id ON character_skills(character_id);

