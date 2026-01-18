import { useState } from 'react';
import { Minus, Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import type { Attributes } from '@/generated/types';
import { useSaveRemap } from '@/hooks/tauri/useRemaps';

interface AddRemapDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  characterId?: number | null;
  planId?: number | null;
  afterSkillTypeId?: number | null;
  afterSkillLevel?: number | null;
  title?: string;
  description?: string;
}

const ATTRIBUTES: (keyof Attributes)[] = [
  'perception',
  'memory',
  'willpower',
  'intelligence',
  'charisma',
];

export function AddRemapDialog({
  open,
  onOpenChange,
  characterId = null,
  planId = null,
  afterSkillTypeId = null,
  afterSkillLevel = null,
  title = 'Record Remap',
  description = 'Set the attribute points for this remap. You have 14 points to distribute, with a maximum of 10 in any single attribute.',
}: AddRemapDialogProps) {
  const [attributes, setAttributes] = useState<Attributes>({
    perception: 0,
    memory: 0,
    willpower: 0,
    intelligence: 0,
    charisma: 0,
  });

  const saveRemapMutation = useSaveRemap();

  const totalPoints = Object.values(attributes).reduce((sum, val) => sum + val, 0);

  const handleAttributeChange = (attr: keyof Attributes, delta: number) => {
    const currentValue = attributes[attr];
    const newValue = Math.max(0, Math.min(10, currentValue + delta));

    if (delta > 0 && totalPoints >= 14) return;
    if (newValue === currentValue) return;

    setAttributes((prev) => ({
      ...prev,
      [attr]: newValue,
    }));
  };

  const handleSave = async () => {
    try {
      await saveRemapMutation.mutateAsync({
        characterId,
        planId,
        afterSkillTypeId,
        afterSkillLevel,
        attributes,
      });
      onOpenChange(false);
      // Reset state for next time
      setAttributes({
        perception: 0,
        memory: 0,
        willpower: 0,
        intelligence: 0,
        charisma: 0,
      });
    } catch (err) {
      console.error('Failed to save remap:', err);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="flex items-center justify-between px-1">
            <span className="text-sm font-medium">Points Distributed</span>
            <span className={`text-sm font-bold ${totalPoints === 14 ? 'text-green-600' : 'text-muted-foreground'}`}>
              {totalPoints} / 14
            </span>
          </div>

          <div className="space-y-4">
            {ATTRIBUTES.map((attr) => (
              <div key={attr} className="flex items-center justify-between">
                <Label className="capitalize w-24">{attr}</Label>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => handleAttributeChange(attr, -1)}
                    disabled={attributes[attr] <= 0}
                  >
                    <Minus className="h-4 w-4" />
                  </Button>
                  <div className="w-10 text-center font-mono font-bold">
                    +{attributes[attr]}
                  </div>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => handleAttributeChange(attr, 1)}
                    disabled={attributes[attr] >= 10 || totalPoints >= 14}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>

          {saveRemapMutation.isError && (
            <p className="text-sm text-destructive">
              {saveRemapMutation.error instanceof Error ? saveRemapMutation.error.message : 'Failed to save remap'}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saveRemapMutation.isPending}>
            {saveRemapMutation.isPending ? 'Saving...' : 'Save Remap'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
