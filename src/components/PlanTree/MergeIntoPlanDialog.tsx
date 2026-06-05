import { closestCenter, DndContext, DragOverlay } from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import {
  Check,
  FileText,
  Folder,
  FolderOpen,
  GripVertical,
} from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';

import {
  DndTreeView,
  type RenderItemParams,
  type TreeNode,
} from '@/components/DndTreeView';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { usePlanGroups } from '@/hooks/tauri/usePlanGroups';
import { useMergePlansInto, useSkillPlans } from '@/hooks/tauri/useSkillPlans';
import { useSortableList } from '@/hooks/useSortableList';
import { assemblePlanTree, type PlanTreeNode } from '@/lib/planTree';
import { groupNodeId, planNodeId } from '@/lib/planTreeDnd';

import { SortableSourceRow } from './SortableSourceRow';

interface MergeIntoPlanDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetPlanId: number;
  targetName: string;
}

export function MergeIntoPlanDialog({
  open,
  onOpenChange,
  targetPlanId,
  targetName,
}: MergeIntoPlanDialogProps) {
  const { data: plans } = useSkillPlans();
  const { data: groups } = usePlanGroups();
  const mergeInto = useMergePlansInto();

  // Ordered list of incoming plan ids — the source of truth for both
  // membership and merge order. The target is never in this list.
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  const planNameById = useMemo(() => {
    const map = new Map<number, string>();
    for (const p of plans ?? []) map.set(p.plan_id, p.name);
    return map;
  }, [plans]);

  const resetState = () => {
    setSelectedIds([]);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) resetState();
    onOpenChange(next);
  };

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const toggle = useCallback(
    (planId: number) => {
      // The target can never be an incoming source.
      if (planId === targetPlanId) return;
      setSelectedIds((prev) =>
        prev.includes(planId)
          ? prev.filter((id) => id !== planId)
          : [...prev, planId]
      );
    },
    [targetPlanId]
  );

  const tree = useMemo(
    () => assemblePlanTree(groups ?? [], plans ?? []),
    [groups, plans]
  );

  // Build the selectable tree, excluding the target plan itself. Groups left
  // empty by that exclusion are dropped so the picker stays tidy.
  const treeData: TreeNode[] = useMemo(() => {
    const build = (node: PlanTreeNode): TreeNode | null => {
      if (node.kind === 'group') {
        const children = node.children
          .map(build)
          .filter((c): c is TreeNode => c !== null);
        if (!children.length) return null;
        return {
          id: groupNodeId(node.id),
          name: node.name,
          icon: Folder,
          openIcon: FolderOpen,
          draggable: false,
          droppable: false,
          children,
        } satisfies TreeNode;
      }
      if (node.id === targetPlanId) return null;
      return {
        id: planNodeId(node.id),
        name: node.name,
        icon: FileText,
        draggable: false,
        droppable: false,
        onClick: () => toggle(node.id),
      } satisfies TreeNode;
    };
    return tree.map(build).filter((n): n is TreeNode => n !== null);
  }, [tree, toggle, targetPlanId]);

  const renderItem = ({ item }: RenderItemParams) => {
    const isPlan = item.id.startsWith('plan:');
    const planId = isPlan ? Number(item.id.split(':')[1]) : null;
    const checked = planId != null && selectedSet.has(planId);
    return (
      <span className="flex-1 flex items-center justify-between gap-2 min-w-0">
        <span className="truncate">{item.name}</span>
        {checked && <Check className="size-4 shrink-0 text-primary" />}
      </span>
    );
  };

  const { localItems, sensors, activeItem, handleDragStart, handleDragEnd } =
    useSortableList<number>({
      items: selectedIds,
      onReorder: setSelectedIds,
      getId: (id) => id,
    });

  const canMerge = selectedIds.length >= 1;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canMerge) return;
    try {
      const result = await mergeInto.mutateAsync({
        targetPlanId,
        sourcePlanIds: selectedIds,
      });
      if (result.added_count === 0) {
        toast.info('Nothing added — all skills already planned.');
      } else {
        toast.success(
          `Added ${result.added_count} skill${
            result.added_count === 1 ? '' : 's'
          } to ${targetName}.`
        );
      }
      handleOpenChange(false);
    } catch (err) {
      console.error('Failed to merge plans:', err);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Merge into this plan</DialogTitle>
            <DialogDescription>
              Append one or more plans onto <strong>{targetName}</strong>. Its
              existing skills stay first and unchanged; overlapping skills are
              skipped.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Plans to merge in</Label>
                <ScrollArea className="h-56 rounded-md border p-1">
                  {treeData.length ? (
                    <DndTreeView
                      data={treeData}
                      renderItem={renderItem}
                      defaultExpanded="all"
                    />
                  ) : (
                    <p className="p-3 text-sm text-muted-foreground">
                      No other plans to merge in.
                    </p>
                  )}
                </ScrollArea>
              </div>

              <div className="space-y-2">
                <Label>Merge Order</Label>
                <ScrollArea className="h-56 rounded-md border p-1">
                  <div className="space-y-1">
                    {/* Target is pinned as the fixed first block. */}
                    <div className="flex items-center gap-2 rounded-md border border-primary/40 bg-muted/40 px-2 py-1.5 text-sm">
                      <FileText className="size-4 shrink-0 text-muted-foreground" />
                      <span className="flex-1 truncate font-medium">
                        {targetName}
                      </span>
                    </div>
                    {selectedIds.length ? (
                      <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragStart={handleDragStart}
                        onDragEnd={handleDragEnd}
                      >
                        <SortableContext
                          items={localItems}
                          strategy={verticalListSortingStrategy}
                        >
                          <div className="space-y-1">
                            {localItems.map((id) => (
                              <SortableSourceRow
                                key={id}
                                id={id}
                                name={planNameById.get(id) ?? `Plan ${id}`}
                                onRemove={() => toggle(id)}
                              />
                            ))}
                          </div>
                        </SortableContext>
                        {createPortal(
                          <DragOverlay dropAnimation={null}>
                            {activeItem != null ? (
                              <div className="flex items-center gap-2 rounded-md border bg-background px-2 py-1.5 text-sm shadow-md">
                                <GripVertical className="size-4 text-muted-foreground" />
                                <span className="truncate">
                                  {planNameById.get(activeItem) ??
                                    `Plan ${activeItem}`}
                                </span>
                              </div>
                            ) : null}
                          </DragOverlay>,
                          document.body
                        )}
                      </DndContext>
                    ) : (
                      <p className="p-3 text-sm text-muted-foreground">
                        Select one or more plans to merge in.
                      </p>
                    )}
                  </div>
                </ScrollArea>
              </div>
            </div>

            {mergeInto.isError && (
              <p className="text-sm text-destructive">
                {mergeInto.error instanceof Error
                  ? mergeInto.error.message
                  : 'Failed to merge plans'}
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
            <Button type="submit" disabled={!canMerge || mergeInto.isPending}>
              {mergeInto.isPending ? 'Merging…' : 'Merge'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
