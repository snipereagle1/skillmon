import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { CharacterCard } from "./CharacterCard";
import { SkillQueue } from "./SkillQueue";

interface Character {
  character_id: number;
  character_name: string;
}

interface SkillQueueItem {
  skill_id: number;
  queue_position: number;
  finished_level: number;
  start_date: string | null;
  finish_date: string | null;
  training_start_sp: number | null;
  level_start_sp: number | null;
  level_end_sp: number | null;
}

interface CharacterSkillQueue {
  character_id: number;
  character_name: string;
  skill_queue: SkillQueueItem[];
}

export function CharactersTab() {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [skillQueues, setSkillQueues] = useState<CharacterSkillQueue[]>([]);
  const [selectedCharacterId, setSelectedCharacterId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadCharacters = async () => {
    try {
      const chars = await invoke<Character[]>("get_characters");
      setCharacters(chars);
      setSelectedCharacterId((prev) => {
        if (prev === null && chars.length > 0) {
          return chars[0].character_id;
        }
        return prev;
      });
    } catch (err) {
      console.error("Error loading characters:", err);
      setError(err instanceof Error ? err.message : "Failed to load characters");
    }
  };

  const loadSkillQueues = async () => {
    try {
      const queues = await invoke<CharacterSkillQueue[]>("get_skill_queues");
      setSkillQueues(queues);
    } catch (err) {
      console.error("Error loading skill queues:", err);
    }
  };

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      setError(null);
      await Promise.all([loadCharacters(), loadSkillQueues()]);
      setIsLoading(false);
    };

    loadData();

    let unlistenFn: (() => void) | null = null;
    const setupAuthListener = async () => {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        const unlisten = await listen("auth-success", async () => {
          await new Promise((resolve) => setTimeout(resolve, 500));
          await loadData();
        });
        unlistenFn = unlisten;
      } catch (error) {
        console.error("Failed to setup auth listener:", error);
      }
    };

    setupAuthListener();

    return () => {
      if (unlistenFn) {
        unlistenFn();
      }
    };
  }, []);

  const selectedCharacter = characters.find(
    (c) => c.character_id === selectedCharacterId
  );
  const selectedSkillQueue = skillQueues.find(
    (q) => q.character_id === selectedCharacterId
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Loading characters...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-destructive">Error: {error}</p>
      </div>
    );
  }

  return (
    <div className="flex h-full gap-4">
      <div className="w-64 flex-shrink-0 overflow-y-auto">
        <div className="space-y-2">
          {characters.length === 0 ? (
            <p className="text-muted-foreground p-4">No characters added yet.</p>
          ) : (
            characters.map((character) => {
              const queue = skillQueues.find(
                (q) => q.character_id === character.character_id
              );
              return (
                <CharacterCard
                  key={character.character_id}
                  character={character}
                  skillQueue={queue?.skill_queue}
                  isSelected={character.character_id === selectedCharacterId}
                  onClick={() => setSelectedCharacterId(character.character_id)}
                />
              );
            })
          )}
        </div>
      </div>
      <div className="flex-1 border rounded-lg p-4 overflow-y-auto">
        {selectedCharacter ? (
          <SkillQueue characterId={selectedCharacterId} />
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-muted-foreground">Select a character to view skill queue</p>
          </div>
        )}
      </div>
    </div>
  );
}

