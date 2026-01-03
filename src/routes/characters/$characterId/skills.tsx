import { createFileRoute } from '@tanstack/react-router';

import { Skills } from '@/components/Skills';

function SkillsPage() {
  const { characterId } = Route.useParams();
  return (
    <div className="flex-1 overflow-hidden m-0">
      <Skills characterId={Number(characterId)} />
    </div>
  );
}

export const Route = createFileRoute('/characters/$characterId/skills')({
  component: SkillsPage,
});
