import { createFileRoute } from '@tanstack/react-router';

import { Attributes } from '@/components/Attributes';

function AttributesPage() {
  const { characterId } = Route.useParams();
  return (
    <div className="flex-1 overflow-hidden m-0">
      <Attributes characterId={Number(characterId)} />
    </div>
  );
}

export const Route = createFileRoute('/characters/$characterId/attributes')({
  component: AttributesPage,
});
