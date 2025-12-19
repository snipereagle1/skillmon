CREATE TABLE IF NOT EXISTS skill_plans (
  plan_id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%s','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%s','now'))
);

CREATE TABLE IF NOT EXISTS skill_plan_entries (
  entry_id INTEGER PRIMARY KEY,
  plan_id INTEGER NOT NULL,
  skill_type_id INTEGER NOT NULL,
  planned_level INTEGER NOT NULL CHECK (planned_level BETWEEN 1 AND 5),
  sort_order INTEGER NOT NULL,
  entry_type TEXT NOT NULL CHECK (entry_type IN ('Prerequisite', 'Planned')),
  notes TEXT,
  FOREIGN KEY (plan_id) REFERENCES skill_plans(plan_id) ON DELETE CASCADE,
  FOREIGN KEY (skill_type_id) REFERENCES sde_types(type_id),
  UNIQUE (plan_id, skill_type_id, planned_level)
);

CREATE INDEX IF NOT EXISTS idx_skill_plan_entries_plan_id ON skill_plan_entries(plan_id);
CREATE INDEX IF NOT EXISTS idx_skill_plan_entries_skill_type_id ON skill_plan_entries(skill_type_id);
