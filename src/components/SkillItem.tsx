import { Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Item, ItemContent, ItemTitle } from '@/components/ui/item';
import type { CharacterSkillResponse } from '@/generated/types';
import { cn } from '@/lib/utils';

interface SkillItemProps {
  skill: CharacterSkillResponse;
  onClick?: () => void;
  plannedLevel?: number;
  onAddStep?: (level: number) => void;
}

export function SkillItem({
  skill,
  onClick,
  plannedLevel = 0,
  onAddStep,
}: SkillItemProps) {
  const squareSize = skill.is_injected ? 'w-2 h-2' : 'w-1.5 h-1.5';
  const squareOpacity = skill.is_injected ? 'opacity-100' : 'opacity-50';

  const renderLevelSquare = (level: number) => {
    const isTrained = skill.trained_skill_level >= level;
    const isQueued =
      skill.is_in_queue && skill.queue_level && skill.queue_level >= level;
    const isPlanned = plannedLevel >= level;

    let bgColor = 'bg-muted';
    if (isTrained) {
      bgColor = 'bg-white';
    } else if (isQueued) {
      bgColor = 'bg-blue-400';
    } else if (isPlanned) {
      bgColor = 'bg-yellow-400';
    }

    return (
      <div
        key={level}
        className={cn(squareSize, squareOpacity, bgColor, 'rounded-sm')}
      />
    );
  };

  return (
    <Item
      variant="outline"
      size="sm"
      className={cn('py-1.5', onClick && 'cursor-pointer hover:bg-accent')}
      onClick={onClick}
    >
      <ItemContent>
        <div className="flex items-center gap-3">
          <ItemTitle className="flex-1 text-sm">{skill.skill_name}</ItemTitle>
          <div className="flex items-center gap-2">
            <div className="flex gap-0.5 shrink-0">
              {[1, 2, 3, 4, 5].map((level) => renderLevelSquare(level))}
            </div>
            {onAddStep && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="h-6 w-6"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {[1, 2, 3, 4, 5].map((lvl) => (
                    <DropdownMenuItem
                      key={lvl}
                      onClick={(e) => {
                        e.stopPropagation();
                        onAddStep(lvl);
                      }}
                      disabled={plannedLevel >= lvl}
                    >
                      Level {lvl}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      </ItemContent>
    </Item>
  );
}
