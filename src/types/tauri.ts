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

