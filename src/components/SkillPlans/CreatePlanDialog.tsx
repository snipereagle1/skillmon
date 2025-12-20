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
import { Textarea } from '@/components/ui/textarea';
import { useCreateSkillPlan } from '@/hooks/tauri/useSkillPlans';

interface CreatePlanDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (planId: number) => void;
}

export function CreatePlanDialog({
  open,
  onOpenChange,
  onSuccess,
}: CreatePlanDialogProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const createPlanMutation = useCreateSkillPlan();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    try {
      const planId = await createPlanMutation.mutateAsync({
        name: name.trim(),
        description: description.trim() || null,
      });
      setName('');
      setDescription('');
      onOpenChange(false);
      if (onSuccess) {
        onSuccess(planId);
      }
    } catch (err) {
      console.error('Failed to create plan:', err);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Create Skill Plan</DialogTitle>
            <DialogDescription>
              Create a new skill plan to organize your training goals.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Plan Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter plan name"
                autoFocus
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description (optional)</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Enter plan description"
                rows={3}
              />
            </div>
            {createPlanMutation.isError && (
              <p className="text-sm text-destructive">
                {createPlanMutation.error instanceof Error
                  ? createPlanMutation.error.message
                  : 'Failed to create plan'}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!name.trim() || createPlanMutation.isPending}
            >
              {createPlanMutation.isPending ? 'Creating...' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
