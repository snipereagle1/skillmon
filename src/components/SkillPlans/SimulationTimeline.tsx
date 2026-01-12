import { useEffect, useState } from 'react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { getTypeNames } from '@/generated/commands';
import { SimulationResult } from '@/generated/types';
import { formatDuration } from '@/lib/utils';

import { LevelIndicator } from '../SkillQueue/LevelIndicator';

const ATTRIBUTE_NAME_MAP: Record<number, string> = {
  164: 'Charisma',
  165: 'Intelligence',
  166: 'Memory',
  167: 'Perception',
  168: 'Willpower',
};

interface SimulationTimelineProps {
  result: SimulationResult;
}

export function SimulationTimeline({ result }: SimulationTimelineProps) {
  const [skillNames, setSkillNames] = useState<Record<number, string>>({});

  useEffect(() => {
    const typeIds = Array.from(
      new Set(result.segments.map((s) => s.skill_type_id))
    );
    if (typeIds.length > 0) {
      getTypeNames({ typeIds }).then((names) => {
        const map: Record<number, string> = {};
        names.forEach((n) => (map[n.type_id] = n.name));
        setSkillNames(map);
      });
    }
  }, [result.segments]);

  return (
    <Card className="h-full flex flex-col overflow-hidden">
      <CardHeader className="shrink-0">
        <CardTitle>Simulation Results</CardTitle>
        <div className="text-2xl font-bold">
          Total Time: {formatDuration(result.total_seconds)}
        </div>
      </CardHeader>
      <CardContent className="flex-1 min-h-0 p-0">
        <ScrollArea className="h-full">
          <div className="flex flex-col">
            {result.segments.map((segment, i) => {
              const levelRoman =
                ['I', 'II', 'III', 'IV', 'V'][segment.level - 1] ||
                segment.level.toString();

              const offsetPercentage =
                result.total_sp > 0
                  ? (segment.cumulative_sp / result.total_sp) * 100
                  : 0;
              const spPercentage =
                result.total_sp > 0
                  ? (segment.sp_earned / result.total_sp) * 100
                  : 0;

              return (
                <div
                  key={i}
                  className="relative px-4 py-3 border-b last:border-b-0 border-border/50 transition-colors"
                >
                  <div className="flex items-center justify-between gap-4 relative z-10">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <LevelIndicator level={segment.level} />
                      <div className="flex flex-col flex-1 min-w-0">
                        <span className="text-foreground font-medium truncate">
                          {skillNames[segment.skill_type_id] ||
                            `Skill ${segment.skill_type_id}`}{' '}
                          {levelRoman}
                        </span>
                        <div className="text-xs text-muted-foreground truncate flex gap-3">
                          <span>
                            SP/hour: {(segment.sp_per_minute * 60).toFixed(0)}
                          </span>
                          <span className="opacity-50">|</span>
                          <span>
                            {segment.primary_attribute_id &&
                              ATTRIBUTE_NAME_MAP[segment.primary_attribute_id]}
                            {segment.secondary_attribute_id &&
                              ` / ${
                                ATTRIBUTE_NAME_MAP[
                                  segment.secondary_attribute_id
                                ]
                              }`}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium whitespace-nowrap">
                        {formatDuration(segment.duration_seconds)}
                      </span>
                    </div>
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 pointer-events-none">
                    {offsetPercentage > 0 && (
                      <div
                        className="absolute h-full bg-blue-400/20 dark:bg-blue-500/20"
                        style={{ left: '0%', width: `${offsetPercentage}%` }}
                      />
                    )}
                    {spPercentage > 0 && (
                      <div
                        className="absolute h-full bg-blue-400 dark:bg-blue-500"
                        style={{
                          left: `${offsetPercentage}%`,
                          width: `${spPercentage}%`,
                        }}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
