import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSkillQueues } from "@/hooks/tauri/useSkillQueues";
import type { SkillQueueItem, CharacterSkillQueue } from "@/types/tauri";
import { intervalToDuration } from "date-fns";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

function formatTimeRemaining(finishDate: string | null): string {
  if (!finishDate) return "Paused";

  const finish = new Date(finishDate);
  const now = new Date();

  if (finish <= now) return "Complete";

  const duration = intervalToDuration({ start: now, end: finish });

  const parts: string[] = [];

  if (duration.days && duration.days > 0) {
    parts.push(`${duration.days}d`);
  }
  if (duration.hours && duration.hours > 0) {
    parts.push(`${duration.hours}h`);
  }
  if (duration.minutes && duration.minutes > 0) {
    parts.push(`${duration.minutes}m`);
  }
  if (duration.seconds && duration.seconds > 0 && parts.length === 0) {
    parts.push(`${duration.seconds}s`);
  }

  if (parts.length === 0) {
    return "0s";
  }

  return parts.join(" ");
}

function formatDurationFromHours(hours: number): string {
  if (hours <= 0) return "0h";

  const days = Math.floor(hours / 24);
  const remainingHours = Math.floor(hours % 24);
  const minutes = Math.floor((hours % 1) * 60);

  const parts: string[] = [];

  if (days > 0) {
    parts.push(`${days}d`);
  }
  if (remainingHours > 0) {
    parts.push(`${remainingHours}h`);
  }
  if (minutes > 0 && days === 0) {
    parts.push(`${minutes}m`);
  }

  if (parts.length === 0) {
    return "0h";
  }

  return parts.join(" ");
}

function calculateTimeToTrain(skill: SkillQueueItem): string | null {
  if (!skill.sp_per_minute || skill.sp_per_minute <= 0) {
    return null;
  }

  if (skill.level_start_sp === null || skill.level_end_sp === null) {
    return null;
  }

  const remainingSP = skill.level_end_sp - (skill.training_start_sp || skill.level_start_sp);
  if (remainingSP <= 0) {
    return "Complete";
  }

  const spPerHour = skill.sp_per_minute * 60;
  const hoursToTrain = remainingSP / spPerHour;

  return formatDurationFromHours(hoursToTrain);
}

function LevelIndicator({ level }: { level: number }) {
  const squares = Array.from({ length: level }, (_, i) => (
    <div
      key={i}
      className="w-2 h-2 bg-blue-400 dark:bg-blue-500 rounded-sm"
    />
  ));

  return (
    <div className="flex gap-0.5 w-14">
      {squares}
    </div>
  );
}

function SkillQueueEntry({ skill }: { skill: SkillQueueItem }) {
  const isTraining = skill.queue_position === 0;
  const levelRoman = ["I", "II", "III", "IV", "V"][skill.finished_level - 1] || skill.finished_level.toString();
  const spPerHour = skill.sp_per_minute ? skill.sp_per_minute * 60 : null;
  const timeToTrain = calculateTimeToTrain(skill);
  const completionTime = formatTimeRemaining(skill.finish_date);

  return (
    <div className={`px-4 py-3 border-b last:border-b-0 border-border/50 ${isTraining ? 'bg-primary/5' : ''}`}>
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <LevelIndicator level={skill.finished_level} />
          <div className="flex flex-col flex-1 min-w-0">
            <span className="text-foreground font-medium truncate">
              {skill.skill_name || `Skill #${skill.skill_id}`} {levelRoman}
            </span>
            {spPerHour !== null && spPerHour > 0 && (
              <span className="text-xs text-muted-foreground">
                {spPerHour.toFixed(0)} SP/hour
              </span>
            )}
          </div>
        </div>
        {timeToTrain !== null ? (
          <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>
              <span className={`text-sm whitespace-nowrap cursor-help ${isTraining ? 'text-green-400 font-medium' : 'text-muted-foreground'}`}>
                {timeToTrain}
              </span>
            </TooltipTrigger>
            <TooltipContent side="left">
              <p>Completes: {completionTime}</p>
            </TooltipContent>
          </Tooltip>
        ) : (
          <span className={`text-sm whitespace-nowrap ${isTraining ? 'text-green-400 font-medium' : 'text-muted-foreground'}`}>
            {completionTime}
          </span>
        )}
      </div>
    </div>
  );
}

