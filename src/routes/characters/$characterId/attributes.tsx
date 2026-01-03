import { createFileRoute } from '@tanstack/react-router';

import { Attributes } from '@/components/Attributes';

function AttributesPage() {
  const { characterId } = Route.useParams();
  return <Attributes characterId={Number(characterId)} />;
}

export const Route = createFileRoute('/characters/$characterId/attributes')({
  component: AttributesPage,
});
