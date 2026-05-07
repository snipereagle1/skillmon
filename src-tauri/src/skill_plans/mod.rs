pub mod graph;
pub mod optimization;
pub mod plan_from_character;
pub mod simulation;

use serde::{Deserialize, Serialize};
use typeshare::typeshare;

use crate::ts_types::{i64_ts, usize_ts};

#[typeshare]
#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
pub struct Attributes {
    pub charisma: i64_ts,
    pub intelligence: i64_ts,
    pub memory: i64_ts,
    pub perception: i64_ts,
    pub willpower: i64_ts,
}

#[typeshare]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlannedRemap {
    pub entry_index: usize_ts,
    pub attributes: Attributes,
}

#[typeshare]
#[derive(Debug, Serialize, Deserialize)]
pub struct SkillmonPlanEntry {
    pub skill_type_id: i64_ts,
    pub level: i64_ts,
    pub entry_type: String,
    pub notes: Option<String>,
}

#[typeshare]
#[derive(Debug, Serialize, Deserialize)]
pub struct SkillmonPlanRemap {
    pub after_skill_type_id: Option<i64_ts>,
    pub after_skill_level: Option<i64_ts>,
    pub attributes: Attributes,
}

#[typeshare]
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
