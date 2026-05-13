import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useAccountsAndCharacters } from '@/hooks/tauri/useAccountsAndCharacters';
import { useEsiStore } from '@/stores/esiStore';

import { OverviewTableRow } from './OverviewTableRow';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Skeleton } from './ui/skeleton';

export function OverviewTable() {
  const { isLoading, error } = useAccountsAndCharacters();
  const overview = useEsiStore((state) => state.overview);

  const trainingCharacters = Object.values(overview).sort((a, b) => {
    if (
      a.queueTimeRemainingSeconds != null &&
      b.queueTimeRemainingSeconds != null
    ) {
      return a.queueTimeRemainingSeconds - b.queueTimeRemainingSeconds;
    }
    if (a.queueTimeRemainingSeconds != null) return -1;
    if (b.queueTimeRemainingSeconds != null) return 1;
    return 0;
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Character</TableHead>
                <TableHead>Account</TableHead>
                <TableHead>Skill Queue Length</TableHead>
                <TableHead>Current Skill</TableHead>
                <TableHead>Training Speed</TableHead>
                <TableHead>Clone</TableHead>
                <TableHead>Accelerator</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...Array(12)].map((_, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <Skeleton className="h-8 w-40" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-24" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-24" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-32" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-20" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-8" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-8" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-destructive bg-destructive/10 rounded-md">
        Error loading overview: {String(error)}
      </div>
    );
  }

  if (trainingCharacters.length === 0) {
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
              <TableHead>Account</TableHead>
              <TableHead>Skill Queue Length</TableHead>
              <TableHead>Current Skill</TableHead>
              <TableHead>Training Speed</TableHead>
              <TableHead>Clone</TableHead>
              <TableHead>Accelerator</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {trainingCharacters.map((char) => (
              <OverviewTableRow key={char.characterId} character={char} />
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
