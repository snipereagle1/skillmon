import { useQueryClient } from '@tanstack/react-query';
import { useCharacters } from '@/hooks/tauri/useCharacters';
import { useLogoutCharacter } from '@/hooks/tauri/useLogoutCharacter';

export function CharacterList() {
  const { data: characters = [], isLoading, error } = useCharacters();
  const logoutMutation = useLogoutCharacter();
  const queryClient = useQueryClient();

  const handleLogout = async (characterId: number) => {
    try {
      await logoutMutation.mutateAsync(characterId);
    } catch (err) {
      console.error('Failed to logout character:', err);
    }
  };

  if (isLoading) {
    return <p>Loading characters...</p>;
  }

  if (error) {
    return (
      <p className="text-red-600">
        Error:{' '}
        {error instanceof Error ? error.message : 'Failed to load characters'}
      </p>
    );
  }

  if (characters.length === 0) {
    return <p>No characters authenticated yet.</p>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold">Authenticated Characters</h2>
        <button
          onClick={() =>
            queryClient.invalidateQueries({ queryKey: ['characters'] })
          }
          className="px-3 py-1 bg-gray-600 text-white rounded hover:bg-gray-700 text-sm"
        >
          Refresh
        </button>
      </div>
      <ul className="space-y-2">
        {characters.map((char) => (
          <li
            key={char.character_id}
            className="flex items-center justify-between p-3 border rounded"
          >
            <span>{char.character_name}</span>
            <button
              onClick={() => handleLogout(char.character_id)}
              className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 text-sm"
            >
              Logout
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
