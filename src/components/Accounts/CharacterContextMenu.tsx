import type React from 'react';

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import type { AccountWithCharacters, Character } from '@/generated/types';
import {
  useAddCharacterToAccount,
  useRemoveCharacterFromAccount,
} from '@/hooks/tauri/useAccountsAndCharacters';

interface CharacterContextMenuProps {
  character: Character;
  accounts: AccountWithCharacters[];
  children: React.ReactNode;
}

export function CharacterContextMenu({
  character,
  accounts,
  children,
}: CharacterContextMenuProps) {
  const addCharacterMutation = useAddCharacterToAccount();
  const removeCharacterMutation = useRemoveCharacterFromAccount();

  const isAssigned = character.account_id != null;
  const otherAccounts = accounts.filter(
    (acc) => acc.id !== character.account_id
  );

  const handleAddToAccount = async (accountId: number) => {
    try {
      await addCharacterMutation.mutateAsync({
        characterId: character.character_id,
        accountId,
      });
    } catch (err) {
      console.error('Failed to add character to account:', err);
    }
  };

  const handleRemoveFromAccount = async () => {
    try {
      await removeCharacterMutation.mutateAsync({
        characterId: character.character_id,
      });
    } catch (err) {
      console.error('Failed to remove character from account:', err);
    }
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        {!isAssigned && (
          <>
            <ContextMenuSub>
              <ContextMenuSubTrigger>Add to account</ContextMenuSubTrigger>
              <ContextMenuSubContent>
                {accounts.length === 0 ? (
                  <ContextMenuItem disabled>
                    No accounts available
                  </ContextMenuItem>
                ) : (
                  accounts.map((account) => (
                    <ContextMenuItem
                      key={account.id}
                      onClick={() => handleAddToAccount(account.id)}
                      disabled={account.characters.length >= 3}
                    >
                      {account.name}
                      {account.characters.length >= 3 && ' (Full)'}
                    </ContextMenuItem>
                  ))
                )}
              </ContextMenuSubContent>
            </ContextMenuSub>
          </>
        )}
        {isAssigned && (
          <>
            <ContextMenuItem
              variant="destructive"
              onClick={handleRemoveFromAccount}
              className="text-white data-[variant=destructive]:text-white"
            >
              Remove from account
            </ContextMenuItem>
            {otherAccounts.length > 0 && (
              <>
                <ContextMenuSeparator />
                <ContextMenuSub>
                  <ContextMenuSubTrigger>Move to account</ContextMenuSubTrigger>
                  <ContextMenuSubContent>
                    {otherAccounts.map((account) => (
                      <ContextMenuItem
                        key={account.id}
                        onClick={() => handleAddToAccount(account.id)}
                        disabled={account.characters.length >= 3}
                      >
                        {account.name}
                        {account.characters.length >= 3 && ' (Full)'}
                      </ContextMenuItem>
                    ))}
                  </ContextMenuSubContent>
                </ContextMenuSub>
              </>
            )}
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
