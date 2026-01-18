import { Calendar, Plus, Trash2 } from 'lucide-react';
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
import { useDeleteRemap, usePlanRemaps } from '@/hooks/tauri/useRemaps';
import { useSkillPlanWithEntries } from '@/hooks/tauri/useSkillPlans';

import { AddRemapDialog } from '../Remaps/AddRemapDialog';

interface PlanRemapsTabProps {
  planId: number;
}

export function PlanRemapsTab({ planId }: PlanRemapsTabProps) {
  const { data: remaps, isLoading: isLoadingRemaps } = usePlanRemaps(planId);
  const { data: planWithEntries } = useSkillPlanWithEntries(planId);
  const deleteRemapMutation = useDeleteRemap();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);

  if (isLoadingRemaps) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Loading remaps...</p>
      </div>
    );
  }

  const handleDeleteRemap = async (remapId: number) => {
    try {
      await deleteRemapMutation.mutateAsync({ remapId, planId });
    } catch (err) {
      console.error('Failed to delete remap:', err);
    }
  };

  const entries = planWithEntries?.entries || [];

  return (
    <div className="p-4 space-y-6">
      <div className="flex items-center justify-between px-1">
        <div className="space-y-1">
          <h3 className="text-lg font-semibold">Plan Remap Schedule</h3>
          <p className="text-sm text-muted-foreground">
            Saved remaps that will be applied during simulation of this plan.
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => setIsAddDialogOpen(true)}
          className="gap-2"
        >
          <Plus className="h-4 w-4" />
          Add Remap
        </Button>
      </div>

      {remaps && remaps.length > 0 ? (
        <div className="border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Scheduled At</TableHead>
                <TableHead className="text-center">Perception</TableHead>
                <TableHead className="text-center">Memory</TableHead>
                <TableHead className="text-center">Willpower</TableHead>
                <TableHead className="text-center">Intelligence</TableHead>
                <TableHead className="text-center">Charisma</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {remaps.map((remap) => {
                const skillName = entries.find(
                  (e) =>
                    e.skill_type_id === remap.after_skill_type_id &&
                    e.planned_level === remap.after_skill_level
                )?.skill_name;

                return (
                  <TableRow key={remap.remap_id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        {remap.after_skill_type_id
                          ? `After ${skillName} ${remap.after_skill_level}`
                          : 'At Start of Plan'}
                      </div>
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
                );
              })}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="text-center py-12 border border-dashed rounded-md text-muted-foreground">
          <p>No saved remaps for this plan.</p>
          <p className="text-sm">
            Use the &quot;Optimize&quot; tool in Simulation or add one manually.
          </p>
        </div>
      )}

      <AddRemapDialog
        open={isAddDialogOpen}
        onOpenChange={setIsAddDialogOpen}
        planId={planId}
        title="Add Plan Remap"
        description="Schedule a remap to occur at a specific point in this skill plan."
      />
    </div>
  );
}
