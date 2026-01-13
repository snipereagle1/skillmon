import { ArrowRight, Check, Loader2, Zap } from 'lucide-react';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { Attributes, PlannedRemap } from '@/generated/types';
import { useOptimization } from '@/hooks/tauri/useOptimization';
import { formatDuration } from '@/lib/utils';

interface OptimizationDialogProps {
  planId: number;
  currentRemap: Attributes;
  implants: Attributes;
  characterId: number | null;
  onApply: (remap: PlannedRemap) => void;
}

const ATTRIBUTES: (keyof Attributes)[] = [
  'intelligence',
  'memory',
  'perception',
  'willpower',
  'charisma',
];

export function OptimizationDialog({
  planId,
  currentRemap,
  implants,
  characterId,
  onApply,
}: OptimizationDialogProps) {
  const [open, setOpen] = useState(false);
  const { optimization, isLoading, error } = useOptimization(
    planId,
    implants,
    characterId
  );

  const timeSaved = useMemo(() => {
    if (!optimization) return 0;
    return optimization.original_seconds - optimization.optimized_seconds;
  }, [optimization]);

  const isAlreadyOptimal = useMemo(() => {
    if (!optimization) return false;
    return ATTRIBUTES.every(
      (attr) =>
        currentRemap[attr] === optimization.recommended_remap.attributes[attr]
    );
  }, [optimization, currentRemap]);

  const handleApply = () => {
    if (optimization) {
      if (!isAlreadyOptimal) {
        onApply(optimization.recommended_remap);
      }
      setOpen(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Zap className="h-4 w-4 text-yellow-500" />
          Optimize Attributes
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[550px]">
        <DialogHeader>
          <DialogTitle>Optimize Attributes</DialogTitle>
          <DialogDescription>
            Calculate the best single remap to minimize training time for this
            plan.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-8 gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">
              Calculating optimal distribution...
            </p>
          </div>
        ) : error ? (
          <div className="py-8 text-center text-destructive">
            Failed to calculate optimization: {error.message}
          </div>
        ) : optimization ? (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-muted/50 p-4 rounded-lg">
                <div className="text-sm text-muted-foreground">
                  Base Time (No Remap)
                </div>
                <div className="text-xl font-bold">
                  {formatDuration(optimization.original_seconds)}
                </div>
              </div>
              <div className="bg-primary/10 p-4 rounded-lg">
                <div className="text-sm text-primary">Optimized Time</div>
                <div className="text-xl font-bold text-primary">
                  {formatDuration(optimization.optimized_seconds)}
                </div>
              </div>
            </div>

            {timeSaved > 0 ? (
              <div className="flex items-center gap-2 text-green-600 dark:text-green-400 bg-green-500/10 p-3 rounded-md text-sm font-medium">
                <Check className="h-4 w-4" />
                Total savings vs. base attributes: {formatDuration(timeSaved)}
              </div>
            ) : (
              <div className="text-center text-sm text-muted-foreground bg-muted p-3 rounded-md">
                Your current remap is already optimal!
              </div>
            )}

            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Attribute</TableHead>
                    <TableHead className="text-center">Your Remap</TableHead>
                    <TableHead></TableHead>
                    <TableHead className="text-center">Recommended</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ATTRIBUTES.map((attr) => {
                    const currentVal = currentRemap[attr];
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
                        <TableCell className="text-center">
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
          </div>
        ) : null}

        <DialogFooter>
          <Button
            onClick={handleApply}
            disabled={!optimization}
            variant={isAlreadyOptimal ? 'secondary' : 'default'}
            className="w-full"
          >
            {isAlreadyOptimal ? 'Close' : 'Apply Optimization'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
