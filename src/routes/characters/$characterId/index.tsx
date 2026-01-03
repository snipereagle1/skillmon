import { createFileRoute, Navigate } from '@tanstack/react-router';

function CharacterRedirect() {
  const { characterId } = Route.useParams();
  return (
    <Navigate
      to="/characters/$characterId/skill-queue"
      params={{ characterId }}
    />
  );
}

export const Route = createFileRoute('/characters/$characterId/')({
  component: CharacterRedirect,
});
