import { createFileRoute } from '@tanstack/react-router';

import { PlanEditor } from '@/components/SkillPlans/PlanEditor';
import { PlanList } from '@/components/SkillPlans/PlanList';

function PlanDetailPage() {
  const { planId } = Route.useParams();
  return (
    <div className="flex h-full min-h-0">
      <div className="w-64 border-r border-border shrink-0 overflow-hidden flex flex-col">
        <PlanList />
      </div>
      <div className="flex-1 min-w-0 overflow-hidden">
        <PlanEditor planId={Number(planId)} />
      </div>
    </div>
  );
}

export const Route = createFileRoute('/plans/$planId')({
  component: PlanDetailPage,
});
