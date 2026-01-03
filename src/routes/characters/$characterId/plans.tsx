import { createFileRoute } from '@tanstack/react-router';

import { CharacterPlanComparison } from '@/components/CharacterPlanComparison';

function CharacterPlansPage() {
  const { characterId } = Route.useParams();
  return (
    <div className="flex-1 overflow-hidden m-0">
      <CharacterPlanComparison characterId={Number(characterId)} />
    </div>
  );
}

export const Route = createFileRoute('/characters/$characterId/plans')({
  component: CharacterPlansPage,
});
