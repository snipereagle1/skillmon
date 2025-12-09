-- SDE metadata
CREATE TABLE IF NOT EXISTS sde_metadata (
  build_number INTEGER PRIMARY KEY,
  release_date TEXT,
  imported_at INTEGER NOT NULL
);

-- Category and grouping data
CREATE TABLE IF NOT EXISTS sde_categories (
  category_id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  published INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sde_groups (
  group_id INTEGER PRIMARY KEY,
  category_id INTEGER,
  name TEXT NOT NULL,
  icon_id INTEGER,
  published INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (category_id) REFERENCES sde_categories(category_id)
);
CREATE INDEX IF NOT EXISTS idx_sde_groups_category_id ON sde_groups(category_id);

-- Type metadata
CREATE TABLE IF NOT EXISTS sde_types (
  type_id INTEGER PRIMARY KEY,
  group_id INTEGER NOT NULL,
  category_id INTEGER,
  name TEXT NOT NULL,
  description TEXT,
  published INTEGER NOT NULL DEFAULT 0,
  market_group_id INTEGER,
  icon_id INTEGER,
  radius REAL,
  volume REAL,
  portion_size REAL,
  mass REAL,
  FOREIGN KEY (group_id) REFERENCES sde_groups(group_id)
);
CREATE INDEX IF NOT EXISTS idx_sde_types_group_id ON sde_types(group_id);
CREATE INDEX IF NOT EXISTS idx_sde_types_category_id ON sde_types(category_id);

-- Dogma metadata
CREATE TABLE IF NOT EXISTS sde_dogma_attributes (
  attribute_id INTEGER PRIMARY KEY,
  attribute_category_id INTEGER,
  data_type INTEGER,
  default_value REAL,
  unit_id INTEGER,
  high_is_good INTEGER,
  stackable INTEGER,
  published INTEGER,
  name TEXT NOT NULL,
  display_name TEXT
);

CREATE TABLE IF NOT EXISTS sde_dogma_effects (
  effect_id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  effect_category_id INTEGER,
  is_offensive INTEGER,
  is_assistance INTEGER,
  published INTEGER
);

CREATE TABLE IF NOT EXISTS sde_type_dogma_attributes (
  type_id INTEGER NOT NULL,
  attribute_id INTEGER NOT NULL,
  value REAL NOT NULL,
  PRIMARY KEY (type_id, attribute_id),
  FOREIGN KEY (type_id) REFERENCES sde_types(type_id),
  FOREIGN KEY (attribute_id) REFERENCES sde_dogma_attributes(attribute_id)
);
CREATE INDEX IF NOT EXISTS idx_sde_type_dogma_attributes_attr ON sde_type_dogma_attributes(attribute_id);

CREATE TABLE IF NOT EXISTS sde_type_dogma_effects (
  type_id INTEGER NOT NULL,
  effect_id INTEGER NOT NULL,
  is_default INTEGER NOT NULL,
  PRIMARY KEY (type_id, effect_id),
  FOREIGN KEY (type_id) REFERENCES sde_types(type_id),
  FOREIGN KEY (effect_id) REFERENCES sde_dogma_effects(effect_id)
);

-- Character attributes
CREATE TABLE IF NOT EXISTS sde_character_attributes (
  attribute_id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  short_description TEXT,
  icon_id INTEGER
);

-- Skill prerequisites derived from dogma attributes
CREATE TABLE IF NOT EXISTS sde_skill_requirements (
  skill_type_id INTEGER NOT NULL,
  required_skill_id INTEGER NOT NULL,
  required_level INTEGER NOT NULL,
  source_attr_id INTEGER NOT NULL,
  PRIMARY KEY (skill_type_id, required_skill_id, source_attr_id),
  FOREIGN KEY (skill_type_id) REFERENCES sde_types(type_id),
  FOREIGN KEY (required_skill_id) REFERENCES sde_types(type_id)
);
CREATE INDEX IF NOT EXISTS idx_sde_skill_requirements_required ON sde_skill_requirements(required_skill_id);

