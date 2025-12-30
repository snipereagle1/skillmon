import { Pencil, Trash2 } from 'lucide-react';
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
import { Textarea } from '@/components/ui/textarea';
import type { SkillPlanEntryResponse } from '@/generated/types';
import {
  useDeletePlanEntry,
  useUpdatePlanEntry,
} from '@/hooks/tauri/useSkillPlans';
import { cn } from '@/lib/utils';
import { useSkillDetailStore } from '@/stores/skillDetailStore';

import { LevelIndicator } from '../SkillQueue/LevelIndicator';

interface PlanEntryRowProps {
  entry: SkillPlanEntryResponse;
  totalPlanSP: number;
  offsetPercentage: number;
}

export function PlanEntryRow({
  entry,
  totalPlanSP,
  offsetPercentage,
}: PlanEntryRowProps) {
  const deleteEntryMutation = useDeletePlanEntry();
  const updateEntryMutation = useUpdatePlanEntry();
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

    try {
      await deleteEntryMutation.mutateAsync({ entryId: entry.entry_id });
    } catch (err) {
      console.error('Failed to delete entry:', err);
    }
  };

  const handleSave = async () => {
    try {
      await updateEntryMutation.mutateAsync({
        entryId: entry.entry_id,
        plannedLevel: editLevel,
        notes: editNotes.trim() || null,
      });
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
        className={cn(
          'relative px-4 py-3 border-b last:border-b-0 border-border/50',
          isPrerequisite && 'bg-muted/30'
        )}
      >
        <div className="flex items-center justify-between gap-4 relative z-10">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <LevelIndicator level={entry.planned_level} />
            <div className="flex flex-col flex-1 min-w-0">
              <span
                className={cn(
                  'text-foreground font-medium truncate cursor-pointer hover:underline',
                  isPrerequisite && 'text-muted-foreground'
                )}
                onClick={() => openSkillDetail(entry.skill_type_id, null)}
              >
                {entry.skill_name} {levelRoman}
              </span>
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
