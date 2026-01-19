import { useMemo, useState } from 'react';
import { match, P } from 'ts-pattern';

import type { PlanComparisonEntry } from '@/generated/types';
import { usePlanComparison } from '@/hooks/tauri/usePlanComparison';
import { useSkillPlans } from '@/hooks/tauri/useSkillPlans';
import { cn } from '@/lib/utils';
import { useSkillDetailStore } from '@/stores/skillDetailStore';

import { LevelIndicator } from './SkillQueue/LevelIndicator';
import { Label } from './ui/label';
import { Switch } from './ui/switch';

interface CharacterPlanComparisonProps {
  characterId: number | null;
  selectedPlanId: number | null;
  onPlanChange: (planId: number | null) => void;
}

function formatSkillpoints(sp: number): string {
  if (sp >= 1_000_000) {
    return `${(sp / 1_000_000).toFixed(2)}M SP`;
  }
  if (sp >= 1_000) {
    return `${(sp / 1_000).toFixed(1)}K SP`;
  }
  return `${sp.toLocaleString('en-US')} SP`;
}

function ComparisonEntryRow({
  entry,
  characterId,
}: {
  entry: PlanComparisonEntry;
  characterId: number | null;
}) {
  const levelRoman =
    ['I', 'II', 'III', 'IV', 'V'][entry.planned_level - 1] ||
    entry.planned_level.toString();
  const isPrerequisite = entry.entry_type === 'Prerequisite';
  const openSkillDetail = useSkillDetailStore(
    (state: {
      openSkillDetail: (skillId: number, characterId: number | null) => void;
    }) => state.openSkillDetail
  );

  const statusBgColors = {
    complete: 'bg-green-400/20',
    in_progress: 'bg-yellow-400/20',
    not_started: 'bg-muted/30',
  };

  const statusBg =
    statusBgColors[entry.status as keyof typeof statusBgColors] ||
    'bg-muted/30';

  return (
    <div
      className={cn(
        'relative px-4 py-3 border-b last:border-b-0 border-border/50',
        isPrerequisite && 'bg-muted/20',
        statusBg
      )}
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <LevelIndicator level={entry.planned_level} />
          <div className="flex flex-col flex-1 min-w-0">
            <span
              className={cn(
                'text-foreground font-medium truncate cursor-pointer hover:underline',
                isPrerequisite && 'text-muted-foreground'
              )}
              onClick={() => openSkillDetail(entry.skill_type_id, characterId)}
            >
              {entry.skill_name} {levelRoman}
            </span>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span>
                Planned: Level {entry.planned_level} (
                {formatSkillpoints(entry.skillpoints_for_planned_level)})
              </span>
              <span>•</span>
              <span>
                Trained: Level {entry.trained_level} (
                {formatSkillpoints(entry.current_skillpoints)})
              </span>
              {entry.missing_skillpoints > 0 && (
                <>
                  <span>•</span>
                  <span className="text-yellow-400">
                    Missing: {formatSkillpoints(entry.missing_skillpoints)}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function CharacterPlanComparison({
  characterId,
  selectedPlanId,
  onPlanChange,
}: CharacterPlanComparisonProps) {
  const { data: plans, isLoading: isLoadingPlans } = useSkillPlans();
  const { data: comparison, isLoading: isLoadingComparison } =
    usePlanComparison(selectedPlanId, characterId);
  const [showUntrainedOnly, setShowUntrainedOnly] = useState(false);

  const { sortedEntries, stats } = useMemo(() => {
    if (!comparison || !characterId) {
      return {
        sortedEntries: [],
        stats: {
          total: 0,
          complete: 0,
          in_progress: 0,
          not_started: 0,
          totalMissingSP: 0,
        },
      };
    }
    const sorted = [...comparison.entries]
      .filter((e) => !showUntrainedOnly || e.status !== 'complete')
      .sort((a, b) => a.sort_order - b.sort_order);
    return {
      sortedEntries: sorted,
      stats: {
        total: sorted.length,
        complete: sorted.filter((e) => e.status === 'complete').length,
        in_progress: sorted.filter((e) => e.status === 'in_progress').length,
        not_started: sorted.filter((e) => e.status === 'not_started').length,
        totalMissingSP: sorted.reduce(
          (sum, e) => sum + e.missing_skillpoints,
          0
        ),
      },
    };
  }, [comparison, showUntrainedOnly, characterId]);

  if (!characterId) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">
          Select a character to view plan comparison
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0">
      <div className="w-64 border-r border-border shrink-0 overflow-hidden flex flex-col">
        <div className="p-4 border-b border-border">
          <h2 className="font-semibold text-sm">Skill Plans</h2>
        </div>
        <div className="flex-1 overflow-y-auto">
          {match({ isLoadingPlans, plans })
            .with({ isLoadingPlans: true }, () => (
              <div className="flex items-center justify-center h-full p-4">
                <p className="text-sm text-muted-foreground">
                  Loading plans...
                </p>
              </div>
            ))
            .with({ plans: P.union(undefined, []) }, () => (
              <div className="flex items-center justify-center h-full p-4">
                <p className="text-sm text-muted-foreground text-center">
                  No plans available. Create a plan in the Plans tab.
                </p>
              </div>
            ))
            .with({ plans: P.select(P.not(undefined)) }, (plans) => (
              <div className="p-2 space-y-1">
                {plans.map((plan) => (
                  <div
                    key={plan.plan_id}
                    onClick={() => onPlanChange(plan.plan_id)}
                    className={cn(
                      'p-3 rounded-md cursor-pointer transition-colors',
                      selectedPlanId === plan.plan_id
                        ? 'bg-muted text-white'
                        : 'hover:bg-muted'
                    )}
                  >
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold truncate text-sm">
                        {plan.name}
                      </h3>
                      {plan.description && (
                        <p
                          className={cn(
                            'text-xs mt-1 line-clamp-2',
                            selectedPlanId === plan.plan_id
                              ? 'text-white/80'
                              : 'text-muted-foreground'
                          )}
                        >
                          {plan.description}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ))
            .exhaustive()}
        </div>
      </div>
      <div className="flex-1 min-w-0 overflow-hidden flex flex-col">
        {match({ selectedPlanId, isLoadingComparison, comparison })
          .with({ selectedPlanId: null }, () => (
            <div className="flex items-center justify-center h-full">
              <p className="text-muted-foreground">
                Select a plan from the sidebar to view comparison
              </p>
            </div>
          ))
          .with({ isLoadingComparison: true }, () => (
            <div className="flex items-center justify-center h-full">
              <p className="text-muted-foreground">Loading comparison...</p>
            </div>
          ))
          .with({ comparison: P.nullish }, () => (
            <div className="flex items-center justify-center h-full">
              <p className="text-muted-foreground">Failed to load comparison</p>
            </div>
          ))
          .with({ comparison: P.select(P.not(P.nullish)) }, (comp) => (
            <div className="flex flex-col h-full min-h-0">
              <div className="border-b border-border p-4 space-y-3 shrink-0">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <h2 className="text-lg font-semibold truncate">
                      {comp.plan.name}
                    </h2>
                    {comp.plan.description && (
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-1">
                        {comp.plan.description}
                      </p>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-4">
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">
                      Total Skills
                    </div>
                    <div className="text-lg font-semibold">{stats.total}</div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">
                      Complete
                    </div>
                    <div className="text-lg font-semibold text-green-400">
                      {stats.complete}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">
                      In Progress
                    </div>
                    <div className="text-lg font-semibold text-yellow-400">
                      {stats.in_progress}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">
                      Not Started
                    </div>
                    <div className="text-lg font-semibold text-muted-foreground">
                      {stats.not_started}
                    </div>
                  </div>
                </div>
                <div className="pt-2 border-t border-border flex items-center justify-between">
                  <div className="text-sm">
                    <span className="text-muted-foreground">
                      Total Missing SP:{' '}
                    </span>
                    <span className="font-semibold text-yellow-400">
                      {formatSkillpoints(stats.totalMissingSP)}
                    </span>
                  </div>
                  <div className="flex items-center space-x-2 shrink-0">
                    <Label
                      htmlFor="untrained-only"
                      className="text-xs text-muted-foreground"
                    >
                      Untrained only
                    </Label>
                    <Switch
                      id="untrained-only"
                      checked={showUntrainedOnly}
                      onCheckedChange={setShowUntrainedOnly}
                    />
                  </div>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto">
                {sortedEntries.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-32 space-y-2">
                    <p className="text-muted-foreground">
                      {showUntrainedOnly
                        ? 'No untrained skills in this plan'
                        : 'No entries in this plan'}
                    </p>
                  </div>
                ) : (
                  <div>
                    {sortedEntries.map((entry) => (
                      <ComparisonEntryRow
                        key={entry.entry_id}
                        entry={entry}
                        characterId={characterId}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))
          .exhaustive()}
      </div>
    </div>
  );
}
