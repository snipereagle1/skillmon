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

export function DeletePlanGroupDialog({
  open,
  onOpenChange,
  groupId,
  groupName,
}: DeletePlanGroupDialogProps) {
  const deleteMutation = useDeletePlanGroup();

  const handleDelete = async (cascadePlans: boolean) => {
    if (groupId == null) return;
    try {
      await deleteMutation.mutateAsync({ groupId, cascadePlans });
      onOpenChange(false);
    } catch (err) {
      console.error('Failed to delete folder:', err);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete folder &ldquo;{groupName}&rdquo;?</DialogTitle>
          <DialogDescription>
            Choose what happens to the folder&rsquo;s contents. Deleting the
            folder only moves its plans and subfolders up to the parent.
            Deleting everything removes every plan and subfolder inside.
          </DialogDescription>
        </DialogHeader>
        {deleteMutation.isError && (
          <p className="text-sm text-destructive">
            {deleteMutation.error instanceof Error
              ? deleteMutation.error.message
              : String(deleteMutation.error)}
          </p>
        )}
        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
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
            onClick={() => handleDelete(true)}
            disabled={deleteMutation.isPending}
          >
            Delete folder and all plans inside it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
