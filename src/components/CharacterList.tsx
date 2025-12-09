import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface Character {
  character_id: number;
  character_name: string;
}

export function CharacterList() {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadCharacters = async () => {
    setIsLoading(true);
    setError(null);
    try {
      console.log("CharacterList: Loading characters...");
      const chars = await invoke<Character[]>("get_characters");
      console.log("CharacterList: Loaded characters:", chars);
      setCharacters(chars);
    } catch (err) {
      console.error("CharacterList: Error loading characters:", err);
      setError(err instanceof Error ? err.message : "Failed to load characters");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadCharacters();

    // Listen for auth success events to refresh the list
    let unlistenFn: (() => void) | null = null;

    const setupAuthListener = async () => {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        console.log("CharacterList: Setting up auth-success listener...");
        const unlisten = await listen("auth-success", async (event) => {
          console.log("CharacterList: ===== AUTH SUCCESS EVENT RECEIVED =====");
          console.log("CharacterList: Full event object:", JSON.stringify(event, null, 2));
          console.log("CharacterList: Character ID:", event.payload);
          console.log("CharacterList: Refreshing character list...");
          // Small delay to ensure database write is complete
          await new Promise(resolve => setTimeout(resolve, 500));
          console.log("CharacterList: Delay complete, loading characters...");
          await loadCharacters();
          console.log("CharacterList: ===== Character list refreshed =====");
        });
        console.log("CharacterList: Auth listener set up successfully, waiting for events...");
        unlistenFn = unlisten;
      } catch (error) {
        console.error("CharacterList: Failed to setup auth listener:", error);
        console.error("CharacterList: Error details:", error);
        // If we're not in Tauri, this is expected - just log and continue
        if (error instanceof Error && error.message.includes("Tauri")) {
          console.log("CharacterList: Not in Tauri environment (expected in browser dev)");
        }
      }
    };

    setupAuthListener();

    return () => {
      if (unlistenFn) {
        unlistenFn();
      }
    };
  }, []);

  const handleLogout = async (characterId: number) => {
    try {
      await invoke("logout_character", { characterId });
      await loadCharacters();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to logout character");
    }
  };

  if (isLoading) {
    return <p>Loading characters...</p>;
  }

  if (error) {
    return <p className="text-red-600">Error: {error}</p>;
  }

  if (characters.length === 0) {
    return <p>No characters authenticated yet.</p>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold">Authenticated Characters</h2>
        <button
          onClick={loadCharacters}
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


