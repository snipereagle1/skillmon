import { createFileRoute, useNavigate } from '@tanstack/react-router';

import { CharacterPlanComparison } from '@/components/CharacterPlanComparison';

interface PlansSearch {
  planId?: number;
}

function CharacterPlansPage() {
  const { characterId } = Route.useParams();
  const { planId } = Route.useSearch();
  const navigate = useNavigate();

  const handlePlanChange = (newPlanId: number | null) => {
    navigate({
      to: '/characters/$characterId/plans',
      params: { characterId },
      search: { planId: newPlanId ?? undefined },
      replace: true,
    });
  };

  return (
    <CharacterPlanComparison
      characterId={Number(characterId)}
      selectedPlanId={planId ?? null}
      onPlanChange={handlePlanChange}
    />
  );
}

export const Route = createFileRoute('/characters/$characterId/plans')({
  validateSearch: (search: Record<string, unknown>): PlansSearch => {
    return {
      planId: search.planId ? Number(search.planId) : undefined,
    };
  },
  component: CharacterPlansPage,
});
