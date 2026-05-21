import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { ChevronDown, FolderPlus, Pencil } from 'lucide-react';
import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { usePlanGroups } from '@/hooks/tauri/usePlanGroups';
import { useDeleteSkillPlan, useSkillPlans } from '@/hooks/tauri/useSkillPlans';
import { assemblePlanTree, type PlanTreeNode } from '@/lib/planTree';
import { cn } from '@/lib/utils';

import { CreatePlanDialog } from './CreatePlanDialog';
import { CreatePlanFromCharacterDialog } from './CreatePlanFromCharacterDialog';
import { CreatePlanGroupDialog } from './CreatePlanGroupDialog';
import { DeletePlanDialog } from './DeletePlanDialog';
import { RenamePlanGroupDialog } from './RenamePlanGroupDialog';

interface PlanRowProps {
  node: Extract<PlanTreeNode, { kind: 'plan' }>;
  selectedPlanId: number | null;
  onDelete?: (planId: number, planName: string) => void;
  onPlanClick?: (planId: number) => void;
  isDeleting: boolean;
  depth: number;
}

function PlanRow({
  node,
  selectedPlanId,
  onDelete,
  onPlanClick,
  isDeleting,
  depth,
}: PlanRowProps) {
  const isSelected = selectedPlanId === node.id;
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
      className={cn(
        'relative flex items-center rounded-md transition-colors',
        isSelected ? 'bg-muted text-foreground' : 'hover:bg-muted'
      )}
      style={{ paddingLeft: depth * 12 }}
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

interface NodeRendererProps {
  node: PlanTreeNode;
  depth: number;
  selectedPlanId: number | null;
  onDelete?: (planId: number, planName: string) => void;
  onPlanClick?: (planId: number) => void;
  isDeleting: boolean;
  onRenameGroup?: (groupId: number, currentName: string) => void;
}

function NodeRenderer({
  node,
  depth,
  selectedPlanId,
  onDelete,
  onPlanClick,
  isDeleting,
  onRenameGroup,
}: NodeRendererProps) {
  if (node.kind === 'plan') {
    return (
      <PlanRow
        node={node}
        selectedPlanId={selectedPlanId}
        onDelete={onDelete}
        onPlanClick={onPlanClick}
        isDeleting={isDeleting}
        depth={depth}
      />
    );
  }
  return (
    <div>
      <div
        className="group flex items-center gap-1 p-2 text-sm font-medium text-muted-foreground"
        style={{ paddingLeft: depth * 12 }}
      >
        <span className="flex-1 truncate">{node.name}</span>
        {onRenameGroup && (
          <Button
            variant="ghost"
            size="sm"
            className="size-6 p-0 opacity-0 group-hover:opacity-100 focus:opacity-100"
            onClick={() => onRenameGroup(node.id, node.name)}
            aria-label={`Rename folder ${node.name}`}
          >
            <Pencil className="size-3.5" />
          </Button>
        )}
      </div>
      <div>
        {node.children.map((child) => (
          <NodeRenderer
            key={`${child.kind}-${child.id}`}
            node={child}
            depth={depth + 1}
            selectedPlanId={selectedPlanId}
            onDelete={onDelete}
            onPlanClick={onPlanClick}
            isDeleting={isDeleting}
            onRenameGroup={onRenameGroup}
          />
        ))}
      </div>
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
        {tree.length === 0 ? (
          <div className="flex items-center justify-center h-full p-4">
            <p className="text-sm text-muted-foreground text-center">
              No plans yet. Create your first plan to get started.
            </p>
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {tree.map((node) => (
              <NodeRenderer
                key={`${node.kind}-${node.id}`}
                node={node}
                depth={0}
                selectedPlanId={selectedPlanId}
                onDelete={showActions ? handleDeleteClick : undefined}
                onPlanClick={onPlanClick}
                isDeleting={deletePlanMutation.isPending}
                onRenameGroup={showActions ? handleRenameGroup : undefined}
              />
            ))}
          </div>
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
