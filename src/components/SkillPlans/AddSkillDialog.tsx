import { useQueryClient } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import { useEffect, useMemo, useState } from 'react';

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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { deletePlanEntry } from '@/generated/commands';
import type { SkillPlanWithEntriesResponse } from '@/generated/types';
import { useAddPlanEntry } from '@/hooks/tauri/useSkillPlans';
import { useUndoRedo } from '@/hooks/useUndoRedo';

interface AddSkillDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  planId: number;
}

interface Skill {
  skill_type_id: number;
  name: string;
}

export function AddSkillDialog({
  open,
  onOpenChange,
  planId,
}: AddSkillDialogProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [skills, setSkills] = useState<Skill[]>([]);
  const [selectedSkillId, setSelectedSkillId] = useState<number | null>(null);
  const [level, setLevel] = useState<number>(5);
  const [notes, setNotes] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const addEntryMutation = useAddPlanEntry();
  const queryClient = useQueryClient();
  const { trackAction } = useUndoRedo();

  const searchSkills = async (query: string) => {
    if (!query.trim()) {
      setSkills([]);
      return;
    }

    setIsSearching(true);
    try {
      const results = await invoke<Skill[]>('search_skills', {
        query: query.trim(),
      });
      setSkills(results);
    } catch (err) {
      console.error('Failed to search skills:', err);
      setSkills([]);
    } finally {
      setIsSearching(false);
    }
  };

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      searchSkills(searchQuery);
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [searchQuery]);

  const handleAdd = async () => {
    if (!selectedSkillId) return;

    try {
      const currentData =
        queryClient.getQueryData<SkillPlanWithEntriesResponse>([
          'skillPlanWithEntries',
          planId,
        ]);
      const beforeEntryIds = new Set(
        currentData?.entries.map((e) => e.entry_id) || []
      );

      let addedEntryIds: number[] = [];

      await trackAction(
        `Add ${selectedSkill?.name || 'Skill'}`,
        async () => {
          const result = await addEntryMutation.mutateAsync({
            planId,
            skillTypeId: selectedSkillId,
            plannedLevel: level,
            notes: notes.trim() || null,
          });

          // Store the newly added entry IDs for undo
          const afterEntryIds = result.entries.map((e) => e.entry_id);
          addedEntryIds = afterEntryIds.filter((id) => !beforeEntryIds.has(id));
        },
        async () => {
          for (const entryId of addedEntryIds) {
            // eslint-disable-next-line no-await-in-loop
            await deletePlanEntry({ entryId });
          }
          queryClient.invalidateQueries({
            queryKey: ['skillPlanWithEntries', planId],
          });
          queryClient.invalidateQueries({
            queryKey: ['skillPlanValidation', planId],
          });
        }
      );

      setSearchQuery('');
      setSelectedSkillId(null);
      setLevel(5);
      setNotes('');
      onOpenChange(false);
    } catch (err) {
      console.error('Failed to add entry:', err);
    }
  };

  const selectedSkill = useMemo(
    () => skills.find((s) => s.skill_type_id === selectedSkillId),
    [skills, selectedSkillId]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Skill</DialogTitle>
          <DialogDescription>
            Search for a skill and add it to your plan.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="search">Search Skill</Label>
            <Input
              id="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Type skill name..."
              autoFocus
            />
            {isSearching && (
              <p className="text-xs text-muted-foreground">Searching...</p>
            )}
            {searchQuery && !isSearching && skills.length === 0 && (
              <p className="text-xs text-muted-foreground">No skills found</p>
            )}
            {skills.length > 0 && (
              <div className="max-h-48 overflow-y-auto border rounded-md p-2 space-y-1">
                {skills.map((skill) => (
                  <div
                    key={skill.skill_type_id}
                    onClick={() => setSelectedSkillId(skill.skill_type_id)}
                    className={`
                      p-2 rounded-md cursor-pointer transition-colors
                      ${
                        selectedSkillId === skill.skill_type_id
                          ? 'bg-primary text-primary-foreground'
                          : 'hover:bg-muted'
                      }
                    `}
                  >
                    {skill.name}
                  </div>
                ))}
              </div>
            )}
          </div>
          {selectedSkill && (
            <>
              <div className="space-y-2">
                <Label htmlFor="level">Level</Label>
                <Select
                  value={level.toString()}
                  onValueChange={(v) => setLevel(parseInt(v))}
                >
                  <SelectTrigger id="level">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4, 5].map((lvl) => (
                      <SelectItem key={lvl} value={lvl.toString()}>
                        Level {lvl}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="notes">Notes (optional)</Label>
                <Textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add notes..."
                  rows={3}
                />
              </div>
            </>
          )}
          {addEntryMutation.isError && (
            <p className="text-sm text-destructive">
              {addEntryMutation.error instanceof Error
                ? addEntryMutation.error.message
                : 'Failed to add skill'}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleAdd}
            disabled={!selectedSkillId || addEntryMutation.isPending}
          >
            {addEntryMutation.isPending ? 'Adding...' : 'Add Skill'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
