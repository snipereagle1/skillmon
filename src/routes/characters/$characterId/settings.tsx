import { createFileRoute } from '@tanstack/react-router';

import { LocationDemo } from '@/components/LocationDemo';
import { NotificationSettings } from '@/components/NotificationSettings';

function SettingsPage() {
  const { characterId } = Route.useParams();
  return (
    <div className="space-y-6">
      <NotificationSettings characterId={Number(characterId)} />
      <div className="px-4">
        <LocationDemo characterId={Number(characterId)} />
      </div>
    </div>
  );
}

export const Route = createFileRoute('/characters/$characterId/settings')({
  component: SettingsPage,
});
