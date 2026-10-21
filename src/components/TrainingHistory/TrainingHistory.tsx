import { Link } from '@tanstack/react-router';
import { formatDistanceToNow } from 'date-fns';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useSkillTrainingHistory } from '@/hooks/tauri/useSkillTrainingHistory';
import { formatDate, toRoman } from '@/lib/utils';

interface TrainingHistoryProps {
  /** Omit to show every character's completions. */
  characterId?: number;
}

export function TrainingHistory({ characterId }: TrainingHistoryProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Completed Training</CardTitle>
      </CardHeader>
      <CardContent>
        <HistoryContent characterId={characterId} />
      </CardContent>
    </Card>
  );
}

function HistoryContent({ characterId }: TrainingHistoryProps) {
  const showCharacter = characterId === undefined;
  const { data, isLoading, error } = useSkillTrainingHistory(
    characterId ?? null
  );

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-6 w-full" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <p className="text-destructive">
        {error instanceof Error ? error.message : String(error)}
      </p>
    );
  }

  if (!data?.length) {
    return (
      <p className="text-muted-foreground">
        No completed skills recorded yet. Skills are recorded as they finish in
        the skill queue while Skillmon is running.
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Completed</TableHead>
          {showCharacter && <TableHead>Character</TableHead>}
          <TableHead>Skill</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((row) => {
          const completed = new Date(row.completed_at * 1000);
          return (
            <TableRow
              key={`${row.character_id}-${row.skill_id}-${row.finished_level}`}
            >
              <TableCell title={formatDate(completed, 'PPpp')}>
                {formatDistanceToNow(completed, { addSuffix: true })}
              </TableCell>
              {showCharacter && (
                <TableCell>
                  <Link
                    to="/characters/$characterId/history"
                    params={{ characterId: String(row.character_id) }}
                    className="hover:underline"
                  >
                    {row.character_name}
                  </Link>
                </TableCell>
              )}
              <TableCell>
                {row.skill_name ?? `Skill ${row.skill_id}`}{' '}
                {toRoman(row.finished_level)}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
