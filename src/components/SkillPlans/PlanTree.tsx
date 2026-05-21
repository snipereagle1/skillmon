import { useNavigate, useParams } from '@tanstack/react-router';
import {
  ChevronDown,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  Pencil,
} from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';

import {
  DndTreeView,
  type DropTarget,
  type TreeNode,
} from '@/components/DndTreeView';
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

type PlanItem = TreeNode & {
  _planDescription?: string;
};

function planNodeId(id: number) {
  return `plan:${id}`;
}
function groupNodeId(id: number) {
  return `group:${id}`;
}
function parseNodeId(raw: string): { kind: NodeKind; id: number } | null {
  const [kind, idStr] = raw.split(':');
  const id = Number(idStr);
  if (!Number.isFinite(id)) return null;
  if (kind === NodeKind.Plan) return { kind: NodeKind.Plan, id };
  if (kind === NodeKind.Group) return { kind: NodeKind.Group, id };
  return null;
}

interface PlanRowBodyProps {
  name: string;
  description?: string;
  isSelected: boolean;
}
function PlanRowBody({ name, description, isSelected }: PlanRowBodyProps) {
  return (
    <div className="flex-1 min-w-0">
      <h3 className="h-card truncate">{name}</h3>
      {description && (
        <p
          className={cn(
            'text-sm mt-1 line-clamp-2',
            isSelected ? 'text-foreground/80' : 'text-muted-foreground'
          )}
        >
          {description}
        </p>
      )}
    </div>
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

  const tree = useMemo(
    () => assemblePlanTree(groups ?? [], plans ?? []),
    [groups, plans]
  );

  // Resolve a node's parent/sibling-index/childCount from its composite id.
  const nodeIndex = useMemo(() => {
    const parentOf = new Map<string, number | null>();
    const indexOf = new Map<string, number>();
    const childCount = new Map<number | null, number>();
    const walk = (nodes: PlanTreeNode[], parentId: number | null) => {
      childCount.set(parentId, nodes.length);
      nodes.forEach((n, i) => {
        const key = n.kind === 'plan' ? planNodeId(n.id) : groupNodeId(n.id);
        parentOf.set(key, parentId);
        indexOf.set(key, i);
        if (n.kind === 'group') walk(n.children, n.id);
      });
    };
    walk(tree, null);
    return { parentOf, indexOf, childCount };
  }, [tree]);

  const handlePlanClick = useCallback(
    (planId: number) => {
      if (onPlanClick) {
        onPlanClick(planId);
      } else {
        navigate({ to: '/plans/$planId', params: { planId: String(planId) } });
      }
    },
    [onPlanClick, navigate]
  );

  const handleDeleteClick = useCallback((planId: number, planName: string) => {
    setPlanToDelete({ id: planId, name: planName });
    setDeleteDialogOpen(true);
  }, []);

  const handleRenameGroup = useCallback(
    (groupId: number, currentName: string) => {
      setGroupToRename({ id: groupId, name: currentName });
      setRenameGroupDialogOpen(true);
    },
    []
  );

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

  const handleDrop = async (sourceId: string, target: DropTarget) => {
    const source = parseNodeId(sourceId);
    if (!source) return;

    const sourceParentGroupId = nodeIndex.parentOf.get(sourceId) ?? null;
    const sourceIndex = nodeIndex.indexOf.get(sourceId) ?? 0;

    let newParent: number | null;
    let newSortOrder: number;

    if (target.type === 'row') {
      // Drop onto a folder row → nest as last child.
      const parsed = parseNodeId(target.id);
      if (!parsed || parsed.kind !== NodeKind.Group) return;
      newParent = parsed.id;
      const existing = nodeIndex.childCount.get(parsed.id) ?? 0;
      newSortOrder =
        sourceParentGroupId === parsed.id
          ? Math.max(0, existing - 1)
          : existing;
    } else {
      // Drop into a gap → sibling at that index inside target.parentId.
      const targetParent = target.parentId
        ? (parseNodeId(target.parentId)?.id ?? null)
        : null;
      newParent = targetParent;
      let idx = target.index;
      if (sourceParentGroupId === newParent && sourceIndex < idx) {
        idx -= 1;
      }
      newSortOrder = idx;
    }

    if (sourceParentGroupId === newParent && sourceIndex === newSortOrder) {
      return;
    }

    try {
      await moveNodeMutation.mutateAsync({
        kind: source.kind,
        id: source.id,
        new_parent_group_id: newParent ?? undefined,
        new_sort_order: newSortOrder,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  };

  // Prevent dropping a folder into itself or any of its descendants.
  const canDrop = (sourceId: string, target: DropTarget): boolean => {
    const source = parseNodeId(sourceId);
    if (!source || source.kind !== NodeKind.Group) return true;
    const forbiddenParent = source.id;
    const isDescendantOf = (groupId: number): boolean => {
      if (groupId === forbiddenParent) return true;
      const parent = nodeIndex.parentOf.get(groupNodeId(groupId));
      if (parent == null) return false;
      return isDescendantOf(parent);
    };
    if (target.type === 'row') {
      const parsed = parseNodeId(target.id);
      if (!parsed || parsed.kind !== NodeKind.Group) return true;
      return !isDescendantOf(parsed.id);
    }
    const targetParent = target.parentId
      ? (parseNodeId(target.parentId)?.id ?? null)
      : null;
    if (targetParent == null) return true;
    return !isDescendantOf(targetParent);
  };

  const treeData: PlanItem[] = useMemo(() => {
    const build = (node: PlanTreeNode): PlanItem => {
      if (node.kind === 'group') {
        return {
          id: groupNodeId(node.id),
          name: node.name,
          icon: Folder,
          openIcon: FolderOpen,
          draggable: true,
          droppable: true,
          children: node.children.map(build),
          actions: showActions ? (
            <Button
              variant="ghost"
              size="sm"
              className="size-6 p-0"
              onClick={(e) => {
                e.stopPropagation();
                handleRenameGroup(node.id, node.name);
              }}
              aria-label={`Rename folder ${node.name}`}
            >
              <Pencil className="size-3.5" />
            </Button>
          ) : undefined,
        } satisfies PlanItem;
      }
      return {
        id: planNodeId(node.id),
        name: node.name,
        icon: FileText,
        draggable: true,
        droppable: false,
        onClick: () => handlePlanClick(node.id),
        actions: showActions ? (
          <Button
            variant="ghost"
            size="sm"
            disabled={deletePlanMutation.isPending}
            onClick={(e) => {
              e.stopPropagation();
              handleDeleteClick(node.id, node.name);
            }}
            className="size-6 p-0 hover:bg-destructive hover:text-destructive-foreground"
            aria-label={`Delete plan ${node.name}`}
          >
            ×
          </Button>
        ) : undefined,
        _planDescription: node.description,
      } satisfies PlanItem;
    };
    return tree.map(build);
  }, [
    tree,
    showActions,
    deletePlanMutation.isPending,
    handlePlanClick,
    handleDeleteClick,
    handleRenameGroup,
  ]);

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

  const isEmpty = treeData.length === 0;

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
        {isEmpty ? (
          <div className="flex items-center justify-center h-full p-4">
            <p className="text-sm text-muted-foreground text-center">
              No plans yet. Create your first plan to get started.
            </p>
          </div>
        ) : (
          <DndTreeView
            data={treeData}
            selectedId={
              selectedPlanId != null ? planNodeId(selectedPlanId) : null
            }
            onDrop={handleDrop}
            canDrop={canDrop}
            renderItem={({ item, isLeaf, isSelected }) => {
              const meta = item as PlanItem;
              if (isLeaf) {
                return (
                  <PlanRowBody
                    name={item.name}
                    description={meta._planDescription}
                    isSelected={isSelected}
                  />
                );
              }
              return <span className="truncate">{item.name}</span>;
            }}
          />
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
