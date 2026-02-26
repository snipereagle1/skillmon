import { createFileRoute, Outlet } from '@tanstack/react-router';

import { NavigationTabs } from '@/components/ui/navigation-tabs';

function SettingsLayout() {
  return (
    <div className="flex h-full flex-col p-4">
      <div className="border rounded-lg overflow-hidden flex flex-col flex-1">
        <div className="border-b px-4 py-2">
          <NavigationTabs
            items={[{ to: '/settings/features', label: 'Features' }]}
          />
        </div>
        <div className="flex-1 overflow-auto p-4">
          <Outlet />
        </div>
      </div>
    </div>
  );
}

export const Route = createFileRoute('/settings')({
  component: SettingsLayout,
});
