-- Neural remaps tracking table
CREATE TABLE IF NOT EXISTS remaps (
    remap_id INTEGER PRIMARY KEY,
    character_id INTEGER,
    plan_id INTEGER,
    after_skill_type_id INTEGER,
    after_skill_level INTEGER CHECK (after_skill_level BETWEEN 0 AND 5),
    intelligence INTEGER NOT NULL,
    perception INTEGER NOT NULL,
    charisma INTEGER NOT NULL,
    willpower INTEGER NOT NULL,
    memory INTEGER NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (character_id) REFERENCES characters (
        character_id
    ) ON DELETE CASCADE,
    FOREIGN KEY (plan_id) REFERENCES skill_plans (plan_id) ON DELETE CASCADE,
    FOREIGN KEY (after_skill_type_id) REFERENCES sde_types (type_id),
    CHECK (character_id IS NOT NULL OR plan_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_remaps_character_id ON remaps (character_id);
CREATE INDEX IF NOT EXISTS idx_remaps_plan_id ON remaps (plan_id);