function CharacterQueue({ queue }: { queue: CharacterSkillQueue }) {
  const MAX_QUEUE_SIZE = 150;
  const queueSize = queue.skill_queue.length;

  const calculateTotalTime = (): string => {
    if (queue.skill_queue.length === 0) return "0d 0h 0m";

    let totalHours = 0;

    for (const skill of queue.skill_queue) {
      if (!skill.sp_per_minute || skill.sp_per_minute <= 0) {
        continue;
      }

      if (skill.level_start_sp === null || skill.level_end_sp === null) {
        continue;
      }

      const remainingSP = skill.level_end_sp - (skill.training_start_sp || skill.level_start_sp);
      if (remainingSP <= 0) {
        continue;
      }

      const spPerHour = skill.sp_per_minute * 60;
      const hoursToTrain = remainingSP / spPerHour;
      totalHours += hoursToTrain;
    }

    if (totalHours === 0) {
      return "0d 0h 0m";
    }

    return formatDurationFromHours(totalHours);
  };

  const calculateTotalSP = (): number => {
    return queue.skill_queue.reduce((total, skill) => {
      if (skill.level_start_sp !== null && skill.level_end_sp !== null) {
        return total + (skill.level_end_sp - skill.level_start_sp);
      }
      return total;
    }, 0);
  };

  const totalTime = calculateTotalTime();
  const totalSP = calculateTotalSP();
  const unallocatedSP = 0;

  const progressPercentage = Math.min((queueSize / MAX_QUEUE_SIZE) * 100, 100);

  return (
    <TooltipProvider>
      <div className="flex flex-col h-full bg-background">
        <div className="px-4 py-3 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">
            Training Queue {queueSize}/{MAX_QUEUE_SIZE}
          </h2>
        </div>

        <div className="flex-1 overflow-y-auto">
          {queue.skill_queue.length === 0 ? (
            <div className="flex items-center justify-center h-full p-8">
              <p className="text-muted-foreground">No skills in queue</p>
            </div>
          ) : (
            queue.skill_queue.map((skill, idx) => (
              <SkillQueueEntry key={`${skill.skill_id}-${idx}`} skill={skill} />
            ))
          )}
        </div>

      <div className="border-t border-border bg-muted/30 px-4 py-3 space-y-3">
        <div className="text-sm text-green-400">
          {unallocatedSP.toLocaleString()} unallocated skill points
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-foreground">Training Time</span>
            <span className="text-sm text-foreground">{totalTime}</span>
          </div>

          <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-white/80 transition-all"
              style={{ width: `${progressPercentage}%` }}
            />
          </div>

          <div className="text-sm text-muted-foreground">
            {totalSP.toLocaleString()} skill points in queue
          </div>
        </div>
      </div>
      </div>
    </TooltipProvider>
  );
}

interface SkillQueueProps {
  characterId?: number | null;
}

export function SkillQueue({ characterId }: SkillQueueProps = {}) {
  const { data: queues = [], isLoading, error } = useSkillQueues();
  const queryClient = useQueryClient();

  useEffect(() => {
    let unlistenFn: (() => void) | null = null;
    const setupListener = async () => {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        const unlisten = await listen("auth-success", async () => {
          await new Promise(resolve => setTimeout(resolve, 500));
          queryClient.invalidateQueries({ queryKey: ["skillQueues"] });
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
  }, [queryClient]);

  if (isLoading) {
    return <p className="text-muted-foreground">Loading skill queues...</p>;
  }

  if (error) {
    return <p className="text-destructive">Error: {error instanceof Error ? error.message : "Failed to load skill queues"}</p>;
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
          onClick={() => queryClient.invalidateQueries({ queryKey: ["skillQueues"] })}
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

