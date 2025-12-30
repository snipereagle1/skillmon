import { Check, OmegaIcon } from 'lucide-react';
import { useState } from 'react';
import { match, P } from 'ts-pattern';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useSkillDetails } from '@/hooks/tauri/useSkillDetails';
import { cn } from '@/lib/utils';

import { Sheet, SheetContent, SheetHeader, SheetTitle } from './ui/sheet';

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

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[400px]! max-w-[400px]! sm:w-[540px]! sm:max-w-[540px]!">
        <div className="mx-auto w-full h-full flex flex-col min-h-0">
          {match({ isLoading, error, data })
            .with({ isLoading: true }, () => (
              <div className="flex items-center justify-center p-8">
                <p className="text-muted-foreground">
                  Loading skill details...
                </p>
              </div>
            ))
            .with({ isLoading: false, error: P.not(null) }, ({ error }) => (
              <div className="flex items-center justify-center p-8">
                <p className="text-destructive">
                  Error:{' '}
                  {error instanceof Error
                    ? error.message
                    : 'Failed to load skill details'}
                </p>
              </div>
            ))
            .with({ isLoading: false, data: P.nullish }, () => (
              <div className="flex items-center justify-center p-8">
                <p className="text-muted-foreground">No skill data available</p>
              </div>
            ))
            .with({ isLoading: false, data: P.not(P.nullish) }, ({ data }) => (
              <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
                <SheetHeader className="shrink-0 pb-2">
                  <SheetTitle className="text-xl flex items-center gap-2">
                    {data.skill_name}
                    {data.requires_omega && (
                      <OmegaIcon className="w-4 h-4 text-yellow-500" />
                    )}
                  </SheetTitle>
                  <p className="text-sm text-muted-foreground">
                    {data.group_name}
                    {data.category_id === 16 && ' > Skills'}
                  </p>
                </SheetHeader>

                <Tabs
                  defaultValue="description"
                  className="flex flex-col flex-1 overflow-hidden"
                >
                  <TabsList className="w-full px-4 rounded-none">
                    <TabsTrigger value="description">Description</TabsTrigger>
                    <TabsTrigger value="attributes">Attributes</TabsTrigger>
                    <TabsTrigger value="requirements">Requirements</TabsTrigger>
                    <TabsTrigger value="required-for">Required For</TabsTrigger>
                  </TabsList>

                  <div className="flex-1 overflow-y-auto px-4">
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
                        {data.attributes.volume && (
                          <div className="flex items-center justify-between py-2 border-b">
                            <span className="text-sm font-medium">Volume</span>
                            <span className="text-sm text-muted-foreground">
                              {data.attributes.volume.toFixed(2)} m³
                            </span>
                          </div>
                        )}
                        {data.attributes.rank !== null && (
                          <div className="flex items-center justify-between py-2 border-b">
                            <span className="text-sm font-medium">
                              Training time multiplier
                            </span>
                            <span className="text-sm text-muted-foreground">
                              {data.attributes.rank}×
                            </span>
                          </div>
                        )}
                        {data.attributes.training_speed_sp_per_hour && (
                          <div className="flex items-center justify-between py-2 border-b">
                            <span className="text-sm font-medium">
                              Training speed
                            </span>
                            <span className="text-sm text-muted-foreground">
                              {`${data.attributes.training_speed_sp_per_hour} SP/hr`}
                            </span>
                          </div>
                        )}
                        {data.attributes.bonuses.map((bonus) => {
                          const isPercentage = bonus.unit_id === 9;
                          return (
                            <div
                              key={bonus.attribute_id}
                              className="flex items-center justify-between py-2 border-b"
                            >
                              <span className="text-sm font-medium">
                                {bonus.attribute_name}
                              </span>
                              <span className="text-sm text-muted-foreground">
                                {bonus.value}
                                {isPercentage ? '%' : ''}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </TabsContent>

                    <TabsContent value="requirements" className="m-0">
                      <div className="space-y-4">
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
                                <span className="text-sm font-medium">
                                  {req.required_skill_name}
                                </span>
                              </div>
                              <div className="flex gap-1">
                                {[1, 2, 3, 4, 5].map((level) => {
                                  const className = match({
                                    levelMet: level <= req.required_level,
                                    isMet: req.is_met,
                                  })
                                    .with(
                                      { levelMet: true, isMet: true },
                                      () => 'bg-white border-white'
                                    )
                                    .with(
                                      { levelMet: true, isMet: false },
                                      () => 'bg-yellow-500 border-yellow-500'
                                    )
                                    .with(
                                      { levelMet: false },
                                      () => 'bg-muted border-border'
                                    )
                                    .exhaustive();

                                  return (
                                    <div
                                      key={level}
                                      className={cn(
                                        'w-4 h-4 border rounded-sm',
                                        className
                                      )}
                                    />
                                  );
                                })}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </TabsContent>

                    <TabsContent value="required-for" className="m-0">
                      <div className="space-y-4">
                        {/* Level tabs */}
                        <div className="flex gap-2 mb-0">
                          {[1, 2, 3, 4, 5].map((level) => {
                            const hasItems = data.required_for.some(
                              (item) => item.required_level === level
                            );
                            const buttonClassName = match([
                              hasItems,
                              selectedLevel === level,
                            ] as const)
                              .with(
                                [false, P._],
                                () =>
                                  'opacity-50 cursor-not-allowed text-muted-foreground'
                              )
                              .with(
                                [true, true],
                                () => 'bg-primary text-primary-foreground'
                              )
                              .with(
                                [true, false],
                                () => 'bg-muted hover:bg-muted/80'
                              )
                              .exhaustive();

                            return (
                              <button
                                key={level}
                                onClick={() =>
                                  hasItems && setSelectedLevel(level)
                                }
                                disabled={!hasItems}
                                className={cn(
                                  'px-3 py-1 text-sm rounded-md transition-colors',
                                  buttonClassName
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
                                {
                                  ['I', 'II', 'III', 'IV', 'V'][
                                    selectedLevel - 1
                                  ]
                                }
                              </p>
                            );
                          }

                          // Group by category name (categories are more generic than groups)
                          // Groups belong to categories (e.g., "Armor Coating" group is in "Module" category)
                          const groupedByCategory = filteredItems.reduce(
                            (acc, item) => {
                              const categoryName =
                                item.category_name || 'Other';
                              if (!acc[categoryName]) {
                                acc[categoryName] = [];
                              }
                              acc[categoryName].push(item);
                              return acc;
                            },
                            {} as Record<string, typeof filteredItems>
                          );

                          return (
                            <Accordion type="multiple" className="w-full">
                              {Object.entries(groupedByCategory)
                                .sort(([a], [b]) => a.localeCompare(b))
                                .map(([categoryName, items]) => (
                                  <AccordionItem
                                    key={categoryName}
                                    value={categoryName}
                                  >
                                    <AccordionTrigger className="text-sm font-semibold">
                                      {categoryName}
                                    </AccordionTrigger>
                                    <AccordionContent>
                                      <div className="space-y-1">
                                        {items
                                          .sort((a, b) => {
                                            // First sort by group name
                                            const groupCompare =
                                              a.group_name.localeCompare(
                                                b.group_name
                                              );
                                            if (groupCompare !== 0) {
                                              return groupCompare;
                                            }
                                            // Then sort alphabetically by type name
                                            return a.type_name.localeCompare(
                                              b.type_name
                                            );
                                          })
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
                                    </AccordionContent>
                                  </AccordionItem>
                                ))}
                            </Accordion>
                          );
                        })()}
                      </div>
                    </TabsContent>
                  </div>
                </Tabs>
              </div>
            ))
            .exhaustive()}
        </div>
      </SheetContent>
    </Sheet>
  );
}
