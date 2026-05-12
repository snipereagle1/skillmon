import { Link } from '@tanstack/react-router';
import { MapPin, Rocket, Settings, ShieldAlert } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useEsiStore } from '@/stores/esiStore';

export function LocationDemo({ characterId }: { characterId: number }) {
  const slice = useEsiStore((s) => s.locations[characterId]);
  const data = slice?.data;

  if (!data) {
    return (
      <div className="p-4 border rounded-lg space-y-4">
        <h3 className="text-lg font-medium">Location Feature Demo</h3>
        <p className="text-sm text-muted-foreground">
          Location data syncs in the background. Enable the Locations feature,
          wait for a refresh cycle, then return here — or restart the app to
          hydrate from cache.
        </p>
        <Link to="/settings/features">
          <Button
            variant="outline"
            size="sm"
            className="flex items-center gap-2"
          >
            <Settings className="h-4 w-4" />
            Feature settings
          </Button>
        </Link>
      </div>
    );
  }

  if (!data.hasLocationScope) {
    return (
      <div className="p-4 border rounded-lg space-y-4">
        <h3 className="text-lg font-medium">Location Feature Demo</h3>
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Missing Permission</AlertTitle>
          <AlertDescription className="space-y-3">
            <p>
              This feature requires additional permissions that haven&apos;t
              been granted for this character.
            </p>
            <div className="flex items-center gap-2">
              <Link to="/settings/features">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex items-center gap-2"
                >
                  <Settings className="h-4 w-4" />
                  Go to Settings
                </Button>
              </Link>
            </div>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const isOnline = data.isOnline ?? false;

  return (
    <div className="p-4 border rounded-lg space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">Location Feature Demo</h3>
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
          <div
            className={cn(
              'h-2 w-2 rounded-full',
              isOnline
                ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]'
                : 'bg-gray-400'
            )}
          />
          <span className="text-sm font-medium">
            {isOnline ? 'Online' : 'Offline'}
          </span>
        </div>

        <div className="grid gap-2">
          <div className="flex items-start gap-3">
            <MapPin className="h-4 w-4 mt-0.5 text-muted-foreground" />
            <div className="grid gap-0.5">
              <span className="text-sm font-medium">
                {data.solarSystemName}
              </span>
              {data.regionName != null && (
                <span className="text-xs text-muted-foreground">
                  {data.regionName}
                </span>
              )}
              {(data.stationName ?? data.structureName) != null && (
                <span className="text-xs text-muted-foreground">
                  {data.stationName ?? data.structureName}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-start gap-3">
            <Rocket className="h-4 w-4 mt-0.5 text-muted-foreground" />
            <div className="grid gap-0.5">
              <span className="text-sm font-medium">
                {data.shipName ?? '—'}
              </span>
              <span className="text-xs text-muted-foreground">
                {data.shipTypeName ?? 'Ship'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
