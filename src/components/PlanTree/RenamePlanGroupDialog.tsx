import { useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useRenamePlanGroup } from '@/hooks/tauri/usePlanGroups';

interface RenamePlanGroupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groupId: number | null;
  currentName: string;
}

interface RenameFormProps {
  groupId: number;
  currentName: string;
  onClose: () => void;
}

function RenameForm({ groupId, currentName, onClose }: RenameFormProps) {
  // Editable form state seeded from prop; parent uses key={groupId} to remount on change.
  const [name, setName] = useState(currentName);
  const renameMutation = useRenamePlanGroup();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      await renameMutation.mutateAsync({ groupId, name: trimmed });
      onClose();
    } catch (err) {
      console.error('Failed to rename folder:', err);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <DialogHeader>
        <DialogTitle>Rename Folder</DialogTitle>
        <DialogDescription>Give this folder a new name.</DialogDescription>
      </DialogHeader>
      <div className="space-y-4 py-4">
        <div className="space-y-2">
          <Label htmlFor="rename-folder">Name</Label>
          <Input
            id="rename-folder"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        {renameMutation.isError && (
          <p className="text-sm text-destructive">
            {renameMutation.error instanceof Error
              ? renameMutation.error.message
              : String(renameMutation.error)}
          </p>
        )}
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={
            !name.trim() ||
            name.trim() === currentName ||
            renameMutation.isPending
          }
        >
          {renameMutation.isPending ? 'Saving…' : 'Rename'}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function RenamePlanGroupDialog({
  open,
  onOpenChange,
  groupId,
  currentName,
}: RenamePlanGroupDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {open && groupId != null && (
          <RenameForm
            key={groupId}
            groupId={groupId}
            currentName={currentName}
            onClose={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
