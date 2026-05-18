import { createFileRoute } from '@tanstack/react-router';
import { toast } from 'sonner';

import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { BooleanAppSettingKey } from '@/generated/types';
import {
  useAppSettings,
  useSetBooleanAppSetting,
} from '@/hooks/tauri/useSettings';

export const Route = createFileRoute('/settings/general')({
  component: GeneralPage,
});

function GeneralPage() {
  const { data: settings, isLoading } = useAppSettings();
  const setBooleanAppSetting = useSetBooleanAppSetting();

  if (isLoading) {
    return <div className="p-4 text-muted-foreground">Loading settings...</div>;
  }

  const handleStartMinimizedChange = (checked: boolean) => {
    setBooleanAppSetting.mutate(
      { key: BooleanAppSettingKey.StartMinimized, value: checked },
      {
        onSuccess: () => {
          toast.success(
            checked
              ? 'App will start minimized to tray'
              : 'App will show on startup'
          );
        },
        onError: (error) => {
          toast.error(
            `Failed to update setting: ${error instanceof Error ? error.message : String(error)}`
          );
        },
      }
    );
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-1">General</h2>
        <p className="text-muted-foreground">Application-wide settings.</p>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between p-4 border rounded-lg bg-card">
          <div className="space-y-1 pr-8">
            <Label
              htmlFor="start-minimized"
              className="text-base font-medium cursor-pointer"
            >
              Start Minimized
            </Label>
            <p className="text-sm text-muted-foreground">
              Launch skillmon to the system tray without showing the main
              window.
            </p>
          </div>
          <Switch
            id="start-minimized"
            checked={settings?.start_minimized ?? false}
            onCheckedChange={handleStartMinimizedChange}
            disabled={setBooleanAppSetting.isPending}
          />
        </div>
      </div>
    </div>
  );
}
