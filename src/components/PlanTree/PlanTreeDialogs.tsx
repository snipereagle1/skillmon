import { useNavigate, useParams } from '@tanstack/react-router';

import { useDeleteSkillPlan } from '@/hooks/tauri/useSkillPlans';
import { usePlanTreeDialogStore } from '@/stores/planTreeDialogStore';

import { CreateMergedPlanDialog } from './CreateMergedPlanDialog';
import { CreatePlanDialog } from './CreatePlanDialog';
import { CreatePlanFromCharacterDialog } from './CreatePlanFromCharacterDialog';
import { CreatePlanGroupDialog } from './CreatePlanGroupDialog';
import { DeletePlanDialog } from './DeletePlanDialog';
import { DeletePlanGroupDialog } from './DeletePlanGroupDialog';
import { RenamePlanGroupDialog } from './RenamePlanGroupDialog';

export function PlanTreeDialogs() {
  const params = useParams({ strict: false });
  const navigate = useNavigate();
  const currentPlanId = params.planId ? Number(params.planId) : null;

  const dialog = usePlanTreeDialogStore((s) => s.dialog);
  const closeDialog = usePlanTreeDialogStore((s) => s.close);

  const deletePlanMutation = useDeleteSkillPlan();

  const handleDeleteConfirm = async () => {
    if (dialog.kind !== 'deletePlan') return;
    const { planId } = dialog;
    try {
      await deletePlanMutation.mutateAsync({ planId });
      if (currentPlanId === planId) {
        navigate({ to: '/plans' });
      }
      closeDialog();
    } catch (err) {
      console.error('Failed to delete plan:', err);
    }
  };

  const handleCreateSuccess = (planId: number) => {
    closeDialog();
    navigate({ to: '/plans/$planId', params: { planId: String(planId) } });
  };

  return (
    <>
      <CreatePlanDialog
        open={dialog.kind === 'createPlan'}
        onOpenChange={(open) => {
          if (!open) closeDialog();
        }}
        initialGroupId={dialog.kind === 'createPlan' ? dialog.groupId : null}
        onSuccess={handleCreateSuccess}
      />
      <CreateMergedPlanDialog
        open={dialog.kind === 'createMergedPlan'}
        onOpenChange={(open) => {
          if (!open) closeDialog();
        }}
        onSuccess={handleCreateSuccess}
      />
      <CreatePlanFromCharacterDialog
        open={dialog.kind === 'createPlanFromCharacter'}
        onOpenChange={(open) => {
          if (!open) closeDialog();
        }}
        onSuccess={handleCreateSuccess}
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
        initialParentGroupId={
          dialog.kind === 'createPlanGroup' ? dialog.parentGroupId : null
        }
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
