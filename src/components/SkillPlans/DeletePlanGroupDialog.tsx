import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useDeletePlanGroup } from '@/hooks/tauri/usePlanGroups';

interface DeletePlanGroupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groupId: number | null;
  groupName: string;
}

interface DeleteFormProps {
  groupId: number;
  groupName: string;
  onClose: () => void;
}

function DeleteForm({ groupId, groupName, onClose }: DeleteFormProps) {
  const deleteMutation = useDeletePlanGroup();
  const [confirmCascade, setConfirmCascade] = useState(false);

  // Reset the second-click arming if the user idles for a few seconds.
  useEffect(() => {
    if (!confirmCascade) return;
    const t = setTimeout(() => setConfirmCascade(false), 4000);
    return () => clearTimeout(t);
  }, [confirmCascade]);

  const handleDelete = async (cascadePlans: boolean) => {
    try {
      await deleteMutation.mutateAsync({ groupId, cascadePlans });
      onClose();
    } catch (err) {
      console.error('Failed to delete folder:', err);
    }
  };

  const onCascadeClick = () => {
    if (!confirmCascade) {
      setConfirmCascade(true);
      return;
    }
    void handleDelete(true);
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Delete folder &ldquo;{groupName}&rdquo;?</DialogTitle>
        <DialogDescription>
          Choose what happens to the folder&rsquo;s contents. Deleting the
          folder only moves its plans and subfolders up to the parent. Deleting
          everything removes every plan and subfolder inside.
        </DialogDescription>
      </DialogHeader>
      {deleteMutation.isError && (
        <p className="text-sm text-destructive">
          {deleteMutation.error instanceof Error
            ? deleteMutation.error.message
            : String(deleteMutation.error)}
        </p>
      )}
      <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end sm:gap-2">
        <Button
          variant="outline"
          onClick={onClose}
          disabled={deleteMutation.isPending}
        >
          Cancel
        </Button>
        <Button
          variant="secondary"
          onClick={() => handleDelete(false)}
          disabled={deleteMutation.isPending}
        >
          Delete folder only
        </Button>
        <Button
          variant="destructive"
          onClick={onCascadeClick}
          disabled={deleteMutation.isPending}
        >
          {confirmCascade ? 'Click again to confirm' : 'Delete Folder & Plans'}
        </Button>
      </DialogFooter>
    </>
  );
}

export function DeletePlanGroupDialog({
  open,
  onOpenChange,
  groupId,
  groupName,
}: DeletePlanGroupDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {open && groupId != null && (
          <DeleteForm
            key={groupId}
            groupId={groupId}
            groupName={groupName}
            onClose={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
