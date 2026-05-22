import { createFileRoute } from '@tanstack/react-router';

import { PlanTree } from '@/components/PlanTree';
import { PlanEditor } from '@/components/SkillPlans/PlanEditor';

export type PlanTab = 'editor' | 'remaps' | 'comparison' | 'simulation';

const VALID_TABS: PlanTab[] = ['editor', 'remaps', 'comparison', 'simulation'];

interface PlanSearch {
  tab?: PlanTab;
}

function PlanDetailPage() {
  const { planId } = Route.useParams();
  return (
    <div className="flex h-full min-h-0 bg-card">
      <div className="w-64 border-r border-border shrink-0 overflow-hidden flex flex-col bg-card">
        <PlanTree />
      </div>
      <div className="flex-1 min-w-0 overflow-hidden">
        <PlanEditor planId={Number(planId)} />
      </div>
    </div>
  );
}

export const Route = createFileRoute('/plans/$planId')({
  validateSearch: (search: Record<string, unknown>): PlanSearch => {
    const tab = search.tab;
    return {
      tab:
        typeof tab === 'string' && VALID_TABS.includes(tab as PlanTab)
          ? (tab as PlanTab)
          : undefined,
    };
  },
  component: PlanDetailPage,
});
