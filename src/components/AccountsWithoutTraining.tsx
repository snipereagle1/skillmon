import { useAccountsAndCharacters } from '@/hooks/tauri/useAccountsAndCharacters';
import { useTrainingCharactersOverview } from '@/hooks/tauri/useOverview';

import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Skeleton } from './ui/skeleton';

export function AccountsWithoutTraining() {
  const { data: accountsData, isLoading: accountsLoading } =
    useAccountsAndCharacters();
  const { data: trainingCharacters, isLoading: trainingLoading } =
    useTrainingCharactersOverview();

  if (accountsLoading || trainingLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-64" />
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-4 w-40" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const accounts = accountsData?.accounts ?? [];
  const trainingCharacterIds = new Set(
    (trainingCharacters ?? []).map((c) => c.character_id)
  );

  const idleAccounts = accounts.filter(
    (account) =>
      account.characters.length === 0 ||
      account.characters.every((c) => !trainingCharacterIds.has(c.character_id))
  );

  if (idleAccounts.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Accounts Without Active Training ({idleAccounts.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-1">
          {idleAccounts.map((account) => (
            <li key={account.id} className="text-sm">
              {account.name}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
