import { AccountSidebar } from '@/components/Accounts/AccountSidebar';
import { useAccountsAndCharacters } from '@/hooks/tauri/useAccountsAndCharacters';

export function CharactersIndex() {
  const { data: accountsData, isLoading, error } = useAccountsAndCharacters();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Loading characters...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-destructive">
          Error:{' '}
          {error instanceof Error ? error.message : 'Failed to load characters'}
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full gap-2 p-4">
      <div className="w-64 shrink-0 overflow-y-auto">
        {accountsData &&
        accountsData.accounts.length === 0 &&
        accountsData.unassigned_characters.length === 0 ? (
          <p className="text-muted-foreground p-4">No characters added yet.</p>
        ) : (
          <AccountSidebar selectedCharacterId={null} />
        )}
      </div>
      <div className="flex-1 border rounded-lg overflow-hidden flex flex-col">
        <div className="flex items-center justify-center h-full">
          <p className="text-muted-foreground">
            Select a character to view details
          </p>
        </div>
      </div>
    </div>
  );
}
