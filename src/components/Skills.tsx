import { X } from 'lucide-react';
import { startTransition, useEffect, useMemo, useRef, useState } from 'react';
import { match, P } from 'ts-pattern';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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

  useEffect(() => {
    if (data && selectedGroupId === null && !hasInitializedRef.current) {
      hasInitializedRef.current = true;
      const groupWithSkills = data.groups.find((g) => g.has_trained_skills);
      const defaultGroup = groupWithSkills || data.groups[0];
      if (defaultGroup) {
        startTransition(() => {
          setSelectedGroupId(defaultGroup.group_id);
        });
      }
    }
  }, [data, selectedGroupId]);

  // Calculate planned levels per group
  const plannedLevelsPerGroup = useMemo(() => {
    if (!plannedSkills || !data) return new Map<number, number>();
    const map = new Map<number, number>();
    data.skills.forEach((skill) => {
      const plannedLevel = plannedSkills.get(skill.skill_id) || 0;
      if (plannedLevel > 0) {
        map.set(skill.group_id, (map.get(skill.group_id) || 0) + plannedLevel);
      }
    });
    return map;
  }, [plannedSkills, data]);

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

  if (!data) {
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
      data.skills.filter((s) =>
        s.skill_name.toLowerCase().includes(q.toLowerCase())
      )
    )
    .with({ selectedGroupId: P.select(P.not(null)) }, (id) =>
      data.skills.filter((s) => s.group_id === id)
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
    <div className="@container flex flex-col h-full min-h-0">
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
          {data.groups.map((group) => (
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
