import { createFileRoute } from '@tanstack/react-router';

import { SkillQueue } from '@/components/SkillQueue';

function SkillQueuePage() {
  const { characterId } = Route.useParams();
  return (
    <div className="flex-1 overflow-auto p-4 m-0">
      <SkillQueue characterId={Number(characterId)} />
    </div>
  );
}

export const Route = createFileRoute('/characters/$characterId/skill-queue')({
  component: SkillQueuePage,
});
