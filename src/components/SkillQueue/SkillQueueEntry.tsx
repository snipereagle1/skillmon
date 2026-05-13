import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { SkillQueueItem } from '@/generated/types';
import { cn } from '@/lib/utils';
import { useSkillDetailStore } from '@/stores/skillDetailStore';

import { LevelIndicator } from './LevelIndicator';
import {
  calculateCompletionPercentage,
  calculateTimeToTrain,
  calculateTrainingHours,
  formatAbsoluteDate,
  formatTimeRemaining,
  isCurrentlyTraining,
} from './utils';

interface SkillQueueEntryProps {
  skill: SkillQueueItem;
  totalQueueHours: number;
  offsetPercentage: number;
  isPaused?: boolean;
  characterId: number | null;
}

export function SkillQueueEntry({
  skill,
  totalQueueHours,
  offsetPercentage,
  isPaused,
  characterId,
}: SkillQueueEntryProps) {
  const openSkillDetail = useSkillDetailStore(
    (state: {
      openSkillDetail: (skillId: number, characterId: number | null) => void;
    }) => state.openSkillDetail
  );
  const isTraining = isCurrentlyTraining(skill);
  const levelRoman =
    ['I', 'II', 'III', 'IV', 'V'][skill.finishedLevel - 1] ||
    skill.finishedLevel.toString();
  const spPerHour = skill.spPerMinute ? skill.spPerMinute * 60 : null;
  const timeToTrain = calculateTimeToTrain(skill);
  const absoluteCompletionDate = formatAbsoluteDate(skill.finishDate);

  // Currently training: finishDate countdown is always live (SP-based calc goes stale between refreshes)
  const visibleTime = isTraining
    ? formatTimeRemaining(skill.finishDate)
    : timeToTrain;
  const tooltipContent = absoluteCompletionDate;

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
          <LevelIndicator level={skill.finishedLevel} />
          <div className="flex flex-col flex-1 min-w-0">
            <span
              className="text-foreground font-medium truncate cursor-pointer hover:underline"
              onClick={() => openSkillDetail(skill.skillId, characterId)}
            >
              {skill.skillName || `Skill #${skill.skillId}`} {levelRoman}
            </span>
            {spPerHour !== null && spPerHour > 0 && (
              <span className="text-xs text-muted-foreground">
                {spPerHour.toFixed(0)} SP/hour
              </span>
            )}
          </div>
        </div>
        {visibleTime !== null ? (
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
                {visibleTime}
              </span>
            </TooltipTrigger>
            <TooltipContent side="left">
              <p>Completes: {tooltipContent}</p>
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
            {absoluteCompletionDate}
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
