import { Link } from '@tanstack/react-router';
import { UserPlus, Zap } from 'lucide-react';

import { CharacterPortrait } from '@/components/Accounts/CharacterPortrait';
import { AlphaIcon } from '@/components/AlphaIcon';
import { TableCell, TableRow } from '@/components/ui/table';
import type { OverviewRow, SkillQueueItem } from '@/generated/types';
import { cn, formatDuration, formatNumber, toRoman } from '@/lib/utils';

interface OverviewTableRowProps {
  character: OverviewRow;
}

export function OverviewTableRow({ character }: OverviewTableRowProps) {
  return (
    <TableRow>
      <TableCell className="font-medium">
        <Link
          to="/characters/$characterId"
          params={{ characterId: character.characterId.toString() }}
          className="flex items-center gap-3 hover:underline"
        >
          <CharacterPortrait
            character={{
              character_id: character.characterId,
              character_name: character.characterName,
              unallocated_sp: 0,
              sort_order: 0,
              is_omega: false,
            }}
            skillQueue={[
              {
                skillId: 0,
                queuePosition: 0,
                finishedLevel: 0,
              } satisfies SkillQueueItem,
            ]}
            size={32}
          />
          <span>{character.characterName}</span>
        </Link>
      </TableCell>
      <TableCell>
        {character.accountName ?? (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell>
        {character.queueTimeRemainingSeconds != null
          ? formatDuration(character.queueTimeRemainingSeconds, {
              showSeconds: false,
            })
          : 'None'}
      </TableCell>
      <TableCell className="max-w-[200px] truncate">
        {character.currentSkillName || 'Unknown'}{' '}
        {character.currentSkillLevel && toRoman(character.currentSkillLevel)}
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-1.5">
          <span>{formatNumber(Math.round(character.spPerHour))} SP/hr</span>
          {!character.isOmega && (
            <span title="Alpha Clone">
              <AlphaIcon className="h-4 w-4 text-white" />
            </span>
          )}
        </div>
      </TableCell>
      <TableCell>
        <span
          title={
            character.hasImplants
              ? 'Clone with attribute implants'
              : 'Clone without attribute implants'
          }
        >
          <UserPlus
            className={cn(
              'h-4 w-4',
              character.hasImplants
                ? 'text-primary'
                : 'text-muted-foreground/50'
            )}
          />
        </span>
      </TableCell>
      <TableCell>
        <span
          title={
            character.hasBooster
              ? 'Active accelerator'
              : 'No active accelerator'
          }
        >
          <Zap
            className={cn(
              'h-4 w-4',
              character.hasBooster
                ? 'text-yellow-500 fill-yellow-500'
                : 'text-muted-foreground/50'
            )}
          />
        </span>
      </TableCell>
    </TableRow>
  );
}
