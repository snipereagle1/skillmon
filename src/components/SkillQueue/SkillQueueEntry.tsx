import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { SkillQueueItem } from '@/generated/types';
import { cn } from '@/lib/utils';

import { LevelIndicator } from './LevelIndicator';
import {
  calculateCompletionPercentage,
  calculateTimeToTrain,
  calculateTrainingHours,
  formatTimeRemaining,
  isCurrentlyTraining,
} from './utils';

interface SkillQueueEntryProps {
  skill: SkillQueueItem;
  totalQueueHours: number;
  offsetPercentage: number;
  isPaused?: boolean;
}

export function SkillQueueEntry({
  skill,
  totalQueueHours,
  offsetPercentage,
  isPaused,
}: SkillQueueEntryProps) {
  const isTraining = isCurrentlyTraining(skill);
  const levelRoman =
    ['I', 'II', 'III', 'IV', 'V'][skill.finished_level - 1] ||
    skill.finished_level.toString();
  const spPerHour = skill.sp_per_minute ? skill.sp_per_minute * 60 : null;
  const timeToTrain = calculateTimeToTrain(skill);
  const completionTime = formatTimeRemaining(skill.finish_date);

  const completionPercentage = isTraining
    ? calculateCompletionPercentage(skill)
    : 0;
  const skillHours = calculateTrainingHours(skill);
  const timePercentage =
    totalQueueHours > 0 ? (skillHours / totalQueueHours) * 100 : 0;
  const MIN_WIDTH_PERCENTAGE = 0.2;
  const displayWidth = Math.max(timePercentage, MIN_WIDTH_PERCENTAGE);

  const useYellow = isPaused === true && isTraining;
  const progressColor = useYellow ? 'bg-yellow-500/20' : 'bg-green-500/20';
  const textColor = useYellow ? 'text-yellow-400' : 'text-green-400';

  return (
    <div
      className={cn(
        'relative px-4 py-3 border-b last:border-b-0 border-border/50',
        isTraining && 'bg-primary/5'
      )}
    >
      {isTraining && (
        <div
          className={cn(
            'absolute inset-0 pointer-events-none transition-all',
            progressColor
          )}
          style={{
            width: `${Math.max(completionPercentage, 1)}%`,
          }}
        />
      )}
      <div className="flex items-center justify-between gap-4 relative z-10">
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
              <span
                className={cn(
                  'text-sm whitespace-nowrap cursor-help',
                  isTraining
                    ? cn(textColor, 'font-medium')
                    : 'text-muted-foreground'
                )}
              >
                {timeToTrain}
              </span>
            </TooltipTrigger>
            <TooltipContent side="left">
              <p>Completes: {completionTime}</p>
            </TooltipContent>
          </Tooltip>
        ) : (
          <span
            className={cn(
              'text-sm whitespace-nowrap',
              isTraining
                ? cn(textColor, 'font-medium')
                : 'text-muted-foreground'
            )}
          >
            {completionTime}
          </span>
        )}
      </div>
      <div className="absolute bottom-0 left-0 right-0 h-0.5 pointer-events-none">
        {offsetPercentage > 0 && (
          <div
            className="absolute h-full bg-blue-400/20 dark:bg-blue-500/20"
            style={{ left: '0%', width: `${offsetPercentage}%` }}
          />
        )}
        {timePercentage > 0 && (
          <div
            className="absolute h-full bg-blue-400 dark:bg-blue-500"
            style={{ left: `${offsetPercentage}%`, width: `${displayWidth}%` }}
          />
        )}
      </div>
    </div>
  );
}
