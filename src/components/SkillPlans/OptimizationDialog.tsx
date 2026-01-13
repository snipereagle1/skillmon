import { ArrowRight, Check, Loader2, RefreshCw, Save, Zap } from 'lucide-react';
import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type {
  Attributes,
  OptimizationResult,
  PlannedRemap,
  ReorderOptimizationResult,
  SkillmonPlan,
  SkillPlanEntryResponse,
} from '@/generated/types';
import {
  type OptimizationMode,
  useOptimization,
} from '@/hooks/tauri/useOptimization';
import {
  useImportSkillPlanJson,
  useReorderPlanEntries,
} from '@/hooks/tauri/useSkillPlans';
import { formatDuration } from '@/lib/utils';

import { RemapSchedule } from './RemapSchedule';

interface OptimizationDialogProps {
  planId: number;
  planName: string;
  currentRemap: Attributes;
  implants: Attributes;
  acceleratorBonus: number;
  characterId: number | null;
  entries: SkillPlanEntryResponse[];
  onApply: (remap: PlannedRemap) => void;
  onApplyReorder?: (
    optimizedEntries: SkillPlanEntryResponse[],
    remaps: PlannedRemap[]
  ) => void;
}

const ATTRIBUTES: (keyof Attributes)[] = [
  'intelligence',
  'memory',
  'perception',
  'willpower',
  'charisma',
];

function isReorderResult(opt: object): opt is ReorderOptimizationResult {
  return 'optimized_entries' in opt;
}

