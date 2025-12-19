import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
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

interface PlanEntryRowProps {
  entry: SkillPlanEntryResponse;
}

export function PlanEntryRow({ entry }: PlanEntryRowProps) {
  const deleteEntryMutation = useDeletePlanEntry();
  const updateEntryMutation = useUpdatePlanEntry();
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editLevel, setEditLevel] = useState(entry.planned_level);
  const [editNotes, setEditNotes] = useState(entry.notes || '');

  const isPrerequisite = entry.entry_type === 'Prerequisite';

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

  const levelDots = Array.from({ length: 5 }, (_, i) => i + 1).map((level) => (
    <span
      key={level}
      className={`inline-block w-2 h-2 rounded-full ${
        level <= entry.planned_level
          ? isPrerequisite
            ? 'bg-muted-foreground'
            : 'bg-primary'
          : 'bg-muted'
      }`}
    />
  ));

  return (
    <>
      <div
        className={`
          p-3 rounded-md border
          ${
            isPrerequisite
              ? 'bg-muted/50 border-muted text-muted-foreground'
              : 'bg-background border-border'
          }
        `}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span
                className={`font-medium ${
                  isPrerequisite ? 'text-muted-foreground' : ''
                }`}
              >
                {entry.skill_name}
              </span>
              <Badge
                variant={isPrerequisite ? 'outline' : 'default'}
                className={isPrerequisite ? 'text-xs' : ''}
              >
                {entry.entry_type}
              </Badge>
            </div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm text-muted-foreground">Level:</span>
              <div className="flex items-center gap-1">{levelDots}</div>
              <span className="text-sm text-muted-foreground">
                {entry.planned_level}/5
              </span>
            </div>
            {entry.notes && (
              <p className="text-sm text-muted-foreground mt-1">
                {entry.notes}
              </p>
            )}
          </div>
          <div className="flex gap-1 shrink-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setEditLevel(entry.planned_level);
                setEditNotes(entry.notes || '');
                setEditDialogOpen(true);
              }}
            >
              Edit
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDelete}
              disabled={deleteEntryMutation.isPending}
            >
              Delete
            </Button>
          </div>
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
