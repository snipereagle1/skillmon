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
import type { PlanGroup } from '@/generated/types';
import { useCreatePlanGroup, usePlanGroups } from '@/hooks/tauri/usePlanGroups';

const MAX_DEPTH = 2;
const ROOT_VALUE = '__root__';

interface CreatePlanGroupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialParentGroupId?: number | null;
  onSuccess?: (groupId: number) => void;
}

interface OptionRow {
  groupId: number;
  label: string;
  depth: number;
  disabled: boolean;
}

function buildParentOptions(groups: PlanGroup[]): OptionRow[] {
  const depthByGroupId = new Map<number, number>();
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

  const out: OptionRow[] = [];
  const walk = (parentId: number | null, depth: number) => {
    const children = childrenByParent.get(parentId) ?? [];
    for (const g of children) {
      depthByGroupId.set(g.group_id, depth);
      out.push({
        groupId: g.group_id,
        label: `${'  '.repeat(depth)}${g.name}`,
        depth,
        disabled: depth >= MAX_DEPTH,
      });
      walk(g.group_id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

export function CreatePlanGroupDialog({
  open,
  onOpenChange,
  initialParentGroupId = null,
  onSuccess,
}: CreatePlanGroupDialogProps) {
  const [name, setName] = useState('');
  const [parentValue, setParentValue] = useState<string>(
    initialParentGroupId == null ? ROOT_VALUE : String(initialParentGroupId)
  );
  const { data: groups } = usePlanGroups();
  const createMutation = useCreatePlanGroup();

  const options = useMemo(() => buildParentOptions(groups ?? []), [groups]);

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setName('');
      setParentValue(
        initialParentGroupId == null ? ROOT_VALUE : String(initialParentGroupId)
      );
      createMutation.reset();
    }
    onOpenChange(next);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    const parentGroupId =
      parentValue === ROOT_VALUE ? null : Number(parentValue);
    try {
      const groupId = await createMutation.mutateAsync({
        name: trimmed,
        parentGroupId,
      });
      handleOpenChange(false);
      onSuccess?.(groupId);
    } catch (err) {
      console.error('Failed to create folder:', err);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Create Folder</DialogTitle>
            <DialogDescription>
              Folders organise plans into a tree (up to 3 levels deep).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="folder-name">Name</Label>
              <Input
                id="folder-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter folder name"
                autoFocus
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="folder-parent">Parent</Label>
              <Select value={parentValue} onValueChange={setParentValue}>
                <SelectTrigger id="folder-parent">
                  <SelectValue placeholder="Choose a parent" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ROOT_VALUE}>Root</SelectItem>
                  {options.map((opt) => (
                    <SelectItem
                      key={opt.groupId}
                      value={String(opt.groupId)}
                      disabled={opt.disabled}
                    >
                      {opt.label}
                      {opt.disabled ? ' (max depth)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {createMutation.isError && (
              <p className="text-sm text-destructive">
                {createMutation.error instanceof Error
                  ? createMutation.error.message
                  : String(createMutation.error)}
              </p>
            )}
          </div>
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
              disabled={!name.trim() || createMutation.isPending}
            >
              {createMutation.isPending ? 'Creating...' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
