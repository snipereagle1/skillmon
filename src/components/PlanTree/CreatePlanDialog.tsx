import { useMemo, useState } from 'react';

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
import type { PlanGroup } from '@/generated/types';
import { usePlanGroups } from '@/hooks/tauri/usePlanGroups';
import { useCreateSkillPlan } from '@/hooks/tauri/useSkillPlans';

const ROOT_VALUE = '__root__';

interface CreatePlanDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialGroupId?: number | null;
  onSuccess?: (planId: number) => void;
}

interface FolderOption {
  groupId: number;
  label: string;
}

function buildFolderOptions(groups: PlanGroup[]): FolderOption[] {
  const childrenByParent = new Map<number | null, PlanGroup[]>();
  for (const g of groups) {
    const key = g.parent_group_id ?? null;
    const arr = childrenByParent.get(key) ?? [];
    arr.push(g);
    childrenByParent.set(key, arr);
  }
  for (const arr of childrenByParent.values()) {
    arr.sort((a, b) =>
      a.sort_order !== b.sort_order
        ? a.sort_order - b.sort_order
        : a.group_id - b.group_id
    );
  }

  const out: FolderOption[] = [];
  const walk = (parentId: number | null, depth: number) => {
    for (const g of childrenByParent.get(parentId) ?? []) {
      out.push({
        groupId: g.group_id,
        label: `${'  '.repeat(depth)}${g.name}`,
      });
      walk(g.group_id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

export function CreatePlanDialog({
  open,
  onOpenChange,
  initialGroupId = null,
  onSuccess,
}: CreatePlanDialogProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [folderValue, setFolderValue] = useState<string>(
    initialGroupId == null ? ROOT_VALUE : String(initialGroupId)
  );
  const { data: groups } = usePlanGroups();
  const createPlanMutation = useCreateSkillPlan();

  const options = useMemo(() => buildFolderOptions(groups ?? []), [groups]);

  // Seed the folder selection from the folder the create was launched from each
  // time the dialog transitions to open — done during render (not an effect) per
  // React's "adjust state when a prop changes" guidance.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setFolderValue(
        initialGroupId == null ? ROOT_VALUE : String(initialGroupId)
      );
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    try {
      const planId = await createPlanMutation.mutateAsync({
        name: name.trim(),
        description: description.trim() || undefined,
        groupId: folderValue === ROOT_VALUE ? null : Number(folderValue),
      });
      setName('');
      setDescription('');
      onOpenChange(false);
      if (onSuccess) {
        onSuccess(planId);
      }
    } catch (err) {
      console.error('Failed to create plan:', err);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Create Skill Plan</DialogTitle>
            <DialogDescription>
              Create a new skill plan to organize your training goals.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Plan Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter plan name"
                autoFocus
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
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="plan-folder">Folder</Label>
              <Select value={folderValue} onValueChange={setFolderValue}>
                <SelectTrigger id="plan-folder">
                  <SelectValue placeholder="Choose a folder" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ROOT_VALUE}>Root</SelectItem>
                  {options.map((opt) => (
                    <SelectItem key={opt.groupId} value={String(opt.groupId)}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {createPlanMutation.isError && (
              <p className="text-sm text-destructive">
                {createPlanMutation.error instanceof Error
                  ? createPlanMutation.error.message
                  : 'Failed to create plan'}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!name.trim() || createPlanMutation.isPending}
            >
              {createPlanMutation.isPending ? 'Creating…' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
