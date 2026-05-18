import { X } from 'lucide-react';
import { startTransition, useEffect, useMemo, useRef, useState } from 'react';
import { match, P } from 'ts-pattern';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type {
  CharacterSkillResponse,
  CharacterSkillsResponse,
  SkillGroupResponse,
  SkillsPayload,
} from '@/generated/types';
import { useCharacterSkills } from '@/hooks/tauri/useCharacterSkills';
import { useSdeSkills } from '@/hooks/tauri/useSdeSkills';
import { useSkillDetailStore } from '@/stores/skillDetailStore';

import { SkillCategoryItem } from './SkillCategoryItem';
import { SkillItem } from './SkillItem';

interface SkillsProps {
  characterId: number | null;
  plannedSkills?: Map<number, number>; // skillTypeId -> max planned level
  onAddSkill?: (skillTypeId: number, level: number) => void;
}

export function Skills({
  characterId,
  plannedSkills,
  onAddSkill,
}: SkillsProps) {
  const charSkillsQuery = useCharacterSkills(characterId);
  const sdeSkillsQuery = useSdeSkills();

  // Use SDE skills if characterId is null, otherwise use character skills
  const isSdeMode = characterId === null;
  const { data, isLoading, error } = isSdeMode
    ? sdeSkillsQuery
    : charSkillsQuery;

  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const openSkillDetail = useSkillDetailStore(
    (state: {
      openSkillDetail: (skillId: number, characterId: number | null) => void;
    }) => state.openSkillDetail
  );
  const hasInitializedRef = useRef(false);
  const normalizedData = useMemo(() => {
    if (!data) return null;
    if (isSdeMode) {
      return data as CharacterSkillsResponse;
    }

    const payload = data as SkillsPayload;
    const skills: CharacterSkillResponse[] = payload.skills.map((skill) => ({
      skill_id: skill.skillId,
      skill_name: skill.skillName ?? `Skill ${skill.skillId}`,
      group_id: skill.groupId ?? 0,
      group_name: skill.groupName ?? 'Unknown Group',
      trained_skill_level: skill.trainedSkillLevel,
      active_skill_level: skill.activeSkillLevel,
      skillpoints_in_skill: skill.skillpointsInSkill,
      is_in_queue: skill.isInQueue,
      queue_level: undefined,
      is_injected: skill.isInjected,
    }));

    const groupMap = new Map<number, SkillGroupResponse>();
    for (const skill of skills) {
      const current = groupMap.get(skill.group_id);
      if (current) {
        current.total_levels += 5;
        current.trained_levels += skill.trained_skill_level;
        if (skill.trained_skill_level > 0) current.has_trained_skills = true;
      } else {
        groupMap.set(skill.group_id, {
          group_id: skill.group_id,
          group_name: skill.group_name,
          total_levels: 5,
          trained_levels: skill.trained_skill_level,
          has_trained_skills: skill.trained_skill_level > 0,
        });
      }
    }

    return {
      character_id: payload.characterId,
      skills,
      groups: Array.from(groupMap.values()).sort((a, b) =>
        a.group_name.localeCompare(b.group_name)
      ),
    } satisfies CharacterSkillsResponse;
  }, [data, isSdeMode]);

  useEffect(() => {
    if (
      normalizedData &&
      selectedGroupId === null &&
      !hasInitializedRef.current
    ) {
      hasInitializedRef.current = true;
      const groupWithSkills = normalizedData.groups.find(
        (g) => g.has_trained_skills
      );
      const defaultGroup = groupWithSkills || normalizedData.groups[0];
      if (defaultGroup) {
        startTransition(() => {
          setSelectedGroupId(defaultGroup.group_id);
        });
      }
    }
  }, [normalizedData, selectedGroupId]);

  // Calculate planned levels per group
  const plannedLevelsPerGroup = useMemo(() => {
    if (!plannedSkills || !normalizedData) return new Map<number, number>();
    const map = new Map<number, number>();
    normalizedData.skills.forEach((skill) => {
      const plannedLevel = plannedSkills.get(skill.skill_id) || 0;
      if (plannedLevel > 0) {
        map.set(skill.group_id, (map.get(skill.group_id) || 0) + plannedLevel);
      }
    });
    return map;
  }, [plannedSkills, normalizedData]);

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
          Error:{' '}
          {error instanceof Error ? error.message : 'Failed to load skills'}
        </p>
      </div>
    );
  }

  if (!normalizedData) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">No skill data available</p>
      </div>
    );
  }

  // Filter skills based on search query or selected group
  const filteredSkills = match({
    searchQuery: searchQuery.trim(),
    selectedGroupId,
  })
    .with({ searchQuery: P.select(P.when((q: string) => q.length > 0)) }, (q) =>
      normalizedData.skills.filter((s) =>
        s.skill_name.toLowerCase().includes(q.toLowerCase())
      )
    )
    .with({ selectedGroupId: P.select(P.not(null)) }, (id) =>
      normalizedData.skills.filter((s) => s.group_id === id)
    )
    .otherwise(() => []);

  const sortedSkills = filteredSkills.sort((a, b) =>
    a.skill_name.localeCompare(b.skill_name)
  );

  const handleCategoryClick = (groupId: number) => {
    setSearchQuery('');
    setSelectedGroupId(groupId);
  };

  const handleSkillClick = (skillId: number) => {
    openSkillDetail(skillId, characterId);
  };

  const renderSkillList = () => {
    if (sortedSkills.length === 0) {
      return (
        <div className="flex items-center justify-center h-32">
          <p className="text-muted-foreground">
            {searchQuery.trim()
              ? `No skills found matching "${searchQuery}"`
              : 'No skills in this group'}
          </p>
        </div>
      );
    }

    return (
      <div className="columns-1 @[520px]:columns-2 gap-4">
        {sortedSkills.map((skill) => (
          <div key={skill.skill_id} className="break-inside-avoid mb-2">
            <SkillItem
              skill={skill}
              onClick={() => handleSkillClick(skill.skill_id)}
              plannedLevel={plannedSkills?.get(skill.skill_id)}
              onAddStep={
                onAddSkill
                  ? (level) => onAddSkill(skill.skill_id, level)
                  : undefined
              }
            />
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="@container flex flex-col h-full min-h-0 bg-card">
      {/* Search section */}
      <div className="border-b border-border p-2 shrink-0">
        <div className="relative">
          <Input
            type="text"
            placeholder="Search skills..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pr-9"
          />
          {searchQuery && (
            <Button
              variant="ghost"
              size="icon-sm"
              className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
              onClick={() => setSearchQuery('')}
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Top section: Skill groups */}
      <div className="border-b border-border p-2 shrink-0 overflow-y-auto max-h-[40vh]">
        <div className="columns-1 @[520px]:columns-2 @[865px]:columns-3 gap-1.5">
          {normalizedData.groups.map((group) => (
            <div key={group.group_id} className="break-inside-avoid mb-1.5">
              <SkillCategoryItem
                group={group}
                isSelected={group.group_id === selectedGroupId}
                onClick={() => handleCategoryClick(group.group_id)}
                plannedLevels={plannedLevelsPerGroup.get(group.group_id)}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Bottom section: Skills */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4">
        {match({ searchQuery: searchQuery.trim(), selectedGroupId })
          .with(
            { searchQuery: P.select(P.when((q: string) => q.length > 0)) },
            () => renderSkillList()
          )
          .with({ selectedGroupId: P.select(P.not(null)) }, () =>
            renderSkillList()
          )
          .otherwise(() => (
            <div className="flex items-center justify-center h-full">
              <p className="text-muted-foreground">Select a skill group</p>
            </div>
          ))}
      </div>
    </div>
  );
}
