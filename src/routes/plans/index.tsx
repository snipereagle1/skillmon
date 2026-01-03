import { createFileRoute } from '@tanstack/react-router';

import { PlanList } from '@/components/SkillPlans/PlanList';

function PlansIndexPage() {
  return (
    <>
      <div className="w-64 border-r border-border shrink-0 overflow-hidden flex flex-col h-full">
        <PlanList />
      </div>
      <div className="flex-1 min-w-0 overflow-hidden">
        <div className="flex items-center justify-center h-full">
          <p className="text-muted-foreground">
            Select a plan from the sidebar or create a new one
          </p>
        </div>
      </div>
    </>
  );
}

export const Route = createFileRoute('/plans/')({
  component: PlansIndexPage,
});
