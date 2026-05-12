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

import {
  OverviewTableRow,
  type TrainingOverviewRowData,
} from './OverviewTableRow';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Skeleton } from './ui/skeleton';

export function OverviewTable() {
  const { data: accountsData, isLoading, error } = useAccountsAndCharacters();
  const queues = useEsiStore((state) => state.queues);

  const allCharacters = accountsData
    ? [
        ...accountsData.unassigned_characters.map((c) => ({
          ...c,
          account_name: undefined,
        })),
        ...accountsData.accounts.flatMap((account) =>
          account.characters.map((character) => ({
            ...character,
            account_name: account.name,
          }))
        ),
      ]
    : [];

  const trainingCharacters: TrainingOverviewRowData[] = allCharacters.reduce(
    (rows, character) => {
      const queue = queues[character.character_id]?.data;
      if (!queue || queue.queue.length === 0 || queue.isPaused) return rows;
      const current = queue.queue[0];
      const firstStart = queue.queue[0]?.startDate;
      const lastFinish = queue.queue[queue.queue.length - 1]?.finishDate;
      let queueTimeRemainingSeconds: number | undefined;
      if (firstStart && lastFinish) {
        const seconds =
          (new Date(lastFinish).getTime() - new Date(firstStart).getTime()) /
          1000;
        queueTimeRemainingSeconds = Number.isFinite(seconds)
          ? Math.max(0, Math.floor(seconds))
          : undefined;
      }

      const spPerHour =
        current?.spPerMinute != null ? current.spPerMinute * 60 : 0;
      rows.push({
        characterId: character.character_id,
        characterName: queue.characterName,
        accountName: character.account_name,
        queueTimeRemainingSeconds,
        currentSkillName: current?.skillName,
        currentSkillLevel: current?.finishedLevel,
        spPerHour,
        isOmega: queue.isOmega,
        hasImplants: false,
        hasBooster: false,
      });
      return rows;
    },
    [] as TrainingOverviewRowData[]
  );

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
