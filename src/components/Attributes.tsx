import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { AttributeBreakdown } from '@/generated/types';
import { useAttributes } from '@/hooks/tauri/useAttributes';
import { useCharacterRemaps, useDeleteRemap } from '@/hooks/tauri/useRemaps';

import { AddRemapDialog } from './Remaps/AddRemapDialog';

interface AttributesProps {
  characterId: number | null;
}

const ATTRIBUTE_NAMES = [
  { key: 'perception', label: 'Perception' },
  { key: 'memory', label: 'Memory' },
  { key: 'willpower', label: 'Willpower' },
  { key: 'intelligence', label: 'Intelligence' },
  { key: 'charisma', label: 'Charisma' },
] as const;

export function Attributes({ characterId }: AttributesProps) {
  const {
    data,
    isLoading: isLoadingAttributes,
    error: attributeError,
  } = useAttributes(characterId);
  const { data: remaps, isLoading: isLoadingRemaps } =
    useCharacterRemaps(characterId);
  const deleteRemapMutation = useDeleteRemap();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);

  if (isLoadingAttributes || isLoadingRemaps) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Loading attributes...</p>
      </div>
    );
  }

  if (attributeError) {
    const errorMessage =
      attributeError instanceof Error
        ? attributeError.message
        : String(attributeError);
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-destructive">Error: {errorMessage}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">No attributes data available</p>
      </div>
    );
  }

  const formatBonus = (value: number): string => {
    if (value === 0) return '—';
    return value > 0 ? `+${value}` : `${value}`;
  };

  const handleDeleteRemap = async (remapId: number) => {
    try {
      await deleteRemapMutation.mutateAsync({ remapId, characterId });
    } catch (err) {
      console.error('Failed to delete remap:', err);
    }
  };

  return (
    <div className="p-4 space-y-8">
      <div className="space-y-4">
        <h3 className="text-lg font-semibold px-1">Current Attributes</h3>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Attribute</TableHead>
              <TableHead>Base Value</TableHead>
              <TableHead>Implants</TableHead>
              <TableHead>Remaps</TableHead>
              <TableHead>Accelerator</TableHead>
              <TableHead>Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ATTRIBUTE_NAMES.map(({ key, label }) => {
              const attr: AttributeBreakdown = data[key as keyof typeof data];
              return (
                <TableRow key={key}>
                  <TableCell className="font-medium">{label}</TableCell>
                  <TableCell>{attr.base}</TableCell>
                  <TableCell>{formatBonus(attr.implants)}</TableCell>
                  <TableCell>{formatBonus(attr.remap)}</TableCell>
                  <TableCell>{formatBonus(attr.accelerator)}</TableCell>
                  <TableCell className="font-semibold">{attr.total}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-lg font-semibold">Remap History</h3>
          <Button
            size="sm"
            onClick={() => setIsAddDialogOpen(true)}
            className="gap-2"
          >
            <Plus className="h-4 w-4" />
            Record Remap
          </Button>
        </div>

        {remaps && remaps.length > 0 ? (
          <div className="border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-center">Perception</TableHead>
                  <TableHead className="text-center">Memory</TableHead>
                  <TableHead className="text-center">Willpower</TableHead>
                  <TableHead className="text-center">Intelligence</TableHead>
                  <TableHead className="text-center">Charisma</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {remaps.map((remap) => (
                  <TableRow key={remap.remap_id}>
                    <TableCell className="text-muted-foreground whitespace-nowrap">
                      {new Date(remap.created_at * 1000).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-center">
                      +{remap.perception}
                    </TableCell>
                    <TableCell className="text-center">
                      +{remap.memory}
                    </TableCell>
                    <TableCell className="text-center">
                      +{remap.willpower}
                    </TableCell>
                    <TableCell className="text-center">
                      +{remap.intelligence}
                    </TableCell>
                    <TableCell className="text-center">
                      +{remap.charisma}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => handleDeleteRemap(remap.remap_id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="text-center py-8 border border-dashed rounded-md text-muted-foreground">
            No remap history found.
          </div>
        )}
      </div>

      <AddRemapDialog
        open={isAddDialogOpen}
        onOpenChange={setIsAddDialogOpen}
        characterId={characterId}
      />
    </div>
  );
}
