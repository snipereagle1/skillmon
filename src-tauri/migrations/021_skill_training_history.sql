-- Skill levels seen finishing in the ESI skill queue. ESI drops finished
-- entries once the character logs in, so this is recorded locally.
CREATE TABLE IF NOT EXISTS skill_training_history (
    character_id INTEGER NOT NULL,
    skill_id INTEGER NOT NULL,
    finished_level INTEGER NOT NULL CHECK (finished_level BETWEEN 1 AND 5),
    completed_at INTEGER NOT NULL,
    PRIMARY KEY (character_id, skill_id, finished_level),
    FOREIGN KEY (character_id) REFERENCES characters (
        character_id
    ) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_skill_training_history_completed_at
ON skill_training_history (completed_at DESC);
