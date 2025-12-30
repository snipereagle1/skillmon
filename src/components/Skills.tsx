import { X } from 'lucide-react';
import { startTransition, useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCharacterSkills } from '@/hooks/tauri/useCharacterSkills';

import { SkillCategoryItem } from './SkillCategoryItem';
import { SkillDetail } from './SkillDetail';
import { SkillItem } from './SkillItem';

interface SkillsProps {
  characterId: number | null;
}

export function Skills({ characterId }: SkillsProps) {
  const { data, isLoading, error } = useCharacterSkills(characterId);
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedSkillId, setSelectedSkillId] = useState<number | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
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

  const selectedGroup = data.groups.find((g) => g.group_id === selectedGroupId);

  // Filter skills based on search query or selected group
  const filteredSkills = searchQuery.trim()
    ? data.skills.filter((s) =>
        s.skill_name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : selectedGroupId !== null
      ? data.skills.filter((s) => s.group_id === selectedGroupId)
      : [];

  const sortedSkills = filteredSkills.sort((a, b) =>
    a.skill_name.localeCompare(b.skill_name)
  );

  // Split skills into 2 columns (fill vertically, not horizontally)
  const skillsPerColumn = Math.ceil(sortedSkills.length / 2);
  const skillsColumn1 = sortedSkills.slice(0, skillsPerColumn);
  const skillsColumn2 = sortedSkills.slice(skillsPerColumn);

  // Split groups into 3 columns
  const groupsPerColumn = Math.ceil(data.groups.length / 3);
  const column1 = data.groups.slice(0, groupsPerColumn);
  const column2 = data.groups.slice(groupsPerColumn, groupsPerColumn * 2);
  const column3 = data.groups.slice(groupsPerColumn * 2);

  const handleCategoryClick = (groupId: number) => {
    setSearchQuery('');
    setSelectedGroupId(groupId);
  };

  const handleSkillClick = (skillId: number) => {
    setSelectedSkillId(skillId);
    setDrawerOpen(true);
  };

  return (
    <div className="flex flex-col h-full min-h-0">
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
        <div className="grid grid-cols-3 gap-1.5">
          <div className="space-y-1">
            {column1.map((group) => (
              <SkillCategoryItem
                key={group.group_id}
                group={group}
                isSelected={group.group_id === selectedGroupId}
                onClick={() => handleCategoryClick(group.group_id)}
              />
            ))}
          </div>
          <div className="space-y-1">
            {column2.map((group) => (
              <SkillCategoryItem
                key={group.group_id}
                group={group}
                isSelected={group.group_id === selectedGroupId}
                onClick={() => handleCategoryClick(group.group_id)}
              />
            ))}
          </div>
          <div className="space-y-1">
            {column3.map((group) => (
              <SkillCategoryItem
                key={group.group_id}
                group={group}
                isSelected={group.group_id === selectedGroupId}
                onClick={() => handleCategoryClick(group.group_id)}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Bottom section: Skills */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4">
        {searchQuery.trim() ? (
          sortedSkills.length === 0 ? (
            <div className="flex items-center justify-center h-32">
              <p className="text-muted-foreground">
                No skills found matching &quot;{searchQuery}&quot;
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
              <div className="space-y-2">
                {skillsColumn1.map((skill) => (
                  <SkillItem
                    key={skill.skill_id}
                    skill={skill}
                    onClick={() => handleSkillClick(skill.skill_id)}
                  />
                ))}
              </div>
              <div className="space-y-2">
                {skillsColumn2.map((skill) => (
                  <SkillItem
                    key={skill.skill_id}
                    skill={skill}
                    onClick={() => handleSkillClick(skill.skill_id)}
                  />
                ))}
              </div>
            </div>
          )
        ) : selectedGroup ? (
          sortedSkills.length === 0 ? (
            <div className="flex items-center justify-center h-32">
              <p className="text-muted-foreground">No skills in this group</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
              <div className="space-y-2">
                {skillsColumn1.map((skill) => (
                  <SkillItem
                    key={skill.skill_id}
                    skill={skill}
                    onClick={() => handleSkillClick(skill.skill_id)}
                  />
                ))}
              </div>
              <div className="space-y-2">
                {skillsColumn2.map((skill) => (
                  <SkillItem
                    key={skill.skill_id}
                    skill={skill}
                    onClick={() => handleSkillClick(skill.skill_id)}
                  />
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

      <SkillDetail
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        skillId={selectedSkillId}
        characterId={characterId}
      />
    </div>
  );
}
