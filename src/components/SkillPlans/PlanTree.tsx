import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { ChevronDown, FolderPlus, Pencil } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { NodeKind } from '@/generated/types';
import { useMoveNode, usePlanGroups } from '@/hooks/tauri/usePlanGroups';
import { useDeleteSkillPlan, useSkillPlans } from '@/hooks/tauri/useSkillPlans';
import { assemblePlanTree, type PlanTreeNode } from '@/lib/planTree';
import { cn } from '@/lib/utils';

import { CreatePlanDialog } from './CreatePlanDialog';
import { CreatePlanFromCharacterDialog } from './CreatePlanFromCharacterDialog';
import { CreatePlanGroupDialog } from './CreatePlanGroupDialog';
import { DeletePlanDialog } from './DeletePlanDialog';
import { RenamePlanGroupDialog } from './RenamePlanGroupDialog';

type FlatRow = {
  node: PlanTreeNode;
  depth: number;
  parentGroupId: number | null;
  siblingIndex: number;
};

function flatten(
  nodes: PlanTreeNode[],
  depth: number,
  parentGroupId: number | null,
  out: FlatRow[]
) {
  nodes.forEach((node, siblingIndex) => {
    out.push({ node, depth, parentGroupId, siblingIndex });
    if (node.kind === 'group') {
      flatten(node.children, depth + 1, node.id, out);
    }
  });
}

function dragId(kind: NodeKind, id: number) {
  return `drag:${kind}:${id}`;
}
function gapId(parentGroupId: number | null, index: number) {
  return `gap:${parentGroupId ?? 'root'}:${index}`;
}
function rowDropId(kind: NodeKind, id: number) {
  return `row:${kind}:${id}`;
}

interface DragData {
  kind: NodeKind;
  id: number;
  parentGroupId: number | null;
  siblingIndex: number;
}
interface GapDropData {
  type: 'gap';
  parentGroupId: number | null;
  index: number;
}
interface RowDropData {
  type: 'row';
  kind: NodeKind;
  id: number;
}

interface PlanRowProps {
  node: Extract<PlanTreeNode, { kind: 'plan' }>;
  selectedPlanId: number | null;
  onDelete?: (planId: number, planName: string) => void;
  onPlanClick?: (planId: number) => void;
  isDeleting: boolean;
  depth: number;
  dragData: DragData;
}

function PlanRow({
  node,
  selectedPlanId,
  onDelete,
  onPlanClick,
  isDeleting,
  depth,
  dragData,
}: PlanRowProps) {
  const isSelected = selectedPlanId === node.id;
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: dragId(NodeKind.Plan, node.id),
    data: dragData,
  });
  const body = (
    <div className="flex-1 min-w-0">
      <h3 className="h-card truncate">{node.name}</h3>
      {node.description && (
        <p
          className={cn(
            'text-sm mt-1 line-clamp-2',
            isSelected ? 'text-foreground/80' : 'text-muted-foreground'
          )}
        >
          {node.description}
        </p>
      )}
    </div>
  );

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'relative flex items-center rounded-md transition-colors',
        isSelected ? 'bg-muted text-foreground' : 'hover:bg-muted',
        isDragging && 'opacity-50'
      )}
      style={{ paddingLeft: depth * 12 }}
      {...attributes}
      {...listeners}
    >
      {onPlanClick ? (
        <button
          type="button"
          onClick={() => onPlanClick(node.id)}
          className="flex-1 block p-3 min-w-0 text-left"
        >
          {body}
        </button>
      ) : (
        <Link
          to="/plans/$planId"
          params={{ planId: String(node.id) }}
          className="flex-1 block p-3 min-w-0"
        >
          {body}
        </Link>
      )}
      {onDelete && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onDelete(node.id, node.name)}
          disabled={isDeleting}
          className={cn(
            'absolute right-2 top-3 shrink-0 size-6 p-0 hover:bg-destructive hover:text-destructive-foreground',
            isSelected && 'text-foreground/60'
          )}
        >
          ×
        </Button>
      )}
    </div>
  );
}

interface GroupRowProps {
  node: Extract<PlanTreeNode, { kind: 'group' }>;
  depth: number;
  onRenameGroup?: (groupId: number, currentName: string) => void;
  dragData: DragData;
}

function GroupRow({ node, depth, onRenameGroup, dragData }: GroupRowProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: dragId(NodeKind.Group, node.id),
    data: dragData,
  });
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: rowDropId(NodeKind.Group, node.id),
    data: {
      type: 'row',
      kind: NodeKind.Group,
      id: node.id,
    } satisfies RowDropData,
  });

  return (
    <div
      ref={(el) => {
        setNodeRef(el);
        setDropRef(el);
      }}
      className={cn(
        'group flex items-center gap-1 p-2 text-sm font-medium text-muted-foreground rounded-md',
        isOver && 'ring-2 ring-primary bg-primary/10',
        isDragging && 'opacity-50'
      )}
      style={{ paddingLeft: depth * 12 }}
      {...attributes}
      {...listeners}
    >
      <span className="flex-1 truncate">{node.name}</span>
      {onRenameGroup && (
        <Button
          variant="ghost"
          size="sm"
          className="size-6 p-0 opacity-0 group-hover:opacity-100 focus:opacity-100"
          onClick={(e) => {
            e.stopPropagation();
            onRenameGroup(node.id, node.name);
          }}
          aria-label={`Rename folder ${node.name}`}
        >
          <Pencil className="size-3.5" />
        </Button>
      )}
    </div>
  );
}

