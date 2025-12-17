import { useEffect, useMemo, useState } from 'react';
import { getTypeNames } from '@/generated/commands';
import { useClones } from '@/hooks/tauri/useClones';
import type { CloneResponse } from '@/generated/types';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface ClonesProps {
  characterId: number | null;
}

export function Clones({ characterId }: ClonesProps) {
  const { data: clones = [], isLoading, error } = useClones(characterId);
  const [implantNames, setImplantNames] = useState<Map<number, string>>(
    new Map()
  );

  const allImplantIds = useMemo(() => {
    const ids = new Set<number>();
    clones.forEach((clone) => {
      clone.implants.forEach((implant) => ids.add(implant.implant_type_id));
    });
    return Array.from(ids);
  }, [clones]);

  useEffect(() => {
    if (allImplantIds.length === 0) {
      setImplantNames(new Map());
      return;
    }

    getTypeNames({ typeIds: allImplantIds })
      .then((names) => {
        const map = new Map<number, string>();
        names.forEach((entry) => {
          map.set(entry.type_id, entry.name);
        });
        setImplantNames(map);
      })
      .catch((err) => {
        console.error('Failed to fetch implant names:', err);
      });
  }, [allImplantIds]);

  const sortedClones = useMemo(() => {
    const sorted = [...clones];
    sorted.sort((a, b) => {
      if (a.is_current && !b.is_current) return -1;
      if (!a.is_current && b.is_current) return 1;
      return 0;
    });
    return sorted;
  }, [clones]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Loading clones...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-destructive">
          Error:{' '}
          {error instanceof Error ? error.message : 'Failed to load clones'}
        </p>
      </div>
    );
  }

  if (clones.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">No clones found</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto p-4">
      <div className="space-y-2">
        {sortedClones.map((clone) => (
          <CloneRow key={clone.id} clone={clone} implantNames={implantNames} />
        ))}
      </div>
    </div>
  );
}

interface CloneRowProps {
  clone: CloneResponse;
  implantNames: Map<number, string>;
}

function CloneRow({ clone, implantNames }: CloneRowProps) {
  const displayName =
    clone.name ||
    (clone.clone_id ? `Clone ${clone.clone_id}` : 'Current Clone');
  const bgColor = clone.is_current ? 'bg-muted/50' : 'bg-background';

  return (
    <div
      className={`border rounded-lg p-3 ${bgColor} ${
        clone.is_current ? 'border-primary' : 'border-border'
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 w-10 h-10 rounded bg-muted flex items-center justify-center">
          <svg
            className="w-6 h-6 text-muted-foreground"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
            />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-foreground">{displayName}</div>
          <div className="text-sm text-muted-foreground mt-1">
            {clone.location_name || 'Unknown Location'}
          </div>
          {clone.implants.length > 0 ? (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {clone.implants.map((implant) => (
                <ImplantIcon
                  key={implant.implant_type_id}
                  implantId={implant.implant_type_id}
                  name={
                    implantNames.get(implant.implant_type_id) ||
                    `Implant ${implant.implant_type_id}`
                  }
                />
              ))}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground mt-2">
              No Implants Installed
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface ImplantIconProps {
  implantId: number;
  name: string;
}

function ImplantIcon({ implantId, name }: ImplantIconProps) {
  const [imageError, setImageError] = useState(false);
  const imageUrl = `https://images.evetech.net/types/${implantId}/icon?size=64`;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="w-8 h-8 rounded border border-border/50 bg-background/50 flex items-center justify-center cursor-help overflow-hidden">
          {imageError ? (
            <svg
              className="w-5 h-5 text-muted-foreground"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
              />
            </svg>
          ) : (
            <img
              src={imageUrl}
              alt={name}
              className="w-full h-full object-contain"
              onError={() => setImageError(true)}
            />
          )}
        </div>
      </TooltipTrigger>
      <TooltipContent>
        <p>{name}</p>
      </TooltipContent>
    </Tooltip>
  );
}
