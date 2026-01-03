import { createFileRoute } from '@tanstack/react-router';

import { Skills } from '@/components/Skills';

function SkillsPage() {
  const { characterId } = Route.useParams();
  return <Skills characterId={Number(characterId)} />;
}

export const Route = createFileRoute('/characters/$characterId/skills')({
  component: SkillsPage,
});
