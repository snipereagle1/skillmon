import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useTrainingCharactersOverview } from '@/hooks/tauri/useOverview';

import { OverviewTableRow } from './OverviewTableRow';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Spinner } from './ui/spinner';

export function OverviewTable() {
  const {
    data: trainingCharacters,
    isLoading,
    error,
  } = useTrainingCharactersOverview();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Spinner className="size-10" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-destructive bg-destructive/10 rounded-md">
        Error loading overview: {String(error)}
      </div>
    );
  }

  if (!trainingCharacters || trainingCharacters.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Currently Training</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            No characters are currently training.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Currently Training ({trainingCharacters.length})</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Character</TableHead>
              <TableHead>Skill Queue Length</TableHead>
              <TableHead>Current Skill</TableHead>
              <TableHead>Training Speed</TableHead>
              <TableHead>Clone</TableHead>
              <TableHead>Accelerator</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {trainingCharacters.map((char) => (
              <OverviewTableRow key={char.character_id} character={char} />
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
