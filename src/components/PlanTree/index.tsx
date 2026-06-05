import { useNavigate, useParams } from '@tanstack/react-router';
import {
  ChevronDown,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  GitMerge,
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
import { ContextMenuItem } from '@/components/ui/context-menu';
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
import { useSkillPlans } from '@/hooks/tauri/useSkillPlans';
import { assemblePlanTree, type PlanTreeNode } from '@/lib/planTree';
import {
  groupNodeId,
  isDropAllowed,
  type NodeIndex,
  parseNodeId,
  planNodeId,
  resolveDropTarget,
} from '@/lib/planTreeDnd';
import { usePlanTreeDialogStore } from '@/stores/planTreeDialogStore';

import { PlanTreeDialogs } from './PlanTreeDialogs';

type PlanItem = TreeNode;

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
  const moveNodeMutation = useMoveNode();

  const openCreatePlan = usePlanTreeDialogStore((s) => s.openCreatePlan);
  const openCreateMergedPlan = usePlanTreeDialogStore(
    (s) => s.openCreateMergedPlan
  );
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
        navigate({
          to: '/plans/$planId',
          params: { planId: String(planId) },
          search: (prev) => prev,
        });
      }
    },
    [onPlanClick, navigate]
  );

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
          contextMenuContent: showActions ? (
            <>
              <ContextMenuItem
                onSelect={() => openRenamePlanGroup(node.id, node.name)}
              >
                <Pencil className="size-3.5" />
                Rename
              </ContextMenuItem>
              <ContextMenuItem
                variant="destructive"
                onSelect={() => openDeletePlanGroup(node.id, node.name)}
              >
                <Trash2 className="size-3.5" />
                Delete
              </ContextMenuItem>
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
        contextMenuContent: showActions ? (
          <ContextMenuItem
            variant="destructive"
            onSelect={() => openDeletePlan(node.id, node.name)}
          >
            <Trash2 className="size-3.5" />
            Delete
          </ContextMenuItem>
        ) : undefined,
      } satisfies PlanItem;
    };
    return tree.map(build);
  }, [
    tree,
    showActions,
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
                <DropdownMenuItem onClick={openCreateMergedPlan}>
                  <GitMerge className="size-4 mr-2" />
                  Create Merged Plan
                </DropdownMenuItem>
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
            renderItem={({ item }) => (
              <span className="truncate leading-none">{item.name}</span>
            )}
          />
        )}
      </div>
      <PlanTreeDialogs />
    </>
  );
}
