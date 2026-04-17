import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useAllCharactersLocations } from '@/hooks/tauri/useLocationsOverview';

import { LocationTableRow } from './LocationTableRow';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Skeleton } from './ui/skeleton';

export function LocationTable() {
  const { data: characters, isLoading, error } = useAllCharactersLocations();

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
                <TableHead className="w-8 text-center">Status</TableHead>
                <TableHead>Character</TableHead>
                <TableHead className="w-10 text-center">Docked</TableHead>
                <TableHead>Ship</TableHead>
                <TableHead className="w-10 text-center">Implants</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Structure</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...Array(6)].map((_, i) => (
                <TableRow key={i}>
                  <TableCell className="text-center">
                    <Skeleton className="h-2 w-2 rounded-full mx-auto" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-8 w-40" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-4" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-8 w-48" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-4" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-40" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-32" />
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
        Error loading locations:{' '}
        {error instanceof Error ? error.message : String(error)}
      </div>
    );
  }

  if (!characters || characters.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Character Locations</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">No characters found.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Character Locations ({characters.length})</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8 text-center">Status</TableHead>
              <TableHead>Character</TableHead>
              <TableHead className="w-10 text-center">Docked</TableHead>
              <TableHead>Ship</TableHead>
              <TableHead className="w-10 text-center">Implants</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Structure</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {characters.map((char) => (
              <LocationTableRow key={char.character_id} character={char} />
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
