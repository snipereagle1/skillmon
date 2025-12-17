import { startTransition, useEffect, useMemo, useState } from 'react';

import { getTypeNames } from '@/generated/commands';
import { useClones } from '@/hooks/tauri/useClones';

import { CloneRow } from './CloneRow';

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
      startTransition(() => {
        setImplantNames(new Map());
      });
      return;
    }

    let cancelled = false;
    getTypeNames({ typeIds: allImplantIds })
      .then((names) => {
        if (cancelled) return;
        const map = new Map<number, string>();
        names.forEach((entry) => {
          map.set(entry.type_id, entry.name);
        });
        setImplantNames(map);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('Failed to fetch implant names:', err);
      });

    return () => {
      cancelled = true;
    };
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
