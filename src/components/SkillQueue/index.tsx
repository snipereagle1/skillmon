import { useSkillQueue } from '@/hooks/tauri/useSkillQueue';

import { CharacterQueue } from './CharacterQueue';

interface SkillQueueProps {
  characterId: number | null;
}

export function SkillQueue({ characterId }: SkillQueueProps) {
  const { data: queue, isLoading, error } = useSkillQueue(characterId);

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

  return <CharacterQueue queue={queue} characterId={characterId} />;
}
