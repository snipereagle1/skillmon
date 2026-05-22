CREATE TABLE IF NOT EXISTS plan_groups (
    group_id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    parent_group_id INTEGER REFERENCES plan_groups(group_id) ON DELETE CASCADE,
    sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_plan_groups_parent ON plan_groups(parent_group_id);

ALTER TABLE skill_plans ADD COLUMN group_id INTEGER REFERENCES plan_groups(group_id) ON DELETE SET NULL;
ALTER TABLE skill_plans ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_skill_plans_group ON skill_plans(group_id);

UPDATE skill_plans
SET sort_order = (
    SELECT rnk - 1 FROM (
        SELECT plan_id, ROW_NUMBER() OVER (ORDER BY created_at DESC, plan_id DESC) AS rnk
        FROM skill_plans
    ) ranked
    WHERE ranked.plan_id = skill_plans.plan_id
);
