import type { LocationPayload } from '@/generated/types';
import { useEsiStore } from '@/stores/esiStore';

export function useAllCharactersLocations(): {
  data: LocationPayload[];
  isLoading: boolean;
  error: string | null;
} {
  const locations = useEsiStore((state) => state.locations);

  const entries = Object.values(locations);
  const data = entries
    .map((s) => s.data)
    .filter((d): d is LocationPayload => d !== null);
  const hasError = entries.find((s) => s.lastError !== null);

  return {
    data,
    isLoading: entries.length === 0,
    error: hasError?.lastError ?? null,
  };
}