export function OptimizationDialog({
  planId,
  planName,
  currentRemap,
  implants,
  acceleratorBonus,
  characterId,
  entries,
  onApply,
  onApplyReorder,
}: OptimizationDialogProps) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<OptimizationMode>('attributes');
  const [maxRemaps, setMaxRemaps] = useState(1);
  const { optimization, isLoading, error } = useOptimization(
    planId,
    implants,
    currentRemap,
    acceleratorBonus,
    characterId,
    mode,
    maxRemaps
  );

  const reorderMutation = useReorderPlanEntries();
  const importPlanMutation = useImportSkillPlanJson();

  const timeSaved = useMemo(() => {
    if (!optimization) return 0;

    const opt = optimization as OptimizationResult | ReorderOptimizationResult;
    return opt.original_seconds - opt.optimized_seconds;
  }, [optimization]);

  const isAlreadyOptimal = useMemo(() => {
    if (
      !optimization ||
      mode !== 'attributes' ||
      isReorderResult(optimization)
    ) {
      return false;
    }

    return (
      optimization.recommended_remap &&
      ATTRIBUTES.every(
        (attr) =>
          currentRemap[attr] === optimization.recommended_remap.attributes[attr]
      )
    );
  }, [optimization, currentRemap, mode]);

  const handleApply = async () => {
    if (!optimization) return;

    if (isReorderResult(optimization)) {
      // Apply the reorder to the actual plan in DB
      const entryIds = optimization.optimized_entries.map((e) => e.entry_id);
      await reorderMutation.mutateAsync({ planId, entryIds });

      // Update local simulation state
      if (onApplyReorder) {
        const entryMap = new Map(entries.map((e) => [e.entry_id, e]));
        const optimizedWithNames = optimization.optimized_entries.map((e) => ({
          ...entryMap.get(e.entry_id)!,
        })) as SkillPlanEntryResponse[];

        onApplyReorder(optimizedWithNames, optimization.recommended_remaps);
      }
      setOpen(false);
    } else {
      onApply(optimization.recommended_remap);
      setOpen(false);
    }
  };

  const handleSaveAsNew = async () => {
    if (!optimization || !isReorderResult(optimization)) return;

    const entryMap = new Map(entries.map((e) => [e.entry_id, e]));

    const plan: SkillmonPlan = {
      version: 1,
      name: `${planName} - Optimized`,
      description: '',
      auto_prerequisites: true,
      entries: optimization.optimized_entries.map((oe) => {
        const original = entryMap.get(oe.entry_id)!;
        return {
          skill_type_id: original.skill_type_id,
          level: original.planned_level,
          entry_type: original.entry_type,
          notes: original.notes || null,
        };
      }),
    };

    await importPlanMutation.mutateAsync({ plan });
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Zap className="h-4 w-4 text-yellow-500" />
          Optimize
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[650px]">
        <DialogHeader>
          <DialogTitle>Plan Optimization</DialogTitle>
          <DialogDescription>
            Find the fastest way to complete this skill plan.
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={mode}
          onValueChange={(v) => setMode(v as OptimizationMode)}
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="attributes">Attributes Only</TabsTrigger>
            <TabsTrigger value="reorder">Attributes + Reordering</TabsTrigger>
          </TabsList>

          <div className="mt-4">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-12 gap-4">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">
                  Running optimization algorithm...
                </p>
              </div>
            ) : error ? (
              <div className="py-12 text-center text-destructive">
                Failed to calculate optimization:{' '}
                {error instanceof Error ? error.message : 'Unknown error'}
              </div>
            ) : optimization ? (
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-muted/50 p-4 rounded-lg text-center">
                    <div className="text-sm text-muted-foreground">
                      Base Time
                    </div>
                    <div className="text-xl font-bold">
                      {formatDuration(
                        (
                          optimization as
                            | OptimizationResult
                            | ReorderOptimizationResult
                        ).original_seconds
                      )}
                    </div>
                  </div>
                  <div className="bg-primary/10 p-4 rounded-lg text-center border border-primary/20">
                    <div className="text-sm text-primary font-medium">
                      Optimized Time
                    </div>
                    <div className="text-xl font-bold text-primary">
                      {formatDuration(
                        (
                          optimization as
                            | OptimizationResult
                            | ReorderOptimizationResult
                        ).optimized_seconds
                      )}
                    </div>
                  </div>
                </div>

                {timeSaved > 0 ? (
                  <div className="flex items-center gap-2 text-green-600 dark:text-green-400 bg-green-500/10 p-3 rounded-md text-sm font-medium">
                    <Check className="h-4 w-4" />
                    Total savings: {formatDuration(timeSaved)}
                  </div>
                ) : (
                  <div className="text-center text-sm text-muted-foreground bg-muted p-3 rounded-md">
                    Plan is already optimal!
                  </div>
                )}

                <TabsContent value="attributes" className="mt-0">
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Attribute</TableHead>
                          <TableHead className="text-center">Current</TableHead>
                          <TableHead></TableHead>
                          <TableHead className="text-center">
                            Recommended
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {ATTRIBUTES.map((attr) => {
                          const currentVal = currentRemap[attr];
                          if (!optimization || isReorderResult(optimization)) {
                            return null;
                          }

                          const recommendedVal =
                            optimization.recommended_remap.attributes[attr];
                          const isChanged = currentVal !== recommendedVal;

                          return (
                            <TableRow key={attr}>
                              <TableCell className="capitalize font-medium">
                                {attr}
                              </TableCell>
                              <TableCell className="text-center">
                                +{currentVal}
                              </TableCell>
                              <TableCell className="text-center w-8">
                                {isChanged && (
                                  <ArrowRight className="h-3 w-3 mx-auto text-muted-foreground" />
                                )}
                              </TableCell>
                              <TableCell
                                className={`text-center font-bold ${
                                  isChanged ? 'text-primary' : ''
                                }`}
                              >
                                +{recommendedVal}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </TabsContent>

                <TabsContent value="reorder" className="mt-0">
                  <div className="flex items-center gap-4 mb-4 p-3 bg-muted/30 rounded-md">
                    <Label htmlFor="max-remaps" className="text-sm font-medium">
                      Maximum remaps:
                    </Label>
                    <Select
                      value={maxRemaps.toString()}
                      onValueChange={(v) => setMaxRemaps(parseInt(v))}
                    >
                      <SelectTrigger id="max-remaps" className="w-[120px]">
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">1 remap</SelectItem>
                        <SelectItem value="2">2 remaps</SelectItem>
                        <SelectItem value="3">3 remaps</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground italic">
                      (Recommend 1 for most plans)
                    </p>
                  </div>

                  {optimization && isReorderResult(optimization) && (
                    <RemapSchedule
                      remaps={optimization.recommended_remaps}
                      currentAttributes={currentRemap}
                      optimizedEntries={optimization.optimized_entries.map(
                        (opt) => {
                          const original = entries.find(
                            (e) => e.entry_id === opt.entry_id
                          );
                          return {
                            ...original,
                            ...opt,
                          } as SkillPlanEntryResponse;
                        }
                      )}
                    />
                  )}
                  <div className="mt-4 p-3 bg-blue-500/5 border border-blue-500/20 rounded-md text-xs text-blue-600 dark:text-blue-400">
                    <strong>Note:</strong> Up to {maxRemaps} remap
                    {maxRemaps > 1 ? 's' : ''} will be automatically scheduled
                    to match the new skill order.
                  </div>
                </TabsContent>
              </div>
            ) : null}
          </div>
        </Tabs>

        <DialogFooter className="flex flex-col sm:flex-row gap-2">
          {mode === 'reorder' && (
            <Button
              variant="outline"
              onClick={handleSaveAsNew}
              disabled={!optimization || importPlanMutation.isPending}
              className="flex-1 gap-2"
            >
              <Save className="h-4 w-4" />
              Save as New Plan
            </Button>
          )}
          <Button
            onClick={handleApply}
            disabled={
              !optimization || isAlreadyOptimal || reorderMutation.isPending
            }
            className="flex-1 gap-2"
          >
            {mode === 'reorder' ? (
              <>
                <RefreshCw
                  className={`h-4 w-4 ${reorderMutation.isPending ? 'animate-spin' : ''}`}
                />
                Apply to Current Plan
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4" />
                Apply Optimization
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
