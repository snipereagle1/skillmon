import { useState } from 'react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { Character } from '@/generated/types';
import { useAddCharacterToAccount } from '@/hooks/tauri/useAccountsAndCharacters';

interface AddCharacterToAccountMenuProps {
  accountId: number;
  unassignedCharacters: Character[];
  children: React.ReactNode;
}

export function AddCharacterToAccountMenu({
  accountId,
  unassignedCharacters,
  children,
}: AddCharacterToAccountMenuProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const addCharacterMutation = useAddCharacterToAccount();

  const handleAddCharacter = async (characterId: number) => {
    try {
      await addCharacterMutation.mutateAsync({
        characterId,
        accountId,
      });
      setDropdownOpen(false);
    } catch (err) {
      console.error('Failed to add character to account:', err);
    }
  };

  const handleLeftClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (unassignedCharacters.length > 0) {
      setDropdownOpen(true);
    }
  };

  return (
    <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
      <DropdownMenuTrigger asChild onClick={handleLeftClick}>
        {children}
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {unassignedCharacters.length === 0 ? (
          <DropdownMenuItem disabled>No unassigned characters</DropdownMenuItem>
        ) : (
          unassignedCharacters.map((character) => (
            <DropdownMenuItem
              key={character.character_id}
              onClick={() => handleAddCharacter(character.character_id)}
            >
              {character.character_name}
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
