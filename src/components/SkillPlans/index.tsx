import { useState } from 'react';

import { PlanEditor } from './PlanEditor';
import { PlanList } from './PlanList';

export function SkillPlans() {
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null);

  return (
    <div className="flex h-full min-h-0">
      <div className="w-64 border-r border-border shrink-0 overflow-hidden flex flex-col">
        <PlanList
          selectedPlanId={selectedPlanId}
          onSelectPlan={setSelectedPlanId}
        />
      </div>
      <div className="flex-1 min-w-0 overflow-hidden">
        {selectedPlanId === null ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-muted-foreground">
              Select a plan from the sidebar or create a new one
            </p>
          </div>
        ) : (
          <PlanEditor planId={selectedPlanId} />
        )}
      </div>
    </div>
  );
}
