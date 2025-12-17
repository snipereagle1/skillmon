import { Item, ItemContent, ItemTitle } from '@/components/ui/item';
import type { CharacterSkillResponse } from '@/generated/types';
import { cn } from '@/lib/utils';

interface SkillItemProps {
  skill: CharacterSkillResponse;
}

export function SkillItem({ skill }: SkillItemProps) {
  const squareSize = skill.is_injected ? 'w-2 h-2' : 'w-1.5 h-1.5';
  const squareOpacity = skill.is_injected ? 'opacity-100' : 'opacity-50';

  const renderLevelSquare = (level: number) => {
    const isTrained = skill.trained_skill_level >= level;
    const isQueued =
      skill.is_in_queue && skill.queue_level && skill.queue_level >= level;

    let bgColor = 'bg-muted';
    if (isTrained) {
      bgColor = 'bg-white';
    } else if (isQueued) {
      bgColor = 'bg-blue-400';
    }

    return (
      <div
        key={level}
        className={cn(squareSize, squareOpacity, bgColor, 'rounded-sm')}
      />
    );
  };

  return (
    <Item variant="outline" size="sm" className="py-1.5">
      <ItemContent>
        <div className="flex items-center gap-3">
          <ItemTitle className="flex-1 text-sm">{skill.skill_name}</ItemTitle>
          <div className="flex gap-0.5 shrink-0">
            {[1, 2, 3, 4, 5].map((level) => renderLevelSquare(level))}
          </div>
        </div>
      </ItemContent>
    </Item>
  );
}
