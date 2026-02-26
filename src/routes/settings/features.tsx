import { createFileRoute } from '@tanstack/react-router';
import { InfoIcon, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import type { FeatureId } from '@/generated/types';
import {
  useEnabledFeatures,
  useOptionalFeatures,
  useSetFeatureEnabled,
} from '@/hooks/tauri/useSettings';
import { useStartEveLogin } from '@/hooks/tauri/useStartEveLogin';

export const Route = createFileRoute('/settings/features')({
  component: FeaturesPage,
});

function FeaturesPage() {
  const { data: optionalFeatures, isLoading: loadingOptional } =
    useOptionalFeatures();
  const { data: enabledFeatures, isLoading: loadingEnabled } =
    useEnabledFeatures();
  const setFeatureEnabled = useSetFeatureEnabled();
  const { mutate: startLogin, isPending: loggingIn } = useStartEveLogin();

  const isLoading = loadingOptional || loadingEnabled;

  if (isLoading) {
    return <div className="p-4 text-muted-foreground">Loading features...</div>;
  }

  const handleToggle = (featureId: FeatureId, enabled: boolean) => {
    setFeatureEnabled.mutate(
      { featureId, enabled },
      {
        onSuccess: () => {
          toast.success(
            `${enabled ? 'Enabled' : 'Disabled'} feature successfully`
          );
        },
        onError: (error) => {
          toast.error(`Failed to update feature: ${error}`);
        },
      }
    );
  };

  const handleReauth = () => {
    startLogin();
  };

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-1">Optional Features</h2>
        <p className="text-muted-foreground">
          Enable optional features to request additional permissions from EVE
          Online.
        </p>
      </div>

      <Alert>
        <InfoIcon className="h-4 w-4" />
        <AlertTitle>Re-authentication Required</AlertTitle>
        <AlertDescription>
          After enabling a new feature, you must re-authenticate your characters
          to grant the necessary permissions. New characters added will
          automatically include all enabled features.
        </AlertDescription>
      </Alert>

      <div className="space-y-4">
        {optionalFeatures?.map((feature) => (
          <div
            key={feature.id}
            className="flex items-start justify-between p-4 border rounded-lg bg-card hover:bg-accent/5 transition-colors"
          >
            <div className="space-y-1 pr-8">
              <Label
                htmlFor={feature.id}
                className="text-lg font-medium cursor-pointer"
              >
                {feature.name}
              </Label>
              <p className="text-sm text-muted-foreground">
                {feature.description}
              </p>
              <div className="flex flex-wrap gap-2 mt-2">
                {feature.scopes.map((scope) => (
                  <code
                    key={scope}
                    className="text-[10px] bg-muted px-1.5 py-0.5 rounded"
                  >
                    {scope}
                  </code>
                ))}
              </div>
            </div>
            <Switch
              id={feature.id}
              checked={enabledFeatures?.includes(feature.id)}
              onCheckedChange={(checked) => handleToggle(feature.id, checked)}
              disabled={setFeatureEnabled.isPending}
            />
          </div>
        ))}
      </div>

      <div className="pt-4 border-t">
        <Button
          variant="outline"
          onClick={handleReauth}
          disabled={loggingIn}
          className="flex items-center gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${loggingIn ? 'animate-spin' : ''}`} />
          Re-authenticate Character
        </Button>
        <p className="text-xs text-muted-foreground mt-2">
          Click this to sign in again and update permissions for an existing
          character or add a new one.
        </p>
      </div>
    </div>
  );
}
