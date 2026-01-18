import { closestCenter, DndContext } from '@dnd-kit/core';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';
import { save } from '@tauri-apps/plugin-dialog';
import { writeTextFile } from '@tauri-apps/plugin-fs';
import { ChevronDown, Copy, Download, Redo2, Undo2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { exportSkillPlanText, exportSkillPlanXml } from '@/generated/commands';
import type { ValidationResponse } from '@/generated/types';
import { usePlanRemaps } from '@/hooks/tauri/useRemaps';
import {
  useExportSkillPlanJson,
  useReorderPlanEntries,
  useSkillPlanWithEntries,
  useUpdateSkillPlan,
  useValidateReorder,
} from '@/hooks/tauri/useSkillPlans';
import { useSortableList } from '@/hooks/useSortableList';
import { useUndoRedo } from '@/hooks/useUndoRedo';

import { AddSkillDialog } from './AddSkillDialog';
import { ImportPlanDialog } from './ImportPlanDialog';
import { PlanComparisonTab } from './PlanComparisonTab';
import { PlanEntryRow } from './PlanEntryRow';
import { PlanRemapRow } from './PlanRemapRow';
import { PlanRemapsTab } from './PlanRemapsTab';
import { SimulationTab } from './SimulationTab';
import { SkillPlanValidationDisplay } from './SkillPlanValidationDisplay';

interface PlanEditorProps {
  planId: number;
}

export function PlanEditor({ planId }: PlanEditorProps) {
  const { data, isLoading, error } = useSkillPlanWithEntries(planId);
  const { data: planRemaps } = usePlanRemaps(planId);
  const reorderMutation = useReorderPlanEntries();
  const validateReorderMutation = useValidateReorder();
  const updatePlanMutation = useUpdateSkillPlan();
  const {
    trackAction,
    undo,
    redo,
    canUndo,
    canRedo,
    isPerformingAction,
    clear,
  } = useUndoRedo();
  const [isEditingName, setIsEditingName] = useState(false);
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [addSkillDialogOpen, setAddSkillDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [isExportingText, setIsExportingText] = useState(false);
  const [isExportingXml, setIsExportingXml] = useState(false);
  const [isCopyingText, setIsCopyingText] = useState(false);
  const [isExportingJson, setIsExportingJson] = useState(false);
  const [proposedValidation, setProposedValidation] =
    useState<ValidationResponse | null>(null);
  const exportJsonMutation = useExportSkillPlanJson();

  const validationMap = useMemo(() => {
    const map = new Map<string, 'error' | 'warning'>();
    if (!proposedValidation) return map;

    proposedValidation.errors.forEach((e) => {
      const key = `${e.node_skill_type_id}-${e.node_level}`;
      map.set(key, 'error');
    });
    proposedValidation.warnings.forEach((w) => {
      const key = `${w.node_skill_type_id}-${w.node_level}`;
      if (!map.has(key)) map.set(key, 'warning');
    });
    return map;
  }, [proposedValidation]);

  const sortedEntries = useMemo(
    () =>
      [...(data?.entries || [])].sort((a, b) => a.sort_order - b.sort_order),
    [data?.entries]
  );

  const {
    localItems,
    sensors,
    handleDragStart,
    handleDragOver,
    handleDragEnd,
    isDragging,
    reset,
  } = useSortableList({
    items: sortedEntries,
    onReorder: async (newOrder) => {
      const oldOrderIds = sortedEntries.map((e) => e.entry_id);
      const newOrderIds = newOrder.map((e) => e.entry_id);

      if (
        oldOrderIds.length === newOrderIds.length &&
        oldOrderIds.every((id, i) => id === newOrderIds[i])
      ) {
        return;
      }

      try {
        await trackAction(
          'Reorder Entries',
          async () => {
            await reorderMutation.mutateAsync({
              planId,
              entryIds: newOrderIds,
            });
          },
          async () => {
            await reorderMutation.mutateAsync({
              planId,
              entryIds: oldOrderIds,
            });
          }
        );
      } catch (err) {
        console.error('Failed to reorder plan entries:', err);
        reset();
        const errorMessage =
          err instanceof Error ? err.message : 'Unknown error';
        toast.error('Failed to reorder', { description: errorMessage });
      }
    },
    getId: (e) => e.entry_id,
  });

  // Clear undo stack when switching plans
  useEffect(() => {
    clear();
  }, [planId, clear]);

  // Keyboard shortcuts for undo/redo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isInput =
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement;

      if (isInput) return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo]);

  // Effect to validate proposed order while dragging
  useEffect(() => {
    if (isDragging) {
      const timeoutId = setTimeout(async () => {
        try {
          const result = await validateReorderMutation.mutateAsync({
            planId,
            entryIds: localItems.map((e) => e.entry_id),
          });
          setProposedValidation(result);
        } catch (err) {
          console.error('Failed to validate proposed order:', err);
        }
      }, 200);
      return () => clearTimeout(timeoutId);
    } else {
      setProposedValidation(null);
    }
  }, [localItems, isDragging, planId, validateReorderMutation]);

  const handleExportJson = async () => {
    if (!data) return;
    setIsExportingJson(true);
    try {
      const planJson = await exportJsonMutation.mutateAsync({ planId });
      const filePath = await save({
        title: 'Save Skill Plan (JSON)',
        defaultPath: `${data.plan.name}.skillmon.json`,
        filters: [{ name: 'Skillmon Plan', extensions: ['json'] }],
      });

      if (filePath) {
        await writeTextFile(filePath, JSON.stringify(planJson, null, 2));
      }
    } catch (err) {
      console.error('Failed to export JSON:', err);
      toast.error('Failed to export JSON');
    } finally {
      setIsExportingJson(false);
    }
  };

  const handleExportText = async () => {
    if (!data) {
      console.log('No data available for export');
      return;
    }
    console.log('Starting text export...');
    setIsExportingText(true);
    try {
      console.log('Fetching plan text...');
      const text = await exportSkillPlanText({ planId });
      console.log('Plan text fetched, opening save dialog...');
      const filePath = await save({
        title: 'Save Skill Plan',
        defaultPath: `${data.plan.name}.txt`,
        filters: [
          { name: 'Text Files', extensions: ['txt'] },
          { name: 'All Files', extensions: ['*'] },
        ],
      });
      console.log('Save dialog result:', filePath);

      if (filePath) {
        console.log('Writing file to:', filePath);
        await writeTextFile(filePath, text);
        console.log('File written successfully');
      } else {
        console.log('Save dialog cancelled by user');
      }
    } catch (err) {
      console.error('Failed to export plan:', err);
      const errorMessage =
        err instanceof Error ? err.message : 'Unknown error occurred';
      toast.error('Failed to export plan', { description: errorMessage });
    } finally {
      setIsExportingText(false);
    }
  };

  const handleExportXml = async () => {
    if (!data) {
      console.log('No data available for export');
      return;
    }
    console.log('Starting XML export...');
    setIsExportingXml(true);
    try {
      console.log('Fetching plan XML...');
      const xml = await exportSkillPlanXml({ planId });
      console.log('Plan XML fetched, opening save dialog...');
      const filePath = await save({
        title: 'Save Skill Plan',
        defaultPath: `${data.plan.name}.xml`,
        filters: [
          { name: 'XML Files', extensions: ['xml'] },
          { name: 'All Files', extensions: ['*'] },
        ],
      });
      console.log('Save dialog result:', filePath);

      if (filePath) {
        console.log('Writing file to:', filePath);
        await writeTextFile(filePath, xml);
        console.log('File written successfully');
      } else {
        console.log('Save dialog cancelled by user');
      }
    } catch (err) {
      console.error('Failed to export plan:', err);
      const errorMessage =
        err instanceof Error ? err.message : 'Unknown error occurred';
      toast.error('Failed to export plan', { description: errorMessage });
    } finally {
      setIsExportingXml(false);
    }
  };

  const handleCopyTextToClipboard = async () => {
    if (!data) return;
    setIsCopyingText(true);
    try {
      const text = await exportSkillPlanText({ planId });
      await writeText(text);
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
      const errorMessage =
        err instanceof Error ? err.message : 'Unknown error occurred';
      toast.error('Failed to copy to clipboard', { description: errorMessage });
    } finally {
      setIsCopyingText(false);
    }
  };

  const handleSaveName = async () => {
    if (!data || !editName.trim()) return;
    try {
      await updatePlanMutation.mutateAsync({
        planId,
        name: editName.trim(),
        description: data.plan.description,
        autoPrerequisites: data.plan.auto_prerequisites,
      });
      setIsEditingName(false);
    } catch (err) {
      console.error('Failed to update plan name:', err);
    }
  };

  const handleSaveDescription = async () => {
    if (!data) return;
    try {
      await updatePlanMutation.mutateAsync({
        planId,
        name: data.plan.name,
        description: editDescription.trim() || null,
        autoPrerequisites: data.plan.auto_prerequisites,
      });
      setIsEditingDescription(false);
    } catch (err) {
      console.error('Failed to update plan description:', err);
    }
  };

  const handleToggleAutoPrerequisites = async (checked: boolean) => {
    if (!data) return;
    try {
      await updatePlanMutation.mutateAsync({
        planId,
        name: data.plan.name,
        description: data.plan.description,
        autoPrerequisites: checked,
      });
      toast.success(
        checked ? 'Auto-prerequisites enabled' : 'Auto-prerequisites disabled'
      );
    } catch (err) {
      console.error('Failed to update auto-prerequisites:', err);
      toast.error('Failed to update setting');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Loading plan...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-destructive">
          Error:{' '}
          {error instanceof Error ? error.message : 'Failed to load plan'}
        </p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Plan not found</p>
      </div>
    );
  }

  const totalSP = localItems.reduce(
    (sum, entry) => sum + entry.skillpoints_for_level,
    0
  );

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="border-b border-border p-4 space-y-4 shrink-0">
        <div className="flex justify-between items-start gap-4">
          <div className="space-y-2 flex-1">
            {isEditingName ? (
              <div className="flex items-center gap-2">
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onBlur={handleSaveName}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleSaveName();
                    } else if (e.key === 'Escape') {
                      setIsEditingName(false);
                      setEditName(data.plan.name);
                    }
                  }}
                  autoFocus
                  className="flex-1"
                />
              </div>
            ) : (
              <h2
                className="text-2xl font-bold cursor-pointer hover:text-primary"
                onClick={() => {
                  setEditName(data.plan.name);
                  setIsEditingName(true);
                }}
              >
                {data.plan.name}
              </h2>
            )}
            {isEditingDescription ? (
              <div className="space-y-2">
                <Textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  onBlur={handleSaveDescription}
                  placeholder="Enter plan description"
                  rows={3}
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={handleSaveDescription}
                    disabled={updatePlanMutation.isPending}
                  >
                    Save
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setIsEditingDescription(false);
                      setEditDescription(data.plan.description || '');
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div
                className="text-muted-foreground cursor-pointer hover:text-foreground min-h-12"
                onClick={() => {
                  setEditDescription(data.plan.description || '');
                  setIsEditingDescription(true);
                }}
              >
                {data.plan.description || (
                  <span className="italic">Click to add description</span>
                )}
              </div>
            )}
          </div>
          <div className="flex-col items-end gap-2 border rounded-md p-3 bg-muted/30 hidden">
            <div className="flex items-center space-x-2">
              <Switch
                id="auto-prereqs"
                checked={data.plan.auto_prerequisites}
                onCheckedChange={handleToggleAutoPrerequisites}
              />
              <Label
                htmlFor="auto-prereqs"
                className="text-sm font-medium cursor-pointer"
              >
                Auto-Prerequisites
              </Label>
            </div>
          </div>
        </div>
        {sortedEntries.length > 0 && (
          <div className="text-sm text-foreground">
            <span className="font-medium">Total Skillpoints: </span>
            <span>{totalSP.toLocaleString('en-US')}</span>
          </div>
        )}
        <div className="flex gap-2">
          <div className="flex gap-1 mr-2 border-r pr-2 border-border">
            <Button
              variant="outline"
              size="sm"
              onClick={undo}
              disabled={!canUndo || isPerformingAction}
              title="Undo"
            >
              <Undo2 className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={redo}
              disabled={!canRedo || isPerformingAction}
              title="Redo"
            >
              <Redo2 className="h-4 w-4" />
            </Button>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAddSkillDialogOpen(true)}
          >
            Add Skill
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setImportDialogOpen(true)}
          >
            Import
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleCopyTextToClipboard}
            disabled={isCopyingText}
          >
            <Copy className="mr-2 h-4 w-4" />
            Copy Text
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Download className="mr-2 h-4 w-4" />
                Export
                <ChevronDown className="ml-2 h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={handleExportJson}
                disabled={isExportingJson}
              >
                Export JSON
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={handleExportText}
                disabled={isExportingText}
              >
                Export Text
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={handleExportXml}
                disabled={isExportingXml}
              >
                Export XML
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <Tabs defaultValue="editor" className="flex-1 flex flex-col min-h-0">
        <div className="px-4 border-b border-border bg-muted/20">
          <TabsList className="h-10">
            <TabsTrigger value="editor">Plan Editor</TabsTrigger>
            <TabsTrigger value="remaps">Remaps</TabsTrigger>
            <TabsTrigger value="comparison">Character Comparison</TabsTrigger>
            <TabsTrigger value="simulation">Simulation</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent
          value="editor"
          className="flex-1 flex flex-col min-h-0 mt-0"
        >
          <div className="flex-1 overflow-y-auto min-h-0">
            {localItems.length === 0 ? (
              <div className="flex items-center justify-center h-full p-8">
                <p className="text-muted-foreground">
                  No entries yet. Add skills to get started.
                </p>
              </div>
            ) : (
              <DndContext
                id={`plan-entries-dnd-${planId}`}
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDragEnd={handleDragEnd}
                modifiers={[restrictToVerticalAxis]}
              >
                <SortableContext
                  items={localItems.map((e) => e.entry_id)}
                  strategy={verticalListSortingStrategy}
                >
                  {(() => {
                    const startRemap = planRemaps?.find(
                      (r) => r.after_skill_type_id === null
                    );
                    let cumulativeSP = 0;
                    return (
                      <>
                        {startRemap && <PlanRemapRow remap={startRemap} />}
                        {localItems.map((entry) => {
                          const offsetPercentage =
                            totalSP > 0 ? (cumulativeSP / totalSP) * 100 : 0;
                          cumulativeSP += entry.skillpoints_for_level;
                          const validationStatus = validationMap.get(
                            `${entry.skill_type_id}-${entry.planned_level}`
                          );
                          const remapAfter = planRemaps?.find(
                            (r) =>
                              r.after_skill_type_id === entry.skill_type_id &&
                              r.after_skill_level === entry.planned_level
                          );
                          return (
                            <PlanEntryRow
                              key={entry.entry_id}
                              entry={entry}
                              totalPlanSP={totalSP}
                              offsetPercentage={offsetPercentage}
                              validationStatus={validationStatus}
                              remapAfter={remapAfter}
                            />
                          );
                        })}
                      </>
                    );
                  })()}
                </SortableContext>
              </DndContext>
            )}
          </div>
          <div className="shrink-0 bg-background border-t border-border shadow-[0_-4px_12px_-2px_rgba(0,0,0,0.05)]">
            <SkillPlanValidationDisplay
              planId={planId}
              validationOverride={proposedValidation}
              isProposed={isDragging}
            />
          </div>
        </TabsContent>

        <TabsContent
          value="remaps"
          className="flex-1 overflow-y-auto min-h-0 mt-0"
        >
          <PlanRemapsTab planId={planId} />
        </TabsContent>

        <TabsContent
          value="comparison"
          className="flex-1 overflow-y-auto min-h-0 mt-0"
        >
          <PlanComparisonTab planId={planId} />
        </TabsContent>

        <TabsContent value="simulation" className="flex-1 min-h-0 mt-0">
          <SimulationTab planId={planId} />
        </TabsContent>
      </Tabs>

      <AddSkillDialog
        open={addSkillDialogOpen}
        onOpenChange={setAddSkillDialogOpen}
        planId={planId}
      />
      <ImportPlanDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        planId={planId}
      />
    </div>
  );
}
