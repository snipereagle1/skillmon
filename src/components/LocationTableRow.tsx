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
import type { LocationPayload } from '@/generated/types';
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
  character: LocationPayload;
}

export function LocationTableRow({ character }: LocationTableRowProps) {
  if (!character.hasLocationScope) {
    return (
      <TableRow>
        <TableCell className="text-center opacity-50">
          <span>—</span>
        </TableCell>
        <TableCell className="font-medium opacity-50">
          <Link
            to="/characters/$characterId"
            params={{ characterId: character.characterId.toString() }}
            className="flex items-center gap-3 hover:underline"
          >
            <img
              src={`https://images.evetech.net/characters/${character.characterId}/portrait?size=32`}
              alt={character.characterName}
              className="h-8 w-8 rounded object-contain shrink-0"
              width={32}
              height={32}
              loading="lazy"
            />
            <span>{character.characterName}</span>
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

  const isOnline = character.isOnline ?? false;
  const isDocked = character.isDocked ?? false;

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
        <Rocket className="h-4 w-4 text-status-paused" />
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
              ? 'bg-status-training shadow-status-training-glow'
              : 'bg-fg-dim'
          )}
        />
      </TableCell>
      <TableCell className="font-medium">
        <Link
          to="/characters/$characterId"
          params={{ characterId: character.characterId.toString() }}
          className="flex items-center gap-3 hover:underline"
        >
          <img
            src={`https://images.evetech.net/characters/${character.characterId}/portrait?size=32`}
            alt={character.characterName}
            className="h-8 w-8 rounded object-contain shrink-0"
            width={32}
            height={32}
            loading="lazy"
          />
          <span>{character.characterName}</span>
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
        {character.shipTypeId ? (
          <div className="flex items-center gap-2">
            <img
              src={`https://images.evetech.net/types/${character.shipTypeId}/render?size=32`}
              alt={character.shipTypeName ?? ''}
              className="h-8 w-8 rounded object-contain"
            />
            <span>
              {character.shipName || character.shipTypeName}
              {character.shipName && character.shipTypeName && (
                <span className="text-muted-foreground ml-1">
                  · {character.shipTypeName}
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
                  <li key={implant.typeId}>{implant.name}</li>
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
          system={character.solarSystemName}
          region={character.regionName}
        />
      </TableCell>
      <TableCell>
        {(character.stationName ?? character.structureName) ? (
          <div className="flex items-center gap-2">
            {character.structureTypeId && (
              <img
                src={`https://images.evetech.net/types/${character.structureTypeId}/render?size=32`}
                alt=""
                className="h-8 w-8 rounded object-contain"
              />
            )}
            <span>{character.stationName ?? character.structureName}</span>
          </div>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
    </TableRow>
  );
}
