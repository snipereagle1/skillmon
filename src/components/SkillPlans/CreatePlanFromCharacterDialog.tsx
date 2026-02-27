import { useMemo, useState } from 'react';
import { match, P } from 'ts-pattern';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useAccountsAndCharacters } from '@/hooks/tauri/useAccountsAndCharacters';
import { useCharacterSkills } from '@/hooks/tauri/useCharacterSkills';
import {
  useCreatePlanFromCharacter,
  usePreviewPlanFromCharacter,
} from '@/hooks/tauri/useSkillPlans';
import { formatSkillpoints } from '@/lib/utils';

interface CreatePlanFromCharacterDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (planId: number) => void;
}

export function CreatePlanFromCharacterDialog({
  open,
  onOpenChange,
  onSuccess,
}: CreatePlanFromCharacterDialogProps) {
  const [characterId, setCharacterId] = useState<number | null>(null);
  const [planName, setPlanName] = useState('');
  const [description, setDescription] = useState('');
  const [includedGroupIds, setIncludedGroupIds] = useState<Set<number>>(
    new Set()
  );
  const [hasUserChangedGroups, setHasUserChangedGroups] = useState(false);

  const { data: accountsData } = useAccountsAndCharacters();
  const { data: characterSkills } = useCharacterSkills(characterId);

  const defaultGroupIds = useMemo(() => {
    if (
      characterSkills?.character_id === characterId &&
      characterSkills.groups.length > 0
    ) {
      return new Set(characterSkills.groups.map((g) => g.group_id));
    }
    return new Set<number>();
  }, [characterId, characterSkills]);

  const effectiveIncludedGroupIds = hasUserChangedGroups
    ? includedGroupIds
    : defaultGroupIds;

  const includedIdsArray = useMemo(
    () => Array.from(effectiveIncludedGroupIds),
    [effectiveIncludedGroupIds]
  );
  const { data: preview, isFetching: isPreviewFetching } =
    usePreviewPlanFromCharacter(characterId, includedIdsArray);
  const createPlanMutation = useCreatePlanFromCharacter();

  const allCharacters = useMemo(() => {
    if (!accountsData) return [];
    const accountChars = accountsData.accounts.flatMap((acc) => acc.characters);
    return [...accountChars, ...accountsData.unassigned_characters];
  }, [accountsData]);

  const groups = characterSkills?.groups ?? [];

  const handleCharacterChange = (value: string) => {
    const id = value ? Number(value) : null;
    setCharacterId(id);
    setIncludedGroupIds(new Set());
    setHasUserChangedGroups(false);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setCharacterId(null);
      setPlanName('');
      setDescription('');
      setIncludedGroupIds(new Set());
      setHasUserChangedGroups(false);
    }
    onOpenChange(next);
  };

  const handleGroupToggle = (groupId: number, checked: boolean) => {
    setIncludedGroupIds((prev) => {
      const base = hasUserChangedGroups ? prev : defaultGroupIds;
      const next = new Set(base);
      if (checked) {
        next.add(groupId);
      } else {
        next.delete(groupId);
      }
      return next;
    });
    setHasUserChangedGroups(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !characterId ||
      !planName.trim() ||
      effectiveIncludedGroupIds.size === 0
    ) {
      return;
    }

    try {
      const planId = await createPlanMutation.mutateAsync({
        characterId,
        planName: planName.trim(),
        description: description.trim() || null,
        includedGroupIds: Array.from(effectiveIncludedGroupIds),
      });
      handleOpenChange(false);
      if (onSuccess) {
        onSuccess(planId);
      }
    } catch (err) {
      console.error('Failed to create plan from character:', err);
    }
  };

  const canCreate =
    characterId !== null &&
    planName.trim().length > 0 &&
    effectiveIncludedGroupIds.size > 0;

  const showGroupSection = characterId !== null && groups.length > 0;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] flex flex-col overflow-hidden">
        <form onSubmit={handleSubmit} className="contents">
          <DialogHeader>
            <DialogTitle>Create Plan from Character</DialogTitle>
            <DialogDescription>
              Create a skill plan from an existing character&apos;s skills.
              Select groups to include; uncheck groups to exclude. Prerequisites
              are always included.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-y-auto space-y-4 pr-1">
            <div className="space-y-2">
              <Label htmlFor="character">Character</Label>
              <Select
                value={characterId !== null ? String(characterId) : ''}
                onValueChange={handleCharacterChange}
              >
                <SelectTrigger id="character" className="w-full">
                  <SelectValue placeholder="Select a character" />
                </SelectTrigger>
                <SelectContent>
                  {allCharacters.map((char) => (
                    <SelectItem
                      key={char.character_id}
                      value={String(char.character_id)}
                    >
                      {char.character_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="plan-name">Plan Name</Label>
              <Input
                id="plan-name"
                value={planName}
                onChange={(e) => setPlanName(e.target.value)}
                placeholder="Enter plan name"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description (optional)</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Enter plan description"
                rows={2}
              />
            </div>
            {showGroupSection && (
              <div className="space-y-2">
                <Label>Skill Groups</Label>
                <div className="max-h-48 overflow-y-auto rounded-md border p-2">
                  <div className="space-y-2">
                    {groups.map((group) => (
                      <div
                        key={group.group_id}
                        className="flex items-center space-x-2"
                      >
                        <Checkbox
                          id={`group-${group.group_id}`}
                          checked={effectiveIncludedGroupIds.has(
                            group.group_id
                          )}
                          onCheckedChange={(checked) =>
                            handleGroupToggle(group.group_id, checked === true)
                          }
                        />
                        <label
                          htmlFor={`group-${group.group_id}`}
                          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                        >
                          {group.group_name}
                        </label>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
            {characterId !== null &&
              effectiveIncludedGroupIds.size > 0 &&
              match([isPreviewFetching, preview] as const)
                .with([true, P._], () => (
                  <div className="rounded-md border p-3 bg-muted/30 space-y-2">
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-4 w-full" />
                  </div>
                ))
                .with([false, P.not(P.nullish)], ([, p]) => (
                  <div className="rounded-md border p-3 bg-muted/30 text-sm space-y-1">
                    <div className="font-medium">
                      This will add {p.skill_count} skills (
                      {formatSkillpoints(p.estimated_sp)})
                    </div>
                    {p.groups.length > 0 && (
                      <div className="text-muted-foreground break-words">
                        {p.groups
                          .map((g) => `${g.group_name}: ${g.skill_count}`)
                          .join(', ')}
                      </div>
                    )}
                  </div>
                ))
                .with([false, P.nullish], () => null)
                .exhaustive()}
          </div>
          {createPlanMutation.isError && (
            <p className="shrink-0 text-sm text-destructive">
              {createPlanMutation.error instanceof Error
                ? createPlanMutation.error.message
                : 'Failed to create plan'}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!canCreate || createPlanMutation.isPending}
            >
              {createPlanMutation.isPending ? 'Creating...' : 'Create Plan'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
