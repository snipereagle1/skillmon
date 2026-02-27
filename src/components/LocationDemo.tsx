import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { MapPin, RefreshCw, Rocket, Settings, ShieldAlert } from 'lucide-react';
import { useState } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { getCharacterLocation } from '@/generated/commands';
import { queryKeys } from '@/hooks/tauri/queryKeys';
import { cn } from '@/lib/utils';

export function LocationDemo({ characterId }: { characterId: number }) {
  const [enabled, setEnabled] = useState(false);

  const { data, error, isLoading, refetch, isFetching } = useQuery({
    queryKey: queryKeys.location(characterId),
    queryFn: () => getCharacterLocation({ characterId }),
    enabled: enabled,
    retry: false,
  });

  if (!enabled) {
    return (
      <div className="p-4 border rounded-lg space-y-4">
        <h3 className="text-lg font-medium">Location Feature Demo</h3>
        <p className="text-sm text-muted-foreground">
          This feature requires the <code>esi-location</code> scopes to show
          where your character is.
        </p>
        <Button onClick={() => setEnabled(true)}>Try Fetching Location</Button>
      </div>
    );
  }

  const isMissingScope =
    error instanceof Error && error.message.includes('missing ESI scopes');

  return (
    <div className="p-4 border rounded-lg space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">Location Feature Demo</h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => refetch()}
          disabled={isLoading || isFetching}
          className="h-8 w-8 p-0"
        >
          <RefreshCw
            className={cn(
              'h-4 w-4',
              (isLoading || isFetching) && 'animate-spin'
            )}
          />
          <span className="sr-only">Refresh</span>
        </Button>
      </div>

      {isLoading && (
        <p className="text-sm text-muted-foreground italic">
          Fetching data from ESI...
        </p>
      )}

      {isMissingScope && (
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
      )}

      {!isMissingScope && error && (
        <Alert variant="destructive">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      )}

      {data && (
        <div className="space-y-3">
          <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
            <div
              className={cn(
                'h-2 w-2 rounded-full',
                data.is_online
                  ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]'
                  : 'bg-gray-400'
              )}
            />
            <span className="text-sm font-medium">
              {data.is_online ? 'Online' : 'Offline'}
            </span>
            {data.last_logout && !data.is_online && (
              <span className="text-xs text-muted-foreground">
                Last seen: {new Date(data.last_logout).toLocaleString()}
              </span>
            )}
          </div>

          <div className="grid gap-2">
            <div className="flex items-start gap-3">
              <MapPin className="h-4 w-4 mt-0.5 text-muted-foreground" />
              <div className="grid gap-0.5">
                <span className="text-sm font-medium">
                  {data.solar_system_name}
                </span>
                {(data.station_name || data.structure_name) && (
                  <span className="text-xs text-muted-foreground">
                    {data.station_name || data.structure_name}
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Rocket className="h-4 w-4 mt-0.5 text-muted-foreground" />
              <div className="grid gap-0.5">
                <span className="text-sm font-medium">{data.ship_name}</span>
                <span className="text-xs text-muted-foreground">
                  {data.ship_type_name}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
