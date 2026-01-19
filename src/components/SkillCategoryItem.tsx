import { Item, ItemContent, ItemMedia, ItemTitle } from '@/components/ui/item';
import type { SkillGroupResponse } from '@/generated/types';
import { cn } from '@/lib/utils';

interface SkillCategoryItemProps {
  group: SkillGroupResponse;
  isSelected: boolean;
  onClick: () => void;
  plannedLevels?: number;
}

export function SkillCategoryItem({
  group,
  isSelected,
  onClick,
  plannedLevels = 0,
}: SkillCategoryItemProps) {
  const trainedPercentage =
    group.total_levels > 0
      ? (group.trained_levels / group.total_levels) * 100
      : 0;

  const plannedPercentage =
    group.total_levels > 0 ? (plannedLevels / group.total_levels) * 100 : 0;

  return (
    <Item
      variant={isSelected ? 'muted' : 'outline'}
      size="sm"
      className={cn(
        'cursor-pointer relative overflow-hidden py-1.5',
        isSelected && 'bg-primary/10',
        !group.has_trained_skills && plannedLevels === 0 && 'opacity-50'
      )}
      onClick={onClick}
    >
      {/* Progress bar background - full width, behind everything */}
      <div className="absolute inset-0 bg-primary/20 rounded-md z-0" />
      {/* Trained progress bar fill */}
      <div
        className="absolute inset-y-0 left-0 bg-primary/30 transition-all rounded-l-md z-0"
        style={{ width: `${trainedPercentage}%` }}
      />
      {/* Planned progress bar fill - starting from trained percentage */}
      <div
        className="absolute inset-y-0 bg-yellow-400/30 transition-all z-0"
        style={{
          left: `${trainedPercentage}%`,
          width: `${plannedPercentage}%`,
        }}
      />
      <ItemMedia variant="default" className="w-5 h-5 shrink-0 relative z-10">
        {/* Placeholder for icon */}
      </ItemMedia>
      <ItemContent className="flex-1 relative min-h-0 z-10">
        {/* Content on top */}
        <div className="flex items-center justify-between w-full">
          <ItemTitle className="text-sm">{group.group_name}</ItemTitle>
          <span className="text-xs text-muted-foreground">
            {group.trained_levels + plannedLevels} / {group.total_levels}
          </span>
        </div>
      </ItemContent>
    </Item>
  );
}
