pub mod graph;
pub mod simulation;

use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct SkillmonPlanEntry {
    pub skill_type_id: i64,
    pub level: i64,
    pub entry_type: String, // "Planned" or "Prerequisite"
    pub notes: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SkillmonPlan {
    pub version: i32,
    pub name: String,
    pub description: Option<String>,
    pub auto_prerequisites: bool,
    pub entries: Vec<SkillmonPlanEntry>,
}

impl SkillmonPlan {
    pub const CURRENT_VERSION: i32 = 1;
}
