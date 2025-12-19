-- Fix created_at and updated_at columns to be INTEGER instead of TEXT
-- SQLite doesn't support ALTER COLUMN, so we need to recreate the table

CREATE TABLE IF NOT EXISTS skill_plans_new (
  plan_id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  created_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER)),
  updated_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER))
);

-- Copy existing data, converting TEXT timestamps to INTEGER
INSERT INTO skill_plans_new (plan_id, name, description, created_at, updated_at)
SELECT
  plan_id,
  name,
  description,
  CAST(created_at AS INTEGER),
  CAST(updated_at AS INTEGER)
FROM skill_plans;

-- Drop old table and rename new one
DROP TABLE skill_plans;
ALTER TABLE skill_plans_new RENAME TO skill_plans;
