import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Pencil, Trash2, Brain } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Textarea } from '@/components/ui/textarea';
import type { SkillPlanEntryResponse } from '@/generated/types';
import type { Remap } from '@/hooks/tauri/useRemaps';
import {
  useAddPlanEntry,
  useDeletePlanEntry,
  useUpdatePlanEntry,
} from '@/hooks/tauri/useSkillPlans';
import { useUndoRedo } from '@/hooks/useUndoRedo';
import { cn } from '@/lib/utils';
import { useSkillDetailStore } from '@/stores/skillDetailStore';

import { LevelIndicator } from '../SkillQueue/LevelIndicator';

interface PlanEntryRowProps {
  entry: SkillPlanEntryResponse;
  totalPlanSP: number;
  offsetPercentage: number;
  validationStatus?: 'error' | 'warning';
  remapAfter?: Remap;
}

// eslint-disable-next-line complexity
export function PlanEntryRow({
  entry,
  totalPlanSP,
  offsetPercentage,
  validationStatus,
  remapAfter,
}: PlanEntryRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: entry.entry_id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
  };

  const deleteEntryMutation = useDeletePlanEntry();
  const updateEntryMutation = useUpdatePlanEntry();
  const addEntryMutation = useAddPlanEntry();
  const { trackAction } = useUndoRedo();
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editLevel, setEditLevel] = useState(entry.planned_level);
  const [editNotes, setEditNotes] = useState(entry.notes || '');
  const openSkillDetail = useSkillDetailStore(
    (state: {
      openSkillDetail: (skillId: number, characterId: number | null) => void;
    }) => state.openSkillDetail
  );

  const isPrerequisite = entry.entry_type === 'Prerequisite';
  const levelRoman =
    ['I', 'II', 'III', 'IV', 'V'][entry.planned_level - 1] ||
    entry.planned_level.toString();

  const handleDelete = async () => {
    if (
      !window.confirm(
        `Are you sure you want to remove "${entry.skill_name}" from this plan?`
      )
    ) {
      return;
    }

    let currentEntryId = entry.entry_id;

    try {
      await trackAction(
        `Delete ${entry.skill_name}`,
        async () => {
          await deleteEntryMutation.mutateAsync({ entryId: currentEntryId });
        },
        async () => {
          const result = await addEntryMutation.mutateAsync({
            planId: entry.plan_id,
            skillTypeId: entry.skill_type_id,
            plannedLevel: entry.planned_level,
            notes: entry.notes,
          });
          // Update the ID for next redo/undo
          const restored = result.entries.find(
            (e) =>
              e.skill_type_id === entry.skill_type_id &&
              e.planned_level === entry.planned_level
          );
          if (restored) {
            currentEntryId = restored.entry_id;
          }
        }
      );
    } catch (err) {
      console.error('Failed to delete entry:', err);
    }
  };

  const handleSave = async () => {
    const oldLevel = entry.planned_level;
    const oldNotes = entry.notes;
    const newLevel = editLevel;
    const newNotes = editNotes.trim() || null;

    if (oldLevel === newLevel && oldNotes === newNotes) {
      setEditDialogOpen(false);
      return;
    }

    const currentEntryId = entry.entry_id;

    try {
      await trackAction(
        `Update ${entry.skill_name}`,
        async () => {
          await updateEntryMutation.mutateAsync({
            entryId: currentEntryId,
            plannedLevel: newLevel,
            notes: newNotes,
          });
        },
        async () => {
          await updateEntryMutation.mutateAsync({
            entryId: currentEntryId,
            plannedLevel: oldLevel,
            notes: oldNotes,
          });
        }
      );
      setEditDialogOpen(false);
    } catch (err) {
      console.error('Failed to update entry:', err);
    }
  };

  const spPercentage =
    totalPlanSP > 0 ? (entry.skillpoints_for_level / totalPlanSP) * 100 : 0;
  const MIN_WIDTH_PERCENTAGE = 0.2;
  const displayWidth = Math.max(spPercentage, MIN_WIDTH_PERCENTAGE);

  return (
    <>
      <div
        ref={setNodeRef}
        style={style}
        className={cn(
          'relative px-4 py-3 border-b last:border-b-0 border-border/50 transition-colors',
          isPrerequisite && 'bg-muted/30',
          isDragging && 'bg-accent opacity-50',
          validationStatus === 'error' &&
            'bg-destructive/10 border-destructive/50',
          validationStatus === 'warning' &&
            'bg-yellow-500/10 border-yellow-500/50'
        )}
      >
        <div className="flex items-center justify-between gap-4 relative z-10">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div
              {...attributes}
              {...listeners}
              className={cn(
                'cursor-grab active:cursor-grabbing p-1 -ml-1 hover:bg-muted rounded',
                validationStatus === 'error' && 'text-destructive',
                validationStatus === 'warning' &&
                  'text-yellow-600 dark:text-yellow-500'
              )}
            >
              <GripVertical className="h-4 w-4" />
            </div>
            <LevelIndicator level={entry.planned_level} />
            <div className="flex flex-col flex-1 min-w-0">
              <span
                className={cn(
                  'text-foreground font-medium truncate cursor-pointer hover:underline',
                  isPrerequisite && 'text-muted-foreground',
                  validationStatus === 'error' && 'text-destructive',
                  validationStatus === 'warning' &&
                    'text-yellow-600 dark:text-yellow-500'
                )}
                onClick={() => openSkillDetail(entry.skill_type_id, null)}
              >
                {entry.skill_name} {levelRoman}
              </span>
              {remapAfter && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Brain className="h-3 w-3 text-primary inline-block ml-1.5" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Neural remap scheduled after this skill</p>
                      <p className="text-xs font-mono">
                        I:{remapAfter.intelligence} P:{remapAfter.perception} C:{remapAfter.charisma} W:{remapAfter.willpower} M:{remapAfter.memory}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
              {entry.notes && (
                <span className="text-xs text-muted-foreground truncate">
                  {entry.notes}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'text-sm whitespace-nowrap',
                isPrerequisite ? 'text-muted-foreground' : 'text-foreground'
              )}
            >
              {entry.skillpoints_for_level.toLocaleString('en-US')} SP
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setEditLevel(entry.planned_level);
                setEditNotes(entry.notes || '');
                setEditDialogOpen(true);
              }}
              className="h-8 w-8 p-0"
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDelete}
              disabled={deleteEntryMutation.isPending}
              className="h-8 w-8 p-0"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
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
              className={cn(
                'absolute h-full',
                isPrerequisite
                  ? 'bg-muted-foreground/50'
                  : 'bg-blue-400 dark:bg-blue-500'
              )}
              style={{
                left: `${offsetPercentage}%`,
                width: `${displayWidth}%`,
              }}
            />
          )}
        </div>
      </div>
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Entry</DialogTitle>
            <DialogDescription>
              Update the level and notes for {entry.skill_name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="level">Level</Label>
              <Input
                id="level"
                type="number"
                min="1"
                max="5"
                value={editLevel}
                onChange={(e) =>
                  setEditLevel(
                    Math.max(1, Math.min(5, parseInt(e.target.value) || 1))
                  )
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Notes (optional)</Label>
              <Textarea
                id="notes"
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                placeholder="Add notes..."
                rows={3}
              />
            </div>
            {updateEntryMutation.isError && (
              <p className="text-sm text-destructive">
                {updateEntryMutation.error instanceof Error
                  ? updateEntryMutation.error.message
                  : 'Failed to update entry'}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={updateEntryMutation.isPending}
            >
              {updateEntryMutation.isPending ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
