import { createFileRoute } from '@tanstack/react-router';

import { SkillQueue } from '@/components/SkillQueue';

function SkillQueuePage() {
  const { characterId } = Route.useParams();
  return <SkillQueue characterId={Number(characterId)} />;
}

export const Route = createFileRoute('/characters/$characterId/skill-queue')({
  component: SkillQueuePage,
});
