import { Badge } from '@/components/ui/badge';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { CharacterSkillQueue } from '@/generated/types';

import { SkillQueueEntry } from './SkillQueueEntry';
import { calculateTrainingHours, formatDurationFromHours } from './utils';

interface CharacterQueueProps {
  queue: CharacterSkillQueue;
}

export function CharacterQueue({ queue }: CharacterQueueProps) {
  const MAX_QUEUE_SIZE = 150;
  const queueSize = queue.skill_queue.length;

  const calculateTotalTime = (): string => {
    if (queue.skill_queue.length === 0) return '0d 0h 0m';

    let totalHours = 0;

    for (const skill of queue.skill_queue) {
      totalHours += calculateTrainingHours(skill);
    }

    if (totalHours === 0) {
      return '0d 0h 0m';
    }

    return formatDurationFromHours(totalHours);
  };

  const calculateTotalTimeHours = (): number => {
    if (queue.skill_queue.length === 0) return 0;

    let totalHours = 0;

    for (const skill of queue.skill_queue) {
      totalHours += calculateTrainingHours(skill);
    }

    return totalHours;
  };

  const calculateTotalSP = (): number => {
    return queue.skill_queue.reduce((total, skill) => {
      if (skill.level_start_sp != null && skill.level_end_sp != null) {
        return total + (skill.level_end_sp - skill.level_start_sp);
      }
      return total;
    }, 0);
  };

  const totalTime = calculateTotalTime();
  const totalSP = calculateTotalSP();
  const unallocatedSP = queue.unallocated_sp;

  const progressPercentage = Math.min((queueSize / MAX_QUEUE_SIZE) * 100, 100);

  return (
    <TooltipProvider>
      <div className="flex flex-col h-full bg-background">
        <div className="px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-foreground">
              Training Queue {queueSize}/{MAX_QUEUE_SIZE}
            </h2>
            {queue.is_paused && (
              <Badge
                variant="outline"
                className="border-yellow-500 text-yellow-500"
              >
                Paused
              </Badge>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {queue.skill_queue.length === 0 ? (
            <div className="flex items-center justify-center h-full p-8">
              <p className="text-muted-foreground">No skills in queue</p>
            </div>
          ) : (
            (() => {
              const totalHours = calculateTotalTimeHours();
              let cumulativeHours = 0;
              return queue.skill_queue.map((skill, idx) => {
                const offsetPercentage =
                  totalHours > 0 ? (cumulativeHours / totalHours) * 100 : 0;
                const skillHours = calculateTrainingHours(skill);
                cumulativeHours += skillHours;
                return (
                  <SkillQueueEntry
                    key={`${skill.skill_id}-${idx}`}
                    skill={skill}
                    totalQueueHours={totalHours}
                    offsetPercentage={offsetPercentage}
                    isPaused={queue.is_paused ?? false}
                  />
                );
              });
            })()
          )}
        </div>

        <div className="border-t border-border bg-muted/30 px-4 py-3 space-y-3">
          <div className="text-sm text-green-400">
            {unallocatedSP.toLocaleString('en-US')} unallocated skill points
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-foreground">
                Training Time
              </span>
              <span className="text-sm text-foreground">{totalTime}</span>
            </div>

            <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-white/80 transition-all"
                style={{ width: `${progressPercentage}%` }}
              />
            </div>

            <div className="text-sm text-muted-foreground">
              {totalSP.toLocaleString('en-US')} skill points in queue
            </div>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
