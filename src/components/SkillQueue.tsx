import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface SkillQueueItem {
  skill_id: number;
  queue_position: number;
  finished_level: number;
  start_date: string | null;
  finish_date: string | null;
  training_start_sp: number | null;
  level_start_sp: number | null;
  level_end_sp: number | null;
}

interface CharacterSkillQueue {
  character_id: number;
  character_name: string;
  skill_queue: SkillQueueItem[];
}

function formatTimeRemaining(finishDate: string | null): string {
  if (!finishDate) return "Paused";

  const finish = new Date(finishDate);
  const now = new Date();
  const diff = finish.getTime() - now.getTime();

  if (diff <= 0) return "Complete";

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function SkillQueueEntry({ skill }: { skill: SkillQueueItem }) {
  const isTraining = skill.queue_position === 0;

  return (
    <div className={`p-2 border-b last:border-b-0 ${isTraining ? 'bg-primary/10 dark:bg-primary/20' : ''}`}>
      <div className="flex justify-between items-center">
        <div>
          <span className="font-medium">Skill #{skill.skill_id}</span>
          <span className="ml-2 text-muted-foreground">Level {skill.finished_level}</span>
        </div>
        <span className={`text-sm ${isTraining ? 'text-primary font-medium' : 'text-muted-foreground'}`}>
          {formatTimeRemaining(skill.finish_date)}
        </span>
      </div>
    </div>
  );
}

function CharacterQueue({ queue }: { queue: CharacterSkillQueue }) {
  const activeSkills = queue.skill_queue.filter(s => s.finish_date !== null);
  const totalTime = activeSkills.length > 0
    ? formatTimeRemaining(activeSkills[activeSkills.length - 1]?.finish_date ?? null)
    : "Empty";

  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="bg-muted p-3 flex justify-between items-center">
        <h3 className="font-semibold">{queue.character_name}</h3>
        <span className="text-sm text-muted-foreground">
          {queue.skill_queue.length} skills • {totalTime} total
        </span>
      </div>
      <div className="max-h-64 overflow-y-auto">
        {queue.skill_queue.length === 0 ? (
          <p className="p-3 text-muted-foreground text-center">No skills in queue</p>
        ) : (
          queue.skill_queue.map((skill, idx) => (
            <SkillQueueEntry key={`${skill.skill_id}-${idx}`} skill={skill} />
          ))
        )}
      </div>
    </div>
  );
}

interface SkillQueueProps {
  characterId?: number | null;
}

export function SkillQueue({ characterId }: SkillQueueProps = {}) {
  const [queues, setQueues] = useState<CharacterSkillQueue[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadQueues = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await invoke<CharacterSkillQueue[]>("get_skill_queues");
      setQueues(data);
    } catch (err) {
      console.error("Failed to load skill queues:", err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadQueues();

    let unlistenFn: (() => void) | null = null;
    const setupListener = async () => {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        const unlisten = await listen("auth-success", async () => {
          await new Promise(resolve => setTimeout(resolve, 500));
          await loadQueues();
        });
        unlistenFn = unlisten;
      } catch (error) {
        console.error("Failed to setup listener:", error);
      }
    };

    setupListener();

    return () => {
      if (unlistenFn) unlistenFn();
    };
  }, []);

  if (isLoading) {
    return <p className="text-muted-foreground">Loading skill queues...</p>;
  }

  if (error) {
    return <p className="text-destructive">Error: {error}</p>;
  }

  if (characterId !== undefined && characterId !== null) {
    const queue = queues.find(q => q.character_id === characterId);
    if (!queue) {
      return <p className="text-muted-foreground">No skill queue found for this character.</p>;
    }
    return <CharacterQueue queue={queue} />;
  }

  if (queues.length === 0) {
    return <p className="text-muted-foreground">No characters with skill queues found.</p>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold">Skill Queues</h2>
        <button
          onClick={loadQueues}
          className="px-3 py-1 bg-gray-600 text-white rounded hover:bg-gray-700 text-sm"
        >
          Refresh
        </button>
      </div>
      <div className="space-y-4">
        {queues.map((queue) => (
          <CharacterQueue key={queue.character_id} queue={queue} />
        ))}
      </div>
    </div>
  );
}

