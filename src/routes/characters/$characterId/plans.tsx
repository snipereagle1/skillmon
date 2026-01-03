import { createFileRoute } from '@tanstack/react-router';

import { CharacterPlanComparison } from '@/components/CharacterPlanComparison';

function CharacterPlansPage() {
  const { characterId } = Route.useParams();
  return <CharacterPlanComparison characterId={Number(characterId)} />;
}

export const Route = createFileRoute('/characters/$characterId/plans')({
  component: CharacterPlansPage,
});
