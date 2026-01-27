import { Link } from '@tanstack/react-router';
import { UserPlus, Zap } from 'lucide-react';

import { CharacterPortrait } from '@/components/Accounts/CharacterPortrait';
import { TableCell, TableRow } from '@/components/ui/table';
import type {
  SkillQueueItem,
  TrainingCharacterOverview,
} from '@/generated/types';
import { cn } from '@/lib/utils';

interface OverviewTableRowProps {
  character: TrainingCharacterOverview;
}

function toRoman(n: number): string {
  const roman = ['I', 'II', 'III', 'IV', 'V'];
  return roman[n - 1] || n.toString();
}

function formatDuration(seconds: number): string {
  if (seconds <= 0) return 'None';

  const days = Math.floor(seconds / (24 * 3600));
  const hours = Math.floor((seconds % (24 * 3600)) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0 || (days === 0 && hours === 0)) parts.push(`${minutes}m`);

  return parts.join(' ');
}

export function OverviewTableRow({ character }: OverviewTableRowProps) {
  return (
    <TableRow>
      <TableCell className="font-medium">
        <Link
          to="/characters/$characterId"
          params={{ characterId: character.character_id.toString() }}
          className="flex items-center gap-3 hover:underline"
        >
          <CharacterPortrait
            character={{
              character_id: character.character_id,
              character_name: character.character_name,
              unallocated_sp: 0,
              sort_order: 0,
            }}
            skillQueue={[
              {
                skill_id: 0,
                queue_position: 0,
                finished_level: 0,
              } satisfies SkillQueueItem,
            ]}
            size={32}
          />
          <span>{character.character_name}</span>
        </Link>
      </TableCell>
      <TableCell>
        {character.queue_time_remaining_seconds != null
          ? formatDuration(character.queue_time_remaining_seconds)
          : 'None'}
      </TableCell>
      <TableCell className="max-w-[200px] truncate">
        {character.current_skill_name || 'Unknown'}{' '}
        {character.current_skill_level &&
          toRoman(character.current_skill_level)}
      </TableCell>
      <TableCell>
        {Math.round(character.sp_per_hour).toLocaleString()} SP/hr
      </TableCell>
      <TableCell>
        <span
          title={
            character.has_implants
              ? 'Clone with attribute implants'
              : 'Clone without attribute implants'
          }
        >
          <UserPlus
            className={cn(
              'h-4 w-4',
              character.has_implants
                ? 'text-primary'
                : 'text-muted-foreground/50'
            )}
          />
        </span>
      </TableCell>
      <TableCell>
        <span
          title={
            character.has_booster
              ? 'Active accelerator'
              : 'No active accelerator'
          }
        >
          <Zap
            className={cn(
              'h-4 w-4',
              character.has_booster
                ? 'text-yellow-500 fill-yellow-500'
                : 'text-muted-foreground/50'
            )}
          />
        </span>
      </TableCell>
    </TableRow>
  );
}
