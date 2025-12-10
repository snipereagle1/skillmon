import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useCharacters } from "@/hooks/tauri/useCharacters";
import { useSkillQueues } from "@/hooks/tauri/useSkillQueues";
import type { CharacterSkillQueue } from "@/types/tauri";
import { CharacterCard } from "./CharacterCard";
import { SkillQueue } from "./SkillQueue";
import { Skills } from "./Skills";
import { Clones } from "./Clones";
import { Attributes } from "./Attributes";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export function CharactersTab() {
  const { data: characters = [], isLoading: isLoadingCharacters, error: charactersError } = useCharacters();
  const { data: skillQueues = [], isLoading: isLoadingQueues } = useSkillQueues();
  const [selectedCharacterId, setSelectedCharacterId] = useState<number | null>(null);
  const queryClient = useQueryClient();

  const isLoading = isLoadingCharacters || isLoadingQueues;
  const error = charactersError;

  useEffect(() => {
    if (characters.length > 0 && selectedCharacterId === null) {
      setSelectedCharacterId(characters[0].character_id);
    }
  }, [characters, selectedCharacterId]);

  useEffect(() => {
    let unlistenFn: (() => void) | null = null;
    const setupAuthListener = async () => {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        const unlisten = await listen("auth-success", async () => {
          await new Promise((resolve) => setTimeout(resolve, 500));
          queryClient.invalidateQueries({ queryKey: ["characters"] });
          queryClient.invalidateQueries({ queryKey: ["skillQueues"] });
          queryClient.invalidateQueries({ queryKey: ["clones"] });
          queryClient.invalidateQueries({ queryKey: ["attributes"] });
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
  }, [queryClient]);

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
        <p className="text-destructive">Error: {error instanceof Error ? error.message : "Failed to load characters"}</p>
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
      <div className="flex-1 border rounded-lg overflow-hidden flex flex-col">
        {selectedCharacter ? (
          <Tabs defaultValue="skill-queue" className="flex flex-col flex-1 overflow-hidden">
            <div className="border-b px-4 pt-2">
              <TabsList>
                <TabsTrigger value="skill-queue">Skill Queue</TabsTrigger>
                <TabsTrigger value="skills">Skills</TabsTrigger>
                <TabsTrigger value="clones">Clones</TabsTrigger>
                <TabsTrigger value="attributes">Attributes</TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value="skill-queue" className="flex-1 overflow-auto p-4 m-0">
              <SkillQueue characterId={selectedCharacterId} />
            </TabsContent>
            <TabsContent value="skills" className="flex-1 overflow-hidden m-0">
              <Skills characterId={selectedCharacterId} />
            </TabsContent>
            <TabsContent value="clones" className="flex-1 overflow-hidden m-0">
              <Clones characterId={selectedCharacterId} />
            </TabsContent>
            <TabsContent value="attributes" className="flex-1 overflow-hidden m-0">
              <Attributes characterId={selectedCharacterId} />
            </TabsContent>
          </Tabs>
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-muted-foreground">Select a character to view skill queue</p>
          </div>
        )}
      </div>
    </div>
  );
}

