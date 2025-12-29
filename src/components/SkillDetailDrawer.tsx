import { Check } from 'lucide-react';
import { useState } from 'react';

import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useSkillDetails } from '@/hooks/tauri/useSkillDetails';
import { cn } from '@/lib/utils';

interface SkillDetailDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  skillId: number | null;
  characterId: number | null;
}

export function SkillDetailDrawer({
  open,
  onOpenChange,
  skillId,
  characterId,
}: SkillDetailDrawerProps) {
  const { data, isLoading, error } = useSkillDetails(skillId, characterId);
  const [selectedLevel, setSelectedLevel] = useState<number>(1);

  if (!skillId) {
    return null;
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="min-h-[50vh] max-h-[90vh]">
        <div className="max-w-[800px] mx-auto w-full h-full flex flex-col min-h-0">
          {isLoading ? (
            <div className="flex items-center justify-center p-8">
              <p className="text-muted-foreground">Loading skill details...</p>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center p-8">
              <p className="text-destructive">
                Error:{' '}
                {error instanceof Error
                  ? error.message
                  : 'Failed to load skill details'}
              </p>
            </div>
          ) : !data ? (
            <div className="flex items-center justify-center p-8">
              <p className="text-muted-foreground">No skill data available</p>
            </div>
          ) : (
            <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
              <DrawerHeader className="border-b shrink-0">
                <DrawerTitle className="text-xl">{data.skill_name}</DrawerTitle>
                <p className="text-sm text-muted-foreground">
                  {data.group_name}
                  {data.category_id === 16 && ' > Skills'}
                </p>
                {/* Skill level indicators */}
                <div className="flex gap-1 mt-2">
                  {[1, 2, 3, 4, 5].map((level) => (
                    <div
                      key={level}
                      className="w-6 h-6 border border-border rounded-sm bg-muted flex items-center justify-center text-xs"
                    >
                      {level}
                    </div>
                  ))}
                </div>
              </DrawerHeader>

              <Tabs
                defaultValue="description"
                className="flex flex-col flex-1 overflow-hidden"
              >
                <div className="border-b px-4 shrink-0">
                  <TabsList>
                    <TabsTrigger value="description">Description</TabsTrigger>
                    <TabsTrigger value="attributes">Attributes</TabsTrigger>
                    <TabsTrigger value="requirements">Requirements</TabsTrigger>
                    <TabsTrigger value="required-for">Required For</TabsTrigger>
                  </TabsList>
                </div>

                <div className="flex-1 overflow-y-auto p-4">
                  <TabsContent value="description" className="m-0">
                    <div className="space-y-4">
                      <p className="text-sm text-muted-foreground">
                        {data.description || 'No description available.'}
                      </p>
                    </div>
                  </TabsContent>

                  <TabsContent value="attributes" className="m-0">
                    <div className="space-y-4">
                      {data.attributes.primary_attribute && (
                        <div className="flex items-center justify-between py-2 border-b">
                          <span className="text-sm font-medium">
                            Primary attribute
                          </span>
                          <span className="text-sm text-muted-foreground">
                            {data.attributes.primary_attribute.name}
                          </span>
                        </div>
                      )}
                      {data.attributes.secondary_attribute && (
                        <div className="flex items-center justify-between py-2 border-b">
                          <span className="text-sm font-medium">
                            Secondary attribute
                          </span>
                          <span className="text-sm text-muted-foreground">
                            {data.attributes.secondary_attribute.name}
                          </span>
                        </div>
                      )}
                      {data.attributes.volume !== null &&
                        data.attributes.volume !== undefined && (
                          <div className="flex items-center justify-between py-2 border-b">
                            <span className="text-sm font-medium">Volume</span>
                            <span className="text-sm text-muted-foreground">
                              {data.attributes.volume.toFixed(2)} m³
                            </span>
                          </div>
                        )}
                      {data.attributes.rank !== null &&
                        data.attributes.rank !== undefined && (
                          <div className="flex items-center justify-between py-2 border-b">
                            <span className="text-sm font-medium">
                              Training time multiplier
                            </span>
                            <span className="text-sm text-muted-foreground">
                              {data.attributes.rank * 10} ×
                            </span>
                          </div>
                        )}
                      {data.attributes.bonuses.map((bonus) => (
                        <div
                          key={bonus.attribute_id}
                          className="flex items-center justify-between py-2 border-b"
                        >
                          <span className="text-sm font-medium">
                            {bonus.attribute_name}
                          </span>
                          <span className="text-sm text-muted-foreground">
                            {bonus.value > 0 ? '+' : ''}
                            {bonus.value.toFixed(1)}%
                          </span>
                        </div>
                      ))}
                    </div>
                  </TabsContent>

                  <TabsContent value="requirements" className="m-0">
                    <div className="space-y-2">
                      {data.prerequisites.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          No requirements
                        </p>
                      ) : (
                        data.prerequisites.map((req) => (
                          <div
                            key={req.required_skill_id}
                            className="flex items-center justify-between py-2 border-b"
                          >
                            <div className="flex items-center gap-2">
                              {req.is_met && (
                                <Check className="h-4 w-4 text-green-500" />
                              )}
                              <span className="text-sm">
                                {req.required_skill_name}
                              </span>
                            </div>
                            <div className="flex gap-1">
                              {[1, 2, 3, 4, 5].map((level) => (
                                <div
                                  key={level}
                                  className={cn(
                                    'w-4 h-4 border rounded-sm',
                                    level <= req.required_level
                                      ? req.is_met
                                        ? 'bg-white border-white'
                                        : 'bg-yellow-500 border-yellow-500'
                                      : 'bg-muted border-border'
                                  )}
                                />
                              ))}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </TabsContent>

                  <TabsContent value="required-for" className="m-0">
                    <div className="space-y-4">
                      {/* Level tabs */}
                      <div className="flex gap-2 border-b pb-2">
                        {[1, 2, 3, 4, 5].map((level) => {
                          const hasItems = data.required_for.some(
                            (item) => item.required_level === level
                          );
                          return (
                            <button
                              key={level}
                              onClick={() =>
                                hasItems && setSelectedLevel(level)
                              }
                              disabled={!hasItems}
                              className={cn(
                                'px-3 py-1 text-sm rounded-md transition-colors',
                                !hasItems &&
                                  'opacity-50 cursor-not-allowed text-muted-foreground',
                                hasItems &&
                                  selectedLevel === level &&
                                  'bg-primary text-primary-foreground',
                                hasItems &&
                                  selectedLevel !== level &&
                                  'bg-muted hover:bg-muted/80'
                              )}
                            >
                              {['I', 'II', 'III', 'IV', 'V'][level - 1]}
                            </button>
                          );
                        })}
                      </div>

                      {/* Filtered items by level */}
                      {(() => {
                        const filteredItems = data.required_for.filter(
                          (item) => item.required_level === selectedLevel
                        );

                        if (filteredItems.length === 0) {
                          return (
                            <p className="text-sm text-muted-foreground">
                              No items require this skill at level{' '}
                              {['I', 'II', 'III', 'IV', 'V'][selectedLevel - 1]}
                            </p>
                          );
                        }

                        // Group by category
                        const groupedByCategory = filteredItems.reduce(
                          (acc, item) => {
                            const categoryName = item.category_name || 'Other';
                            if (!acc[categoryName]) {
                              acc[categoryName] = [];
                            }
                            acc[categoryName].push(item);
                            return acc;
                          },
                          {} as Record<string, typeof filteredItems>
                        );

                        return (
                          <div className="space-y-4">
                            {Object.entries(groupedByCategory)
                              .sort(([a], [b]) => a.localeCompare(b))
                              .map(([categoryName, items]) => (
                                <div key={categoryName} className="space-y-2">
                                  <h3 className="text-sm font-semibold">
                                    {categoryName}
                                  </h3>
                                  <div className="space-y-1 pl-4">
                                    {items
                                      .sort((a, b) =>
                                        a.type_name.localeCompare(b.type_name)
                                      )
                                      .map((item) => (
                                        <div
                                          key={item.type_id}
                                          className="flex items-center justify-between py-1 text-sm"
                                        >
                                          <span>{item.type_name}</span>
                                          <span className="text-muted-foreground">
                                            {item.group_name}
                                          </span>
                                        </div>
                                      ))}
                                  </div>
                                </div>
                              ))}
                          </div>
                        );
                      })()}
                    </div>
                  </TabsContent>
                </div>
              </Tabs>
            </div>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
