import { createFileRoute } from '@tanstack/react-router';

import { NotificationSettings } from '@/components/NotificationSettings';

function SettingsPage() {
  const { characterId } = Route.useParams();
  return <NotificationSettings characterId={Number(characterId)} />;
}

export const Route = createFileRoute('/characters/$characterId/settings')({
  component: SettingsPage,
});
