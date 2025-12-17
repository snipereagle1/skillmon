import { Button } from '@/components/ui/button';
import { useForceRefreshSkillQueue } from '@/hooks/tauri/useForceRefreshSkillQueue';
import { useSkillQueue } from '@/hooks/tauri/useSkillQueue';

import { CharacterQueue } from './CharacterQueue';

interface SkillQueueProps {
  characterId: number | null;
}

export function SkillQueue({ characterId }: SkillQueueProps) {
  const { data: queue, isLoading, error } = useSkillQueue(characterId);
  const forceRefresh = useForceRefreshSkillQueue();

  if (isLoading) {
    return <p className="text-muted-foreground">Loading skill queue...</p>;
  }

  if (error) {
    return (
      <p className="text-destructive">
        Error:{' '}
        {error instanceof Error ? error.message : 'Failed to load skill queue'}
      </p>
    );
  }

  if (!queue) {
    return (
      <p className="text-muted-foreground">
        No skill queue found for this character.
      </p>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-end mb-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => characterId && forceRefresh.mutate(characterId)}
          disabled={forceRefresh.isPending || !characterId}
        >
          {forceRefresh.isPending ? 'Refreshing...' : 'Refresh'}
        </Button>
      </div>
      <div className="flex-1 min-h-0">
        <CharacterQueue queue={queue} />
      </div>
    </div>
  );
}
