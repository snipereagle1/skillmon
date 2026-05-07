use serde::{Deserialize, Serialize};
use typeshare::typeshare;

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
}

#[typeshare]
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillItem {
    pub skill_id: i32,
    pub active_skill_level: i32,
    pub skillpoints_in_skill: i32,
    pub trained_skill_level: i32,
}

#[typeshare]
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillsData {
    pub skills: Vec<SkillItem>,
    pub total_sp: i32,
    pub unallocated_sp: Option<i32>,
}

#[typeshare]
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocationData {
    pub solar_system_id: i32,
    pub station_id: Option<i32>,
    pub structure_id: Option<i32>,
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
pub struct HomeLocationData {
    pub location_id: Option<i32>,
    pub location_type: Option<String>,
}

#[typeshare]
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClonesData {
    pub home_location: Option<HomeLocationData>,
    pub last_clone_jump_date: Option<String>,
    pub last_station_change_date: Option<String>,
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
}

#[typeshare]
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillsPayload {
    pub character_id: i32,
    pub skills: SkillsData,
}

#[typeshare]
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocationPayload {
    pub character_id: i32,
    pub location: LocationData,
}

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
pub struct AttributesPayload {
    pub character_id: i32,
    pub attributes: AttributesData,
}

#[typeshare]
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClonesPayload {
    pub character_id: i32,
    pub clones: ClonesData,
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
