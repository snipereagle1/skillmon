import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useCharacterSkills } from "@/hooks/tauri/useCharacterSkills";
import { SkillCategoryItem } from "./SkillCategoryItem";
import { SkillItem } from "./SkillItem";
import type { SkillGroup } from "@/types/tauri";

interface SkillsProps {
  characterId: number | null;
}

export function Skills({ characterId }: SkillsProps) {
  const { data, isLoading, error } = useCharacterSkills(characterId);
  const queryClient = useQueryClient();
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);

  useEffect(() => {
    let unlistenFn: (() => void) | null = null;
    const setupListener = async () => {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        const unlisten = await listen("auth-success", async () => {
          await new Promise((resolve) => setTimeout(resolve, 500));
          queryClient.invalidateQueries({ queryKey: ["characterSkills"] });
        });
        unlistenFn = unlisten;
      } catch (error) {
        console.error("Failed to setup listener:", error);
      }
    };

    setupListener();

    return () => {
      if (unlistenFn) unlistenFn();
    };
  }, [queryClient]);

  // Set default selected group
  useEffect(() => {
    if (data && selectedGroupId === null) {
      // Find first group with trained skills, or first group
      const groupWithSkills = data.groups.find((g) => g.has_trained_skills);
      const defaultGroup = groupWithSkills || data.groups[0];
      if (defaultGroup) {
        setSelectedGroupId(defaultGroup.group_id);
      }
    }
  }, [data, selectedGroupId]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Loading skills...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-destructive">
          Error: {error instanceof Error ? error.message : "Failed to load skills"}
        </p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">No skill data available</p>
      </div>
    );
  }

  const selectedGroup = data.groups.find((g) => g.group_id === selectedGroupId);
  const skillsInGroup = data.skills
    .filter((s) => s.group_id === selectedGroupId)
    .sort((a, b) => a.skill_name.localeCompare(b.skill_name));

  // Split skills into 2 columns (fill vertically, not horizontally)
  const skillsPerColumn = Math.ceil(skillsInGroup.length / 2);
  const skillsColumn1 = skillsInGroup.slice(0, skillsPerColumn);
  const skillsColumn2 = skillsInGroup.slice(skillsPerColumn);

  // Split groups into 3 columns
  const groupsPerColumn = Math.ceil(data.groups.length / 3);
  const column1 = data.groups.slice(0, groupsPerColumn);
  const column2 = data.groups.slice(groupsPerColumn, groupsPerColumn * 2);
  const column3 = data.groups.slice(groupsPerColumn * 2);

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Top section: Skill groups */}
      <div className="border-b border-border p-2 flex-shrink-0 overflow-y-auto max-h-[40vh]">
        <div className="grid grid-cols-3 gap-1.5">
          <div className="space-y-1">
            {column1.map((group) => (
              <SkillCategoryItem
                key={group.group_id}
                group={group}
                isSelected={group.group_id === selectedGroupId}
                onClick={() => setSelectedGroupId(group.group_id)}
              />
            ))}
          </div>
          <div className="space-y-1">
            {column2.map((group) => (
              <SkillCategoryItem
                key={group.group_id}
                group={group}
                isSelected={group.group_id === selectedGroupId}
                onClick={() => setSelectedGroupId(group.group_id)}
              />
            ))}
          </div>
          <div className="space-y-1">
            {column3.map((group) => (
              <SkillCategoryItem
                key={group.group_id}
                group={group}
                isSelected={group.group_id === selectedGroupId}
                onClick={() => setSelectedGroupId(group.group_id)}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Bottom section: Skills in selected group */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4">
        {selectedGroup ? (
          skillsInGroup.length === 0 ? (
            <div className="flex items-center justify-center h-32">
              <p className="text-muted-foreground">No skills in this group</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
              <div className="space-y-2">
                {skillsColumn1.map((skill) => (
                  <SkillItem key={skill.skill_id} skill={skill} />
                ))}
              </div>
              <div className="space-y-2">
                {skillsColumn2.map((skill) => (
                  <SkillItem key={skill.skill_id} skill={skill} />
                ))}
              </div>
            </div>
          )
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-muted-foreground">Select a skill group</p>
          </div>
        )}
      </div>
    </div>
  );
}

