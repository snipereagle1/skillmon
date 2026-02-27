pub mod graph;
pub mod optimization;
pub mod plan_from_character;
pub mod simulation;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
pub struct Attributes {
    pub charisma: i64,
    pub intelligence: i64,
    pub memory: i64,
    pub perception: i64,
    pub willpower: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlannedRemap {
    pub entry_index: usize, // Index in the skill plan entries
    pub attributes: Attributes,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SkillmonPlanEntry {
    pub skill_type_id: i64,
    pub level: i64,
    pub entry_type: String, // "Planned" or "Prerequisite"
    pub notes: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SkillmonPlanRemap {
    pub after_skill_type_id: Option<i64>,
    pub after_skill_level: Option<i64>,
    pub attributes: Attributes,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SkillmonPlan {
    pub version: i32,
    pub name: String,
    pub description: Option<String>,
    pub auto_prerequisites: bool,
    pub entries: Vec<SkillmonPlanEntry>,
    pub remaps: Vec<SkillmonPlanRemap>,
}

impl SkillmonPlan {
    pub const CURRENT_VERSION: i32 = 1;
}
