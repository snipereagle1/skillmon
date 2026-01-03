import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { useDeleteSkillPlan, useSkillPlans } from '@/hooks/tauri/useSkillPlans';

import { CreatePlanDialog } from './CreatePlanDialog';
import { DeletePlanDialog } from './DeletePlanDialog';

export function PlanList() {
  const params = useParams({ strict: false });
  const navigate = useNavigate();
  const selectedPlanId = params.planId ? Number(params.planId) : null;
  const { data: plans, isLoading, error } = useSkillPlans();
  const deletePlanMutation = useDeleteSkillPlan();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [planToDelete, setPlanToDelete] = useState<{
    id: number;
    name: string;
  } | null>(null);

  const handleDeleteClick = (
    planId: number,
    planName: string,
    e: React.MouseEvent
  ) => {
    e.stopPropagation();
    setPlanToDelete({ id: planId, name: planName });
    setDeleteDialogOpen(true);
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Loading plans...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full p-4">
        <p className="text-sm text-destructive">
          Error:{' '}
          {error instanceof Error ? error.message : 'Failed to load plans'}
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="p-4 border-b border-border">
        <Button onClick={() => setCreateDialogOpen(true)} className="w-full">
          Create Plan
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {!plans || plans.length === 0 ? (
          <div className="flex items-center justify-center h-full p-4">
            <p className="text-sm text-muted-foreground text-center">
              No plans yet. Create your first plan to get started.
            </p>
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {plans.map((plan) => (
              <Link
                key={plan.plan_id}
                to="/plans/$planId"
                params={{ planId: String(plan.plan_id) }}
                className={`
                  block p-3 rounded-md cursor-pointer transition-colors
                  ${
                    selectedPlanId === plan.plan_id
                      ? 'bg-muted text-white'
                      : 'hover:bg-muted'
                  }
                `}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold truncate">{plan.name}</h3>
                    {plan.description && (
                      <p
                        className={`text-sm mt-1 line-clamp-2 ${
                          selectedPlanId === plan.plan_id
                            ? 'text-white/80'
                            : 'text-muted-foreground'
                        }`}
                      >
                        {plan.description}
                      </p>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) =>
                      handleDeleteClick(plan.plan_id, plan.name, e)
                    }
                    disabled={deletePlanMutation.isPending}
                    className="shrink-0 size-6 p-0"
                  >
                    ×
                  </Button>
                </div>
              </Link>
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
      <DeletePlanDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        planName={planToDelete?.name}
        onConfirm={handleDeleteConfirm}
        isDeleting={deletePlanMutation.isPending}
      />
    </>
  );
}
