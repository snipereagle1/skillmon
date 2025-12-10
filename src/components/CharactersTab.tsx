import { useEffect, useState, useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { useCharacters } from "@/hooks/tauri/useCharacters";
import { useCharacterSkills } from "@/hooks/tauri/useCharacterSkills";
import type { CharacterSkillQueue } from "@/types/tauri";
import { CharacterCard } from "./CharacterCard";
import { SkillQueue } from "./SkillQueue";
import { Skills } from "./Skills";
import { Clones } from "./Clones";
import { Attributes } from "./Attributes";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export function CharactersTab() {
  const { data: characters = [], isLoading: isLoadingCharacters, error: charactersError } = useCharacters();
  const [selectedCharacterId, setSelectedCharacterId] = useState<number | null>(null);
  const { data: characterSkills } = useCharacterSkills(selectedCharacterId);

  const skillQueueQueriesConfig = useMemo(
    () =>
      characters.map((character) => ({
        queryKey: ["skillQueue", character.character_id] as const,
        queryFn: async (): Promise<CharacterSkillQueue> => {
          const { invoke } = await import("@tauri-apps/api/core");
          return await invoke<CharacterSkillQueue>("get_skill_queue_for_character", {
            characterId: character.character_id,
          });
        },
        refetchInterval: character.character_id === selectedCharacterId ? 60_000 : 600_000,
      })),
    [characters, selectedCharacterId]
  );

  const skillQueueQueries = useQueries({
    queries: skillQueueQueriesConfig,
  });

  const skillQueues: CharacterSkillQueue[] = skillQueueQueries.map((query) => query.data).filter((q): q is CharacterSkillQueue => q !== undefined);
  const isLoadingQueues = skillQueueQueries.some((query) => query.isLoading);

  const isLoading = isLoadingCharacters || isLoadingQueues;
  const error = charactersError;

  useEffect(() => {
    if (characters.length > 0 && selectedCharacterId === null) {
      setSelectedCharacterId(characters[0].character_id);
    }
  }, [characters, selectedCharacterId]);

  const selectedCharacter = characters.find(
    (c) => c.character_id === selectedCharacterId
  );
  const selectedSkillQueue = skillQueues.find(
    (q) => q.character_id === selectedCharacterId
  );

  const totalSkillpoints = useMemo(() => {
    if (!characterSkills || !selectedSkillQueue) {
      return null;
    }
    const skillsSP = characterSkills.skills.reduce(
      (sum, skill) => sum + skill.skillpoints_in_skill,
      0
    );
    const unallocatedSP = selectedSkillQueue.unallocated_sp ?? 0;
    return skillsSP + unallocatedSP;
  }, [characterSkills, selectedSkillQueue]);

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
              const queue = skillQueueQueries
                .find((q) => q.data?.character_id === character.character_id)
                ?.data;
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
            <div className="border-b px-4 py-2 flex items-center justify-between">
              <TabsList>
                <TabsTrigger value="skill-queue">Skill Queue</TabsTrigger>
                <TabsTrigger value="skills">Skills</TabsTrigger>
                <TabsTrigger value="clones">Clones</TabsTrigger>
                <TabsTrigger value="attributes">Attributes</TabsTrigger>
              </TabsList>
              {totalSkillpoints !== null && (
                <span className="text-sm text-muted-foreground">
                  {totalSkillpoints.toLocaleString('en-US')} total skillpoints
                </span>
              )}
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

