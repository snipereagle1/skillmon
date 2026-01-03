import { createFileRoute } from '@tanstack/react-router';

import { Clones } from '@/components/Clones';

function ClonesPage() {
  const { characterId } = Route.useParams();
  return (
    <div className="flex-1 overflow-hidden m-0">
      <Clones characterId={Number(characterId)} />
    </div>
  );
}

export const Route = createFileRoute('/characters/$characterId/clones')({
  component: ClonesPage,
});
