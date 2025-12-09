export interface Character {
  character_id: number;
  character_name: string;
}

export interface CharacterAttributes {
  charisma: number;
  intelligence: number;
  memory: number;
  perception: number;
  willpower: number;
}

export interface SkillQueueItem {
  skill_id: number;
  skill_name?: string;
  queue_position: number;
  finished_level: number;
  start_date: string | null;
  finish_date: string | null;
  training_start_sp: number | null;
  level_start_sp: number | null;
  level_end_sp: number | null;
  current_sp?: number | null;
  sp_per_minute?: number | null;
  primary_attribute?: number | null;
  secondary_attribute?: number | null;
  rank?: number | null;
}

export interface CharacterSkillQueue {
  character_id: number;
  character_name: string;
  skill_queue: SkillQueueItem[];
  attributes?: CharacterAttributes | null;
}

export interface CharacterSkill {
  skill_id: number;
  skill_name: string;
  group_id: number;
  group_name: string;
  trained_skill_level: number;
  active_skill_level: number;
  skillpoints_in_skill: number;
  is_in_queue: boolean;
  queue_level?: number;
  is_injected: boolean;
}

export interface SkillGroup {
  group_id: number;
  group_name: string;
  total_levels: number;
  trained_levels: number;
  has_trained_skills: boolean;
}

export interface CharacterSkillsResponse {
  character_id: number;
  skills: CharacterSkill[];
  groups: SkillGroup[];
}

