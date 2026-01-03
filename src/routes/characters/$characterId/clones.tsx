import { createFileRoute } from '@tanstack/react-router';

import { Clones } from '@/components/Clones';

function ClonesPage() {
  const { characterId } = Route.useParams();
  return <Clones characterId={Number(characterId)} />;
}

export const Route = createFileRoute('/characters/$characterId/clones')({
  component: ClonesPage,
});
