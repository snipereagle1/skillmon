import { useState, useEffect } from "react";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  useNotificationSettings,
  useUpdateNotificationSetting,
} from "@/hooks/tauri/useNotificationSettings";
import { NOTIFICATION_TYPES } from "@/lib/notificationTypes";

interface NotificationSettingsProps {
  characterId: number | null;
}

export function NotificationSettings({ characterId }: NotificationSettingsProps) {
  const { data: settings = [] } = useNotificationSettings(characterId);
  const updateSetting = useUpdateNotificationSetting();

  const skillQueueLowSetting = settings.find(
    (s) => s.notification_type === NOTIFICATION_TYPES.SKILL_QUEUE_LOW
  );

  const [enabled, setEnabled] = useState(
    skillQueueLowSetting?.enabled ?? false
  );
  const [thresholdHours, setThresholdHours] = useState(() => {
    if (skillQueueLowSetting?.config) {
      const config = skillQueueLowSetting.config as { threshold_hours?: number };
      return config.threshold_hours ?? 24;
    }
    return 24;
  });

  useEffect(() => {
    if (skillQueueLowSetting) {
      setEnabled(skillQueueLowSetting.enabled);
      if (skillQueueLowSetting.config) {
        const config = skillQueueLowSetting.config as {
          threshold_hours?: number;
        };
        setThresholdHours(config.threshold_hours ?? 24);
      }
    } else {
      setEnabled(false);
      setThresholdHours(24);
    }
  }, [skillQueueLowSetting]);

  const handleToggle = (newEnabled: boolean) => {
    if (!characterId) return;

    setEnabled(newEnabled);
    updateSetting.mutate({
      characterId,
      notificationType: NOTIFICATION_TYPES.SKILL_QUEUE_LOW,
      enabled: newEnabled,
      config: newEnabled
        ? { threshold_hours: thresholdHours }
        : undefined,
    });
  };

  const handleThresholdChange = (value: string) => {
    const numValue = parseInt(value, 10);
    if (!isNaN(numValue) && numValue > 0) {
      setThresholdHours(numValue);
      if (characterId && enabled) {
        updateSetting.mutate({
          characterId,
          notificationType: NOTIFICATION_TYPES.SKILL_QUEUE_LOW,
          enabled: true,
          config: { threshold_hours: numValue },
        });
      }
    }
  };

  if (!characterId) {
    return (
      <div className="p-4 text-muted-foreground">
        Select a character to configure notifications
      </div>
    );
  }

  return (
    <div className="p-4 space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-4">Notification Settings</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5 flex-1">
              <Label htmlFor="skill-queue-low" className="text-base">
                Skill Queue Low
              </Label>
              <p className="text-sm text-muted-foreground">
                Get notified when your skill queue falls below a certain time
                threshold
              </p>
            </div>
            <Switch
              id="skill-queue-low"
              checked={enabled}
              onCheckedChange={handleToggle}
              disabled={updateSetting.isPending}
            />
          </div>
          {enabled && (
            <div className="ml-0 space-y-2">
              <Label htmlFor="threshold-hours" className="text-sm">
                Threshold (hours)
              </Label>
              <Input
                id="threshold-hours"
                type="number"
                min="1"
                value={thresholdHours}
                onChange={(e) => handleThresholdChange(e.target.value)}
                disabled={updateSetting.isPending}
                className="w-32"
              />
              <p className="text-xs text-muted-foreground">
                You will be notified when your skill queue has less than this
                many hours remaining
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


