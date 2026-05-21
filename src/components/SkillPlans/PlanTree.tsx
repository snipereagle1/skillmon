import { useNavigate, useParams } from '@tanstack/react-router';
import {
  ChevronDown,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  Pencil,
  Trash2,
} from 'lucide-react';
import { useCallback, useMemo } from 'react';
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
import {
  useExpandedPlanGroups,
  usePersistExpandedPlanGroups,
} from '@/hooks/tauri/useExpandedPlanGroups';
import { useMoveNode, usePlanGroups } from '@/hooks/tauri/usePlanGroups';
import { useDeleteSkillPlan, useSkillPlans } from '@/hooks/tauri/useSkillPlans';
import { assemblePlanTree, type PlanTreeNode } from '@/lib/planTree';
import {
  groupNodeId,
  isDropAllowed,
  type NodeIndex,
  parseNodeId,
  planNodeId,
  resolveDropTarget,
} from '@/lib/planTreeDnd';
import { cn } from '@/lib/utils';
import { usePlanTreeDialogStore } from '@/stores/planTreeDialogStore';

import { CreatePlanDialog } from './CreatePlanDialog';
import { CreatePlanFromCharacterDialog } from './CreatePlanFromCharacterDialog';
import { CreatePlanGroupDialog } from './CreatePlanGroupDialog';
import { DeletePlanDialog } from './DeletePlanDialog';
import { DeletePlanGroupDialog } from './DeletePlanGroupDialog';
import { RenamePlanGroupDialog } from './RenamePlanGroupDialog';

type PlanItem = TreeNode & {
  _planDescription?: string;
};

function useExpandedGroupTreeState() {
  const { data: persistedExpanded } = useExpandedPlanGroups();
  const persistExpanded = usePersistExpandedPlanGroups();
  const expanded = useMemo<Set<string>>(
    () => new Set((persistedExpanded ?? []).map(groupNodeId)),
    [persistedExpanded]
  );
  const onExpandedChange = useCallback(
    (next: Set<string>) => {
      const ids: number[] = [];
      for (const key of next) {
        const [kind, idStr] = key.split(':');
        if (kind === 'group') {
          const id = Number(idStr);
          if (Number.isFinite(id)) ids.push(id);
        }
      }
      persistExpanded(ids);
    },
    [persistExpanded]
  );
  return { expanded, onExpandedChange };
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
  const { expanded, onExpandedChange } = useExpandedGroupTreeState();
  const deletePlanMutation = useDeleteSkillPlan();
  const moveNodeMutation = useMoveNode();

  const dialog = usePlanTreeDialogStore((s) => s.dialog);
  const openCreatePlan = usePlanTreeDialogStore((s) => s.openCreatePlan);
  const openCreatePlanFromCharacter = usePlanTreeDialogStore(
    (s) => s.openCreatePlanFromCharacter
  );
  const openCreatePlanGroup = usePlanTreeDialogStore(
    (s) => s.openCreatePlanGroup
  );
  const openRenamePlanGroup = usePlanTreeDialogStore(
    (s) => s.openRenamePlanGroup
  );
  const openDeletePlanGroup = usePlanTreeDialogStore(
    (s) => s.openDeletePlanGroup
  );
  const openDeletePlan = usePlanTreeDialogStore((s) => s.openDeletePlan);
  const closeDialog = usePlanTreeDialogStore((s) => s.close);

  const tree = useMemo(
    () => assemblePlanTree(groups ?? [], plans ?? []),
    [groups, plans]
  );

  // Resolve a node's parent/sibling-index/childCount from its composite id.
  const nodeIndex = useMemo<NodeIndex>(() => {
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

  const handleDeleteConfirm = async () => {
    if (dialog.kind !== 'deletePlan') return;
    const { planId } = dialog;
    try {
      await deletePlanMutation.mutateAsync({ planId });
      if (selectedPlanId === planId) {
        navigate({ to: '/plans' });
      }
      closeDialog();
    } catch (err) {
      console.error('Failed to delete plan:', err);
    }
  };

  const handleDrop = async (sourceId: string, target: DropTarget) => {
    const source = parseNodeId(sourceId);
    const resolved = resolveDropTarget(sourceId, target, nodeIndex);
    if (!source || !resolved) return;
    try {
      await moveNodeMutation.mutateAsync({
        kind: source.kind,
        id: source.id,
        new_parent_group_id: resolved.newParentGroupId ?? undefined,
        new_sort_order: resolved.newSortOrder,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  };

  const canDrop = (sourceId: string, target: DropTarget): boolean =>
    isDropAllowed(sourceId, target, nodeIndex);

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
            <>
              <Button
                variant="ghost"
                size="sm"
                className="size-6 p-0"
                onClick={(e) => {
                  e.stopPropagation();
                  openRenamePlanGroup(node.id, node.name);
                }}
                aria-label={`Rename folder ${node.name}`}
              >
                <Pencil className="size-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="size-6 p-0 hover:bg-destructive hover:text-destructive-foreground"
                onClick={(e) => {
                  e.stopPropagation();
                  openDeletePlanGroup(node.id, node.name);
                }}
                aria-label={`Delete folder ${node.name}`}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </>
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
              openDeletePlan(node.id, node.name);
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
    openRenamePlanGroup,
    openDeletePlanGroup,
    openDeletePlan,
  ]);

  if (plansLoading || groupsLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Loading plans…</p>
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
            <Button onClick={openCreatePlan} className="flex-1 rounded-r-none">
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
                <DropdownMenuItem onClick={openCreatePlanFromCharacter}>
                  Create Plan from Character
                </DropdownMenuItem>
                <DropdownMenuItem onClick={openCreatePlanGroup}>
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
            expanded={expanded}
            onExpandedChange={onExpandedChange}
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
        open={dialog.kind === 'createPlan'}
        onOpenChange={(open) => {
          if (!open) closeDialog();
        }}
        onSuccess={(planId) => {
          closeDialog();
          navigate({
            to: '/plans/$planId',
            params: { planId: String(planId) },
          });
        }}
      />
      <CreatePlanFromCharacterDialog
        open={dialog.kind === 'createPlanFromCharacter'}
        onOpenChange={(open) => {
          if (!open) closeDialog();
        }}
        onSuccess={(planId) => {
          closeDialog();
          navigate({
            to: '/plans/$planId',
            params: { planId: String(planId) },
          });
        }}
      />
      <DeletePlanDialog
        open={dialog.kind === 'deletePlan'}
        onOpenChange={(open) => {
          if (!open) closeDialog();
        }}
        planName={dialog.kind === 'deletePlan' ? dialog.name : undefined}
        onConfirm={handleDeleteConfirm}
        isDeleting={deletePlanMutation.isPending}
      />
      <CreatePlanGroupDialog
        open={dialog.kind === 'createPlanGroup'}
        onOpenChange={(open) => {
          if (!open) closeDialog();
        }}
      />
      <DeletePlanGroupDialog
        open={dialog.kind === 'deletePlanGroup'}
        onOpenChange={(open) => {
          if (!open) closeDialog();
        }}
        groupId={dialog.kind === 'deletePlanGroup' ? dialog.groupId : null}
        groupName={dialog.kind === 'deletePlanGroup' ? dialog.name : ''}
      />
      <RenamePlanGroupDialog
        open={dialog.kind === 'renamePlanGroup'}
        onOpenChange={(open) => {
          if (!open) closeDialog();
        }}
        groupId={dialog.kind === 'renamePlanGroup' ? dialog.groupId : null}
        currentName={
          dialog.kind === 'renamePlanGroup' ? dialog.currentName : ''
        }
      />
    </>
  );
}
