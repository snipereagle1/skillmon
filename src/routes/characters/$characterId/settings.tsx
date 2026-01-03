import { createFileRoute } from '@tanstack/react-router';

import { NotificationSettings } from '@/components/NotificationSettings';

function SettingsPage() {
  const { characterId } = Route.useParams();
  return (
    <div className="flex-1 overflow-auto m-0">
      <NotificationSettings characterId={Number(characterId)} />
    </div>
  );
}

export const Route = createFileRoute('/characters/$characterId/settings')({
  component: SettingsPage,
});
