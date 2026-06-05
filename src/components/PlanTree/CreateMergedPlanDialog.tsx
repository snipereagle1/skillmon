import { closestCenter, DndContext, DragOverlay } from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Check,
  FileText,
  Folder,
  FolderOpen,
  GripVertical,
  X,
} from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { usePlanGroups } from '@/hooks/tauri/usePlanGroups';
import {
  useCreateMergedSkillPlan,
  useSkillPlans,
} from '@/hooks/tauri/useSkillPlans';
import { useSortableList } from '@/hooks/useSortableList';
import { assemblePlanTree, type PlanTreeNode } from '@/lib/planTree';
import { groupNodeId, planNodeId } from '@/lib/planTreeDnd';
import { cn } from '@/lib/utils';

interface CreateMergedPlanDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (planId: number) => void;
}

export function CreateMergedPlanDialog({
  open,
  onOpenChange,
  onSuccess,
}: CreateMergedPlanDialogProps) {
  const { data: plans } = useSkillPlans();
  const { data: groups } = usePlanGroups();
  const createMerged = useCreateMergedSkillPlan();

  // Ordered list of selected source plan ids — the source of truth for both
  // membership and merge order.
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  // `name` holds the user's manual edit once `nameDirty` is set; until then the
  // displayed name is derived from the selection (prefill).
  const [name, setName] = useState('');
  const [nameDirty, setNameDirty] = useState(false);
  const [description, setDescription] = useState('');

  const planNameById = useMemo(() => {
    const map = new Map<number, string>();
    for (const p of plans ?? []) map.set(p.plan_id, p.name);
    return map;
  }, [plans]);

  // Name prefilled from the selected plans; superseded once the user edits.
  const prefillName = useMemo(() => {
    const names = selectedIds
      .map((id) => planNameById.get(id))
      .filter((n): n is string => !!n);
    return names.length ? `Merge: ${names.join(' + ')}` : '';
  }, [selectedIds, planNameById]);
  const effectiveName = nameDirty ? name : prefillName;

  const resetState = () => {
    setSelectedIds([]);
    setName('');
    setNameDirty(false);
    setDescription('');
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) resetState();
    onOpenChange(next);
  };

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const toggle = useCallback((planId: number) => {
    setSelectedIds((prev) =>
      prev.includes(planId)
        ? prev.filter((id) => id !== planId)
        : [...prev, planId]
    );
  }, []);

  const tree = useMemo(
    () => assemblePlanTree(groups ?? [], plans ?? []),
    [groups, plans]
  );

  const treeData: TreeNode[] = useMemo(() => {
    const build = (node: PlanTreeNode): TreeNode => {
      if (node.kind === 'group') {
        return {
          id: groupNodeId(node.id),
          name: node.name,
          icon: Folder,
          openIcon: FolderOpen,
          draggable: false,
          droppable: false,
          children: node.children.map(build),
        } satisfies TreeNode;
      }
      return {
        id: planNodeId(node.id),
        name: node.name,
        icon: FileText,
        draggable: false,
        droppable: false,
        onClick: () => toggle(node.id),
      } satisfies TreeNode;
    };
    return tree.map(build);
  }, [tree, toggle]);

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

  const canCreate = effectiveName.trim().length > 0 && selectedIds.length >= 2;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canCreate) return;
    try {
      const planId = await createMerged.mutateAsync({
        name: effectiveName.trim(),
        description: description.trim() || undefined,
        sourcePlanIds: selectedIds,
      });
      handleOpenChange(false);
      onSuccess?.(planId);
    } catch (err) {
      console.error('Failed to create merged plan:', err);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Create Merged Plan</DialogTitle>
            <DialogDescription>
              Combine several plans into a new one. Overlapping skills are kept
              once, in the order the sources are arranged.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="merged-name">Plan Name</Label>
              <Input
                id="merged-name"
                value={effectiveName}
                onChange={(e) => {
                  setName(e.target.value);
                  setNameDirty(true);
                }}
                placeholder="Enter plan name"
                autoFocus
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="merged-description">Description (optional)</Label>
              <Textarea
                id="merged-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Enter plan description"
                rows={2}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Source Plans</Label>
                <ScrollArea className="h-56 rounded-md border p-1">
                  {treeData.length ? (
                    <DndTreeView
                      data={treeData}
                      renderItem={renderItem}
                      defaultExpanded="all"
                    />
                  ) : (
                    <p className="p-3 text-sm text-muted-foreground">
                      No plans to merge.
                    </p>
                  )}
                </ScrollArea>
              </div>

              <div className="space-y-2">
                <Label>Merge Order</Label>
                <ScrollArea className="h-56 rounded-md border p-1">
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
                      Select two or more plans to merge.
                    </p>
                  )}
                </ScrollArea>
              </div>
            </div>

            {createMerged.isError && (
              <p className="text-sm text-destructive">
                {createMerged.error instanceof Error
                  ? createMerged.error.message
                  : 'Failed to create merged plan'}
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
              disabled={!canCreate || createMerged.isPending}
            >
              {createMerged.isPending ? 'Creating…' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface SortableSourceRowProps {
  id: number;
  name: string;
  onRemove: () => void;
}

function SortableSourceRow({ id, name, onRemove }: SortableSourceRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.3 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'group flex items-center gap-1 rounded-md border bg-background px-2 py-1.5 text-sm'
      )}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing text-muted-foreground/60 hover:text-muted-foreground"
        aria-label="Reorder"
      >
        <GripVertical className="size-4" />
      </button>
      <span className="flex-1 truncate">{name}</span>
      <button
        type="button"
        onClick={onRemove}
        className="text-muted-foreground/60 hover:text-destructive"
        aria-label="Remove"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
