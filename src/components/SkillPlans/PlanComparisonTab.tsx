import { useNavigate } from '@tanstack/react-router';
import { Filter } from 'lucide-react';
import { useMemo, useState } from 'react';
import { match } from 'ts-pattern';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { usePlanComparisonAll } from '@/hooks/tauri/usePlanComparisonAll';
import { formatDuration, formatNumber } from '@/lib/utils';

interface PlanComparisonTabProps {
  planId: number;
}

export function PlanComparisonTab({ planId }: PlanComparisonTabProps) {
  const { data, isLoading, error } = usePlanComparisonAll(planId);
  const navigate = useNavigate();
  const [excludedCharacterIds, setExcludedCharacterIds] = useState<Set<number>>(
    new Set()
  );

  const filteredComparisons = useMemo(() => {
    const comparisons = data?.comparisons ?? [];
    return comparisons
      .filter((c) => !excludedCharacterIds.has(c.character_id))
      .sort((a, b) => {
        if (b.completed_sp !== a.completed_sp) {
          return b.completed_sp - a.completed_sp;
        }
        return a.character_name.localeCompare(b.character_name);
      });
  }, [data?.comparisons, excludedCharacterIds]);

  const toggleCharacter = (characterId: number) => {
    setExcludedCharacterIds((prev) => {
      const next = new Set(prev);
      if (next.has(characterId)) {
        next.delete(characterId);
      } else {
        next.add(characterId);
      }
      return next;
    });
  };

  const selectAll = () => {
    setExcludedCharacterIds(new Set());
  };

  const selectNone = () => {
    if (!data) return;
    setExcludedCharacterIds(
      new Set(data.comparisons.map((c) => c.character_id))
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <p className="text-muted-foreground">Calculating comparisons...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center p-8 text-destructive">
        Error:{' '}
        {error instanceof Error ? error.message : 'Failed to load comparison'}
      </div>
    );
  }

  if (!data || data.comparisons.length === 0) {
    return (
      <div className="flex items-center justify-center p-8 text-muted-foreground">
        No characters found for comparison.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full space-y-4 p-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Character Progress Comparison</h3>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <Filter className="mr-2 h-4 w-4" />
              Filter Characters (
              {(data?.comparisons.length ?? 0) - excludedCharacterIds.size})
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                selectAll();
              }}
            >
              Select All
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                selectNone();
              }}
            >
              Select None
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              {data.comparisons.map((c) => (
                <DropdownMenuCheckboxItem
                  key={c.character_id}
                  checked={!excludedCharacterIds.has(c.character_id)}
                  onCheckedChange={() => toggleCharacter(c.character_id)}
                  onSelect={(e) => e.preventDefault()}
                >
                  {c.character_name}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="border rounded-md flex-1 min-h-0">
        <ScrollArea className="h-full">
          <Table>
            <TableHeader className="sticky top-0 bg-background z-10">
              <TableRow>
                <TableHead className="bg-background border-b">
                  Character
                </TableHead>
                <TableHead className="text-right bg-background border-b">
                  Completed SP
                </TableHead>
                <TableHead className="text-right bg-background border-b">
                  Missing SP
                </TableHead>
                <TableHead className="text-right bg-background border-b">
                  Time Remaining
                </TableHead>
                <TableHead className="bg-background border-b">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredComparisons.map((c) => (
                <TableRow
                  key={c.character_id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() =>
                    navigate({
                      to: '/characters/$characterId/plans',
                      params: { characterId: String(c.character_id) },
                      search: { planId },
                    })
                  }
                >
                  <TableCell className="font-medium">
                    {c.character_name}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatNumber(c.completed_sp)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatNumber(c.missing_sp)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatDuration(c.time_to_completion_seconds, {
                      showSeconds: false,
                      zeroLabel: 'Complete',
                      minLabel: '< 1m',
                    })}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Badge
                        variant={match(c.status)
                          .with('complete', () => 'default' as const)
                          .with('in_progress', () => 'secondary' as const)
                          .otherwise(() => 'outline' as const)}
                      >
                        {c.status.replace('_', ' ')}
                      </Badge>
                      {!c.has_prerequisites && (
                        <Badge variant="destructive">Missing Prereqs</Badge>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {filteredComparisons.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="text-center py-8 text-muted-foreground"
                  >
                    No characters selected or available.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </ScrollArea>
      </div>
    </div>
  );
}
