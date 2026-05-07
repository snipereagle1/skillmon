import { useEffect, useRef, useState } from 'react';

import { getTrainingCharactersOverview } from '@/generated/commands';
import type { TrainingCharacterOverview } from '@/generated/types';
import { useEsiStore } from '@/stores/esiStore';

// Re-fetches from the backend whenever the queue store changes.
// The command requires implant data not available in the store, so we can't
// derive this purely from slices — but we avoid the 5-minute polling interval
// by using event-driven queue updates as the trigger instead.
export function useTrainingCharactersOverview(): {
  data: TrainingCharacterOverview[] | null;
  isLoading: boolean;
  error: string | null;
} {
  const [data, setData] = useState<TrainingCharacterOverview[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Track the queue's lastUpdatedAt timestamps as a stable change signal
  const queues = useEsiStore((state) => state.queues);
  const queueVersion = Object.values(queues)
    .map((s) => s.lastUpdatedAt)
    .join(',');

  const prevVersionRef = useRef<string | null>(null);

  useEffect(() => {
    if (queueVersion === prevVersionRef.current) return;
    prevVersionRef.current = queueVersion;

    setIsLoading(data === null);
    getTrainingCharactersOverview()
      .then((result) => {
        setData(result);
        setError(null);
      })
      .catch((err) => setError(String(err)))
      .finally(() => setIsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queueVersion]);

  return { data, isLoading, error };
}
