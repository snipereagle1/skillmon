use serde::{Deserialize, Serialize};
use typeshare::typeshare;

use crate::ts_types::i64_ts;

// ── Task 001: Queue / Skills / Attributes enriched payloads ─────────────────

#[typeshare]
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillQueueItem {
    pub skill_id: i32,
    pub finished_level: i32,
    pub queue_position: i32,
    pub start_date: Option<String>,
    pub finish_date: Option<String>,
    pub training_start_sp: Option<i32>,
    pub level_start_sp: Option<i32>,
    pub level_end_sp: Option<i32>,
    pub skill_name: Option<String>,
    pub primary_attribute: Option<i64_ts>,
    pub secondary_attribute: Option<i64_ts>,
    pub rank: Option<i64_ts>,
    pub sp_per_minute: Option<f64>,
    pub current_sp: Option<i64_ts>,
}

#[typeshare]
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillItem {
    pub skill_id: i32,
    pub active_skill_level: i32,
    pub skillpoints_in_skill: i32,
    pub trained_skill_level: i32,
    pub skill_name: Option<String>,
    pub group_id: Option<i64_ts>,
    pub group_name: Option<String>,
    pub is_in_queue: bool,
    pub is_injected: bool,
}

#[typeshare]
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
pub struct PublicCharacterData {
    pub name: String,
    pub corporation_id: i32,
    pub alliance_id: Option<i32>,
    pub birthday: String,
    pub bloodline_id: i32,
    pub race_id: i32,
    pub gender: String,
    pub description: Option<String>,
    pub faction_id: Option<i32>,
    pub security_status: Option<f64>,
    pub title: Option<String>,
}

/// Raw ESI attribute data — reused in QueuePayload.attributes
#[typeshare]
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AttributesData {
    pub charisma: i32,
    pub intelligence: i32,
    pub memory: i32,
    pub perception: i32,
    pub willpower: i32,
    pub bonus_remaps: Option<i32>,
    pub last_remap_date: Option<String>,
    pub accrued_remap_cooldown_date: Option<String>,
}

#[typeshare]
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
pub struct RemapData {
    pub remap_id: i32,
    pub character_id: Option<i32>,
    pub plan_id: Option<i32>,
    pub after_skill_type_id: Option<i32>,
    pub after_skill_level: Option<i32>,
    pub intelligence: i32,
    pub perception: i32,
    pub charisma: i32,
    pub willpower: i32,
    pub memory: i32,
    pub created_at: i32,
}

#[typeshare]
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QueuePayload {
    pub character_id: i32,
    pub queue: Vec<SkillQueueItem>,
    pub character_name: String,
    pub unallocated_sp: i64_ts,
    pub is_paused: bool,
    pub is_omega: bool,
    pub attributes: Option<AttributesData>,
}

#[typeshare]
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillsPayload {
    pub character_id: i32,
    pub character_name: String,
    pub total_sp: i64_ts,
    pub unallocated_sp: Option<i64_ts>,
    pub skills: Vec<SkillItem>,
}

#[typeshare]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AttributeBreakdown {
    pub base: i64_ts,
    pub implants: i64_ts,
    pub remap: i64_ts,
    pub accelerator: i64_ts,
    pub total: i64_ts,
}

#[typeshare]
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AttributesPayload {
    pub character_id: i32,
    pub character_name: String,
    pub charisma: AttributeBreakdown,
    pub intelligence: AttributeBreakdown,
    pub memory: AttributeBreakdown,
    pub perception: AttributeBreakdown,
    pub willpower: AttributeBreakdown,
    pub bonus_remaps: Option<i32>,
    pub last_remap_date: Option<String>,
    pub accrued_remap_cooldown_date: Option<String>,
}

// ── Task 002: Location / Clones enriched payloads ────────────────────────────

/// Canonical implant info — used in LocationPayload and CloneInfo
#[typeshare]
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImplantInfo {
    pub type_id: i64_ts,
    pub name: String,
}

/// Canonical clone shape — used in ClonesPayload and CharacterSnapshot.clones (task 003)
#[typeshare]
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloneInfo {
    pub id: i64_ts,
    pub clone_id: Option<i64_ts>,
    pub name: Option<String>,
    pub location_type: String,
    pub location_id: i64_ts,
    pub location_name: Option<String>,
    pub is_current: bool,
    pub implants: Vec<ImplantInfo>,
}

#[typeshare]
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocationPayload {
    pub character_id: i32,
    pub has_location_scope: bool,
    pub solar_system_id: i64_ts,
    pub solar_system_name: String,
    pub region_name: Option<String>,
    pub station_id: Option<i64_ts>,
    pub station_name: Option<String>,
    pub structure_id: Option<i64_ts>,
    pub structure_name: Option<String>,
    pub structure_type_id: Option<i64_ts>,
    pub ship_type_id: Option<i64_ts>,
    pub ship_type_name: Option<String>,
    pub ship_name: Option<String>,
    pub is_online: Option<bool>,
    pub is_docked: Option<bool>,
    pub implants: Vec<ImplantInfo>,
    pub character_name: String,
}

#[typeshare]
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClonesPayload {
    pub character_id: i32,
    pub clones: Vec<CloneInfo>,
}

// ── Misc payloads ─────────────────────────────────────────────────────────────

#[typeshare]
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
pub struct PublicPayload {
    pub character_id: i32,
    pub public: PublicCharacterData,
}

#[typeshare]
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
pub struct RemapsPayload {
    pub character_id: i32,
    pub remaps: Vec<RemapData>,
}

#[typeshare]
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
pub struct NotificationItem {
    pub id: i32,
    pub character_id: i32,
    pub notification_type: String,
    pub title: String,
    pub message: String,
    pub status: String,
    pub created_at: String,
}

#[typeshare]
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
pub struct NotificationsNewPayload {
    pub character_id: i32,
    pub notifications: Vec<NotificationItem>,
}
