export interface Character {
  character_id: number;
  character_name: string;
}

export interface SkillQueueItem {
  skill_id: number;
  queue_position: number;
  finished_level: number;
  start_date: string | null;
  finish_date: string | null;
  training_start_sp: number | null;
  level_start_sp: number | null;
  level_end_sp: number | null;
}

export interface CharacterSkillQueue {
  character_id: number;
  character_name: string;
  skill_queue: SkillQueueItem[];
}

