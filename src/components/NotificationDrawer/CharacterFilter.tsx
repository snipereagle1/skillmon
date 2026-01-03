import { useMemo } from 'react';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAccountsAndCharacters } from '@/hooks/tauri/useAccountsAndCharacters';

interface CharacterFilterProps {
  selectedCharacterId: number | null | undefined;
  onCharacterChange: (characterId: number | null) => void;
}

export function CharacterFilter({
  selectedCharacterId,
  onCharacterChange,
}: CharacterFilterProps) {
  const { data: accountsData } = useAccountsAndCharacters();
  const characters = useMemo(() => {
    if (!accountsData) return [];
    const accountChars = accountsData.accounts.flatMap((acc) => acc.characters);
    return [...accountChars, ...accountsData.unassigned_characters];
  }, [accountsData]);

  const value = selectedCharacterId?.toString() ?? 'all';

  return (
    <div className="px-4">
      <Select
        value={value}
        onValueChange={(newValue) =>
          onCharacterChange(newValue === 'all' ? null : parseInt(newValue, 10))
        }
      >
        <SelectTrigger className="w-full">
          <SelectValue placeholder="All Characters" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Characters</SelectItem>
          {characters.map((char) => (
            <SelectItem
              key={char.character_id}
              value={char.character_id.toString()}
            >
              {char.character_name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
