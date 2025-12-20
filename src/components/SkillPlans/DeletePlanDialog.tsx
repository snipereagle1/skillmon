import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface DeletePlanDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  planName?: string;
  onConfirm: () => void;
  isDeleting?: boolean;
}

export function DeletePlanDialog({
  open,
  onOpenChange,
  planName,
  onConfirm,
  isDeleting = false,
}: DeletePlanDialogProps) {
  const handleConfirm = () => {
    onConfirm();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete Skill Plan</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete{' '}
            {planName ? (
              <span className="font-semibold">{planName}</span>
            ) : (
              'this plan'
            )}
            ? This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isDeleting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleConfirm}
            disabled={isDeleting}
          >
            {isDeleting ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
