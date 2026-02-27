import { createFileRoute } from '@tanstack/react-router';
import { CircleCheck, CircleSlash, InfoIcon } from 'lucide-react';
import { toast } from 'sonner';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { FeatureId } from '@/generated/types';
import {
  useCharacterFeatureScopeStatus,
  useEnabledFeatures,
  useOptionalFeatures,
  useSetFeatureEnabled,
} from '@/hooks/tauri/useSettings';

export const Route = createFileRoute('/settings/features')({
  component: FeaturesPage,
});

function FeaturesPage() {
  const { data: optionalFeatures, isLoading: loadingOptional } =
    useOptionalFeatures();
  const { data: enabledFeatures, isLoading: loadingEnabled } =
    useEnabledFeatures();
  const { data: scopeStatusData, isLoading: loadingScopeStatus } =
    useCharacterFeatureScopeStatus();
  const setFeatureEnabled = useSetFeatureEnabled();

  const isLoading = loadingOptional || loadingEnabled || loadingScopeStatus;

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

  return (
    <div className="max-w-7xl space-y-6">
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

      <div className="grid grid-cols-2 gap-4">
        {optionalFeatures?.map((feature) => (
          <div
            key={feature.id}
            className="flex items-start justify-between p-4 border rounded-lg bg-card"
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

      {enabledFeatures && enabledFeatures.length > 0 && (
        <div className="pt-4 border-t">
          <h3 className="text-lg font-semibold mb-4">Feature Availability</h3>
          {scopeStatusData && scopeStatusData.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Character</TableHead>
                  {enabledFeatures.map((featureId) => {
                    const feature = optionalFeatures?.find(
                      (f) => f.id === featureId
                    );
                    return (
                      <TableHead key={featureId} className="text-center">
                        {feature?.name ?? featureId}
                      </TableHead>
                    );
                  })}
                </TableRow>
              </TableHeader>
              <TableBody>
                {scopeStatusData.map((character) => (
                  <TableRow key={character.character_id}>
                    <TableCell className="font-medium">
                      {character.character_name}
                    </TableCell>
                    {enabledFeatures.map((featureId) => {
                      const scopeEntry = character.feature_has_scopes.find(
                        ([id]) => id === featureId
                      );
                      const hasScopes = scopeEntry?.[1] ?? false;
                      return (
                        <TableCell key={featureId} className="text-center">
                          {hasScopes ? (
                            <CircleCheck className="h-5 w-5 text-green-500 mx-auto" />
                          ) : (
                            <CircleSlash className="h-5 w-5 text-muted-foreground mx-auto" />
                          )}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-muted-foreground">No characters available.</p>
          )}
        </div>
      )}
    </div>
  );
}