interface GapProps {
  parentGroupId: number | null;
  index: number;
  depth: number;
}

function Gap({ parentGroupId, index, depth }: GapProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: gapId(parentGroupId, index),
    data: {
      type: 'gap',
      parentGroupId,
      index,
    } satisfies GapDropData,
  });
  return (
    <div
      ref={setNodeRef}
      style={{ paddingLeft: depth * 12 }}
      className={cn(
        'h-1 rounded-full transition-colors',
        isOver && 'h-2 bg-primary'
      )}
    />
  );
}

interface PlanTreeProps {
  selectedPlanId?: number | null;
  onPlanClick?: (planId: number) => void;
  showActions?: boolean;
}

export function PlanTree({
  selectedPlanId: selectedPlanIdProp,
  onPlanClick,
  showActions = true,
}: PlanTreeProps = {}) {
  const params = useParams({ strict: false });
  const navigate = useNavigate();
  const urlPlanId = params.planId ? Number(params.planId) : null;
  const selectedPlanId =
    selectedPlanIdProp !== undefined ? selectedPlanIdProp : urlPlanId;
  const {
    data: plans,
    isLoading: plansLoading,
    error: plansError,
  } = useSkillPlans();
  const { data: groups, isLoading: groupsLoading } = usePlanGroups();
  const deletePlanMutation = useDeleteSkillPlan();
  const moveNodeMutation = useMoveNode();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createFromCharacterDialogOpen, setCreateFromCharacterDialogOpen] =
    useState(false);
  const [createGroupDialogOpen, setCreateGroupDialogOpen] = useState(false);
  const [renameGroupDialogOpen, setRenameGroupDialogOpen] = useState(false);
  const [groupToRename, setGroupToRename] = useState<{
    id: number;
    name: string;
  } | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [planToDelete, setPlanToDelete] = useState<{
    id: number;
    name: string;
  } | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  const tree = useMemo(
    () => assemblePlanTree(groups ?? [], plans ?? []),
    [groups, plans]
  );

  const flat = useMemo(() => {
    const out: FlatRow[] = [];
    flatten(tree, 0, null, out);
    return out;
  }, [tree]);

  // Count direct children of a folder (groups + plans), for "drop on folder = append".
  const childCounts = useMemo(() => {
    const counts = new Map<number, number>();
    for (const g of groups ?? []) {
      if (g.parent_group_id != null) {
        counts.set(g.parent_group_id, (counts.get(g.parent_group_id) ?? 0) + 1);
      }
    }
    for (const p of plans ?? []) {
      if (p.group_id != null) {
        counts.set(p.group_id, (counts.get(p.group_id) ?? 0) + 1);
      }
    }
    return counts;
  }, [groups, plans]);

  const handleDeleteClick = (planId: number, planName: string) => {
    setPlanToDelete({ id: planId, name: planName });
    setDeleteDialogOpen(true);
  };

  const handleRenameGroup = (groupId: number, currentName: string) => {
    setGroupToRename({ id: groupId, name: currentName });
    setRenameGroupDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!planToDelete) return;
    try {
      await deletePlanMutation.mutateAsync({ planId: planToDelete.id });
      if (selectedPlanId === planToDelete.id) {
        navigate({ to: '/plans' });
      }
      setDeleteDialogOpen(false);
      setPlanToDelete(null);
    } catch (err) {
      console.error('Failed to delete plan:', err);
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;

    const drag = active.data.current as DragData | undefined;
    const drop = over.data.current as GapDropData | RowDropData | undefined;
    if (!drag || !drop) return;

    let newParent: number | null;
    let newSortOrder: number;

    if (drop.type === 'row') {
      // Drop onto a folder row → nest as last child.
      if (drop.kind !== NodeKind.Group) return;
      newParent = drop.id;
      // Append at end of new parent's children. If moving within same parent,
      // the moved item is already counted; otherwise it isn't yet.
      const existing = childCounts.get(drop.id) ?? 0;
      newSortOrder =
        drag.parentGroupId === drop.id ? Math.max(0, existing - 1) : existing;
    } else {
      // Drop into a gap → sibling at that index inside drop.parentGroupId.
      newParent = drop.parentGroupId;
      let target = drop.index;
      // Within the same parent, removing the dragged row from above the gap
      // shifts the target index down by one.
      if (
        drag.parentGroupId === drop.parentGroupId &&
        drag.siblingIndex < target
      ) {
        target -= 1;
      }
      newSortOrder = target;
    }

    // No-op: dropping where it already sits.
    if (
      drag.parentGroupId === newParent &&
      drag.siblingIndex === newSortOrder
    ) {
      return;
    }

    try {
      await moveNodeMutation.mutateAsync({
        kind: drag.kind,
        id: drag.id,
        new_parent_group_id: newParent ?? undefined,
        new_sort_order: newSortOrder,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  };

  if (plansLoading || groupsLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Loading plans...</p>
      </div>
    );
  }

  if (plansError) {
    return (
      <div className="flex items-center justify-center h-full p-4">
        <p className="text-sm text-destructive">
          Error:{' '}
          {plansError instanceof Error
            ? plansError.message
            : 'Failed to load plans'}
        </p>
      </div>
    );
  }

  // Render the flat list with gaps between siblings of the same parent.
  const renderedRows: React.ReactNode[] = [];
  for (let i = 0; i < flat.length; i++) {
    const row = flat[i];
    // Insert a gap before this row whenever the previous visible row was a
    // sibling (same parent) — and always before the first sibling of a parent.
    const prev = flat[i - 1];
    const isFirstSibling =
      !prev ||
      prev.parentGroupId !== row.parentGroupId ||
      prev.depth !== row.depth;
    if (isFirstSibling) {
      renderedRows.push(
        <Gap
          key={`gap-${row.parentGroupId ?? 'root'}-${row.siblingIndex}-pre`}
          parentGroupId={row.parentGroupId}
          index={row.siblingIndex}
          depth={row.depth}
        />
      );
    }

    if (row.node.kind === 'plan') {
      renderedRows.push(
        <PlanRow
          key={`plan-${row.node.id}`}
          node={row.node}
          selectedPlanId={selectedPlanId}
          onDelete={showActions ? handleDeleteClick : undefined}
          onPlanClick={onPlanClick}
          isDeleting={deletePlanMutation.isPending}
          depth={row.depth}
          dragData={{
            kind: NodeKind.Plan,
            id: row.node.id,
            parentGroupId: row.parentGroupId,
            siblingIndex: row.siblingIndex,
          }}
        />
      );
    } else {
      renderedRows.push(
        <GroupRow
          key={`group-${row.node.id}`}
          node={row.node}
          depth={row.depth}
          onRenameGroup={showActions ? handleRenameGroup : undefined}
          dragData={{
            kind: NodeKind.Group,
            id: row.node.id,
            parentGroupId: row.parentGroupId,
            siblingIndex: row.siblingIndex,
          }}
        />
      );
    }

    // Trailing gap after the last sibling of this parent.
    const next = flat[i + 1];
    const isLastSibling =
      !next ||
      next.parentGroupId !== row.parentGroupId ||
      next.depth !== row.depth;
    if (isLastSibling) {
      renderedRows.push(
        <Gap
          key={`gap-${row.parentGroupId ?? 'root'}-${row.siblingIndex + 1}-post`}
          parentGroupId={row.parentGroupId}
          index={row.siblingIndex + 1}
          depth={row.depth}
        />
      );
    }
  }

  return (
    <>
      {showActions && (
        <div className="p-4 border-b border-border">
          <div className="flex w-full">
            <Button
              onClick={() => setCreateDialogOpen(true)}
              className="flex-1 rounded-r-none"
            >
              Create Plan
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="default"
                  size="default"
                  className="rounded-l-none border-l px-2"
                >
                  <ChevronDown className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => setCreateFromCharacterDialogOpen(true)}
                >
                  Create Plan from Character
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setCreateGroupDialogOpen(true)}
                >
                  <FolderPlus className="size-4 mr-2" />
                  Create Folder
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      )}
      <div className="flex-1 overflow-y-auto">
        {flat.length === 0 ? (
          <div className="flex items-center justify-center h-full p-4">
            <p className="text-sm text-muted-foreground text-center">
              No plans yet. Create your first plan to get started.
            </p>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <div className="p-2">{renderedRows}</div>
          </DndContext>
        )}
      </div>
      <CreatePlanDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onSuccess={(planId) => {
          setCreateDialogOpen(false);
          navigate({
            to: '/plans/$planId',
            params: { planId: String(planId) },
          });
        }}
      />
      <CreatePlanFromCharacterDialog
        open={createFromCharacterDialogOpen}
        onOpenChange={setCreateFromCharacterDialogOpen}
        onSuccess={(planId) => {
          setCreateFromCharacterDialogOpen(false);
          navigate({
            to: '/plans/$planId',
            params: { planId: String(planId) },
          });
        }}
      />
      <DeletePlanDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        planName={planToDelete?.name}
        onConfirm={handleDeleteConfirm}
        isDeleting={deletePlanMutation.isPending}
      />
      <CreatePlanGroupDialog
        open={createGroupDialogOpen}
        onOpenChange={setCreateGroupDialogOpen}
      />
      <RenamePlanGroupDialog
        open={renameGroupDialogOpen}
        onOpenChange={(open) => {
          setRenameGroupDialogOpen(open);
          if (!open) setGroupToRename(null);
        }}
        groupId={groupToRename?.id ?? null}
        currentName={groupToRename?.name ?? ''}
      />
    </>
  );
}
