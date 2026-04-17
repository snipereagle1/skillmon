import { Link } from '@tanstack/react-router';
import { MapPinHouse, Rocket, UserPlus } from 'lucide-react';
import type React from 'react';
import { match } from 'ts-pattern';

import { TableCell, TableRow } from '@/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { CharacterLocationOverview } from '@/generated/types';
import { cn } from '@/lib/utils';

interface LocationCellProps {
  system: string | null | undefined;
  region: string | null | undefined;
}

function LocationCell({ system, region }: LocationCellProps) {
  if (system && region) {
    return (
      <a
        href={`https://evemaps.dotlan.net/map/${region.replace(/ /g, '_')}/${system.replace(/ /g, '_')}`}
        target="_blank"
        rel="noreferrer"
        className="hover:border-b hover:border-dotted hover:border-current"
      >
        {system}
        <span className="text-muted-foreground ml-1">· {region}</span>
      </a>
    );
  }
  if (system) {
    return <span>{system}</span>;
  }
  return <span className="text-muted-foreground">—</span>;
}

interface LocationTableRowProps {
  character: CharacterLocationOverview;
}

export function LocationTableRow({ character }: LocationTableRowProps) {
  if (!character.has_location_scope) {
    return (
      <TableRow>
        <TableCell className="text-center opacity-50">
          <span>—</span>
        </TableCell>
        <TableCell className="font-medium opacity-50">
          <Link
            to="/characters/$characterId"
            params={{ characterId: character.character_id.toString() }}
            className="flex items-center gap-3 hover:underline"
          >
            <img
              src={`https://images.evetech.net/characters/${character.character_id}/portrait?size=32`}
              alt={character.character_name}
              className="h-8 w-8 rounded object-contain shrink-0"
              width={32}
              height={32}
              loading="lazy"
            />
            <span>{character.character_name}</span>
          </Link>
        </TableCell>
        <TableCell colSpan={5}>
          <span className="text-muted-foreground text-sm">
            Missing location scopes. Re-authenticate this character to grant
            location access.
          </span>
        </TableCell>
      </TableRow>
    );
  }

  const isOnline = character.is_online ?? false;
  const isDocked = character.is_docked ?? false;

  const { dockedIcon, dockedLabel } = match({ isDocked, isOnline })
    .with({ isDocked: true }, () => ({
      dockedIcon: (
        <MapPinHouse className="h-4 w-4 text-muted-foreground" />
      ) as React.ReactNode,
      dockedLabel: 'Docked',
    }))
    .with({ isOnline: true }, () => ({
      dockedIcon: (
        <Rocket className="h-4 w-4 text-muted-foreground" />
      ) as React.ReactNode,
      dockedLabel: 'Undocked',
    }))
    .otherwise(() => ({
      dockedIcon: (
        <Rocket className="h-4 w-4 text-yellow-500" />
      ) as React.ReactNode,
      dockedLabel: 'Undocked (offline)',
    }));

  const hasImplants = character.implants.length > 0;

  return (
    <TableRow>
      <TableCell className="text-center">
        <div
          className={cn(
            'h-2 w-2 rounded-full mx-auto',
            isOnline
              ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]'
              : 'bg-gray-400'
          )}
        />
      </TableCell>
      <TableCell className="font-medium">
        <Link
          to="/characters/$characterId"
          params={{ characterId: character.character_id.toString() }}
          className="flex items-center gap-3 hover:underline"
        >
          <img
            src={`https://images.evetech.net/characters/${character.character_id}/portrait?size=32`}
            alt={character.character_name}
            className="h-8 w-8 rounded object-contain shrink-0"
            width={32}
            height={32}
            loading="lazy"
          />
          <span>{character.character_name}</span>
        </Link>
      </TableCell>
      <TableCell className="text-center">
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex justify-center">{dockedIcon}</span>
          </TooltipTrigger>
          <TooltipContent>{dockedLabel}</TooltipContent>
        </Tooltip>
      </TableCell>
      <TableCell>
        {character.ship_type_id && character.ship_name ? (
          <div className="flex items-center gap-2">
            <img
              src={`https://images.evetech.net/types/${character.ship_type_id}/render?size=32`}
              alt={character.ship_type_name ?? ''}
              className="h-8 w-8 rounded object-contain"
            />
            <span>
              {character.ship_name}
              {character.ship_type_name && (
                <span className="text-muted-foreground ml-1">
                  · {character.ship_type_name}
                </span>
              )}
            </span>
          </div>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="text-center">
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex justify-center">
              <UserPlus
                className={cn(
                  'h-4 w-4',
                  hasImplants ? 'text-primary' : 'text-muted-foreground/50'
                )}
              />
            </span>
          </TooltipTrigger>
          <TooltipContent>
            {hasImplants ? (
              <ul className="space-y-0.5">
                {character.implants.map((implant) => (
                  <li key={implant.type_id}>{implant.name}</li>
                ))}
              </ul>
            ) : (
              <span>No implants</span>
            )}
          </TooltipContent>
        </Tooltip>
      </TableCell>
      <TableCell>
        <LocationCell
          system={character.solar_system_name}
          region={character.region_name}
        />
      </TableCell>
      <TableCell>
        {(character.station_name ?? character.structure_name) ? (
          <div className="flex items-center gap-2">
            {character.structure_type_id && (
              <img
                src={`https://images.evetech.net/types/${character.structure_type_id}/render?size=32`}
                alt=""
                className="h-8 w-8 rounded object-contain"
              />
            )}
            <span>{character.station_name ?? character.structure_name}</span>
          </div>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
    </TableRow>
  );
}
