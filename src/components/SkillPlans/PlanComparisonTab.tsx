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
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { usePlanComparisonAll } from '@/hooks/tauri/usePlanComparisonAll';

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

  const formatDuration = (seconds: number) => {
    if (seconds === 0) return 'Complete';
    const days = Math.floor(seconds / (24 * 3600));
    const hours = Math.floor((seconds % (24 * 3600)) / 3600);
    const mins = Math.floor((seconds % 3600) / 60);

    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (mins > 0) parts.push(`${mins}m`);

    return parts.join(' ') || '< 1m';
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
            <DropdownMenuLabel>Show Characters</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {data.comparisons.map((c) => (
              <DropdownMenuCheckboxItem
                key={c.character_id}
                checked={!excludedCharacterIds.has(c.character_id)}
                onCheckedChange={() => toggleCharacter(c.character_id)}
              >
                {c.character_name}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="border rounded-md overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Character</TableHead>
              <TableHead className="text-right">Completed SP</TableHead>
              <TableHead className="text-right">Missing SP</TableHead>
              <TableHead className="text-right">Time Remaining</TableHead>
              <TableHead>Status</TableHead>
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
                  {c.completed_sp.toLocaleString()}
                </TableCell>
                <TableCell className="text-right">
                  {c.missing_sp.toLocaleString()}
                </TableCell>
                <TableCell className="text-right">
                  {formatDuration(c.time_to_completion_seconds)}
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
      </div>
    </div>
  );
}
