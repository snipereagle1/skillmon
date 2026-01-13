import { Book, Brain, Target, User, Zap } from 'lucide-react';
import { useMemo } from 'react';

import type {
  Attributes,
  PlannedRemap,
  SkillPlanEntryResponse,
} from '@/generated/types';

interface RemapScheduleProps {
  optimizedEntries: SkillPlanEntryResponse[];
  remaps: PlannedRemap[];
  currentAttributes: Attributes;
}

const ATTRIBUTES: (keyof Attributes)[] = [
  'intelligence',
  'memory',
  'perception',
  'willpower',
  'charisma',
];

const ATTRIBUTE_ICONS = {
  intelligence: Brain,
  memory: Zap,
  perception: Target,
  willpower: Book,
  charisma: User,
};

export function RemapSchedule({
  optimizedEntries,
  remaps,
  currentAttributes,
}: RemapScheduleProps) {
  const filteredRemaps = useMemo(() => {
    const result: PlannedRemap[] = [];
    let lastAttrs = currentAttributes;

    for (const remap of remaps) {
      const isChanged = ATTRIBUTES.some(
        (attr) => remap.attributes[attr] !== lastAttrs[attr]
      );

      if (isChanged) {
        result.push(remap);
        lastAttrs = remap.attributes;
      }
    }

    return result;
  }, [remaps, currentAttributes]);

  if (filteredRemaps.length === 0) {
    return (
      <div className="py-8 text-center text-muted-foreground italic">
        No remaps needed. Current attributes are already optimal for this plan.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="text-sm font-medium text-muted-foreground px-1">
        Recommended Remap Schedule
      </div>
      <div className="space-y-3">
        {filteredRemaps.map((remap, index) => {
          const entry = optimizedEntries[remap.entry_index];
          const prevAttrs =
            index === 0
              ? currentAttributes
              : filteredRemaps[index - 1].attributes;

          return (
            <div
              key={`${remap.entry_index}-${index}`}
              className="border rounded-lg p-3 bg-card"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="h-6 w-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">
                    {index + 1}
                  </div>
                  <div className="text-sm font-semibold">
                    At: {entry?.skill_name || 'Start'}{' '}
                    {entry?.planned_level ? `Level ${entry.planned_level}` : ''}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-5 gap-2">
                {ATTRIBUTES.map((attr) => {
                  const Icon = ATTRIBUTE_ICONS[attr];
                  const value = remap.attributes[attr];
                  const isChanged = prevAttrs[attr] !== value;

                  return (
                    <div
                      key={attr}
                      className="flex flex-col items-center p-1.5 rounded bg-muted/30"
                    >
                      <Icon className="h-3.5 w-3.5 text-muted-foreground mb-1" />
                      <div className="text-[10px] text-muted-foreground capitalize mb-0.5">
                        {attr.slice(0, 3)}
                      </div>
                      <div
                        className={`text-sm font-bold ${isChanged ? 'text-primary' : ''}`}
                      >
                        +{value}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground italic px-1">
        * Remaps are only shown when they differ from the current or previous
        state.
      </p>
    </div>
  );
}
