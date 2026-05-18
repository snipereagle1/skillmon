import { useNavigate } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import React from 'react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { QueuePayload, SkillmonPlan } from '@/generated/types';
import { useForceRefreshSkillQueue } from '@/hooks/tauri/useForceRefreshSkillQueue';
import { useCharacterRemaps } from '@/hooks/tauri/useRemaps';
import { useImportSkillPlanJson } from '@/hooks/tauri/useSkillPlans';
import { useTickRerender } from '@/hooks/useTickRerender';
import { formatDate, formatNumber } from '@/lib/utils';

import { RemapRow } from '../Remaps/RemapRow';
import { SkillQueueEntry } from './SkillQueueEntry';
import { calculateTrainingHours, formatDurationFromHours } from './utils';

interface CharacterQueueProps {
  queue: QueuePayload;
  characterId: number | null;
}

export function CharacterQueue({ queue, characterId }: CharacterQueueProps) {
  const MAX_QUEUE_SIZE = 150;
  const queueSize = queue.queue.length;
  const forceRefresh = useForceRefreshSkillQueue();
  const importPlan = useImportSkillPlanJson();
  const { data: remaps } = useCharacterRemaps(characterId);
  const navigate = useNavigate();
  useTickRerender();

  const handleCreatePlanFromQueue = () => {
    if (queue.queue.length === 0) {
      toast.error('Cannot create a plan from an empty queue');
      return;
    }

    const plan: SkillmonPlan = {
      version: 1,
      name: `${queue.characterName} Queue Plan`,
      description: `Imported from training queue on ${formatDate(new Date())}`,
      auto_prerequisites: true,
      entries: queue.queue.map((item) => ({
        skill_type_id: item.skillId,
        level: item.finishedLevel,
        entry_type: 'Planned',
        notes: undefined,
      })),
      remaps: [],
    };

    importPlan.mutate(
      { plan },
      {
        onSuccess: (planId) => {
          toast.success('Skill plan created from queue');
          navigate({
            to: '/plans/$planId',
            params: { planId: String(planId) },
          });
        },
        onError: (error) => {
          toast.error('Failed to create plan', {
            description: error instanceof Error ? error.message : String(error),
          });
        },
      }
    );
  };

  const calculateTotalTime = (): string => {
    if (queue.queue.length === 0) return '0d 0h 0m';

    let totalHours = 0;

    for (const skill of queue.queue) {
      totalHours += calculateTrainingHours(skill);
    }

    if (totalHours === 0) {
      return '0d 0h 0m';
    }

    return formatDurationFromHours(totalHours);
  };

  const calculateTotalTimeHours = (): number => {
    if (queue.queue.length === 0) return 0;

    let totalHours = 0;

    for (const skill of queue.queue) {
      totalHours += calculateTrainingHours(skill);
    }

    return totalHours;
  };

  const calculateTotalSP = (): number => {
    return queue.queue.reduce((total, skill) => {
      if (skill.levelStartSp != null && skill.levelEndSp != null) {
        return total + (skill.levelEndSp - skill.levelStartSp);
      }
      return total;
    }, 0);
  };

  const totalTime = calculateTotalTime();
  const totalSP = calculateTotalSP();
  const unallocatedSP = queue.unallocatedSp;

  const progressPercentage = Math.min((queueSize / MAX_QUEUE_SIZE) * 100, 100);
  console.table(queue.queue);
  return (
    <TooltipProvider>
      <div className="flex flex-col h-full bg-card">
        <div className="px-4 py-3 border-b border-border" id="top-bar">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="h-card text-foreground">
                Training Queue {queueSize}/{MAX_QUEUE_SIZE}
              </h2>
              {queue.isPaused && (
                <Badge
                  variant="outline"
                  className="border-status-paused text-status-paused"
                >
                  Paused
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleCreatePlanFromQueue}
                disabled={importPlan.isPending || queue.queue.length === 0}
              >
                <Plus className="w-4 h-4 mr-2" />
                {importPlan.isPending
                  ? 'Creating...'
                  : 'Create Plan from Queue'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => characterId && forceRefresh.mutate(characterId)}
                disabled={forceRefresh.isPending || !characterId}
              >
                {forceRefresh.isPending ? 'Refreshing...' : 'Refresh'}
              </Button>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0" id="skill-queue">
          {queue.queue.length === 0 ? (
            <div className="flex items-center justify-center h-full p-8">
              <p className="text-muted-foreground">No skills in queue</p>
            </div>
          ) : (
            (() => {
              const totalHours = calculateTotalTimeHours();
              let cumulativeHours = 0;
              const startRemap = remaps?.find((r) => !r.after_skill_type_id);

              return (
                <>
                  {startRemap && (
                    <RemapRow remap={startRemap} showGripPlaceholder={false} />
                  )}
                  {queue.queue.map((skill, idx) => {
                    const offsetPercentage =
                      totalHours > 0 ? (cumulativeHours / totalHours) * 100 : 0;
                    const skillHours = calculateTrainingHours(skill);
                    cumulativeHours += skillHours;
                    const remapAfter = remaps?.find(
                      (r) =>
                        r.after_skill_type_id === skill.skillId &&
                        r.after_skill_level === skill.finishedLevel
                    );
                    return (
                      <React.Fragment key={`${skill.skillId}-${idx}`}>
                        <SkillQueueEntry
                          skill={skill}
                          totalQueueHours={totalHours}
                          offsetPercentage={offsetPercentage}
                          isPaused={queue.isPaused ?? false}
                          characterId={characterId}
                        />
                        {remapAfter && (
                          <RemapRow
                            remap={remapAfter}
                            showGripPlaceholder={false}
                          />
                        )}
                      </React.Fragment>
                    );
                  })}
                </>
              );
            })()
          )}
        </div>

        <div
          className="border-t border-border bg-muted/30 px-4 py-3 space-y-3 shrink-0"
          id="bottom-bar"
        >
          <div className="text-sm text-status-training">
            {formatNumber(unallocatedSP)} unallocated skill points
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
                className="h-full bg-foreground/80 transition-all"
                style={{ width: `${progressPercentage}%` }}
              />
            </div>

            <div className="text-sm text-muted-foreground">
              {formatNumber(totalSP)} skill points in queue
            </div>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
