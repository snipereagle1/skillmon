import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { exportSkillPlanText, exportSkillPlanXml } from '@/generated/commands';
import {
  useSkillPlanWithEntries,
  useUpdateSkillPlan,
} from '@/hooks/tauri/useSkillPlans';

import { AddSkillDialog } from './AddSkillDialog';
import { ImportPlanDialog } from './ImportPlanDialog';
import { PlanEntryRow } from './PlanEntryRow';

interface PlanEditorProps {
  planId: number;
}

export function PlanEditor({ planId }: PlanEditorProps) {
  const { data, isLoading, error } = useSkillPlanWithEntries(planId);
  const updatePlanMutation = useUpdateSkillPlan();
  const [isEditingName, setIsEditingName] = useState(false);
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [addSkillDialogOpen, setAddSkillDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);

  const handleExportText = async () => {
    if (!data) return;
    try {
      const text = await exportSkillPlanText({ planId });
      const blob = new Blob([text], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${data.plan.name}.txt`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to export plan:', err);
      alert('Failed to export plan');
    }
  };

  const handleExportXml = async () => {
    if (!data) return;
    try {
      const xml = await exportSkillPlanXml({ planId });
      const blob = new Blob([xml], { type: 'application/xml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${data.plan.name}.xml`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to export plan:', err);
      alert('Failed to export plan');
    }
  };

  const handleSaveName = async () => {
    if (!data || !editName.trim()) return;
    try {
      await updatePlanMutation.mutateAsync({
        planId,
        name: editName.trim(),
        description: data.plan.description,
      });
      setIsEditingName(false);
    } catch (err) {
      console.error('Failed to update plan name:', err);
    }
  };

  const handleSaveDescription = async () => {
    if (!data) return;
    try {
      await updatePlanMutation.mutateAsync({
        planId,
        name: data.plan.name,
        description: editDescription.trim() || null,
      });
      setIsEditingDescription(false);
    } catch (err) {
      console.error('Failed to update plan description:', err);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Loading plan...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-destructive">
          Error:{' '}
          {error instanceof Error ? error.message : 'Failed to load plan'}
        </p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Plan not found</p>
      </div>
    );
  }

  const sortedEntries = [...data.entries].sort(
    (a, b) => a.sort_order - b.sort_order
  );

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="border-b border-border p-4 space-y-4 shrink-0">
        <div className="space-y-2">
          {isEditingName ? (
            <div className="flex items-center gap-2">
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onBlur={handleSaveName}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleSaveName();
                  } else if (e.key === 'Escape') {
                    setIsEditingName(false);
                    setEditName(data.plan.name);
                  }
                }}
                autoFocus
                className="flex-1"
              />
            </div>
          ) : (
            <h2
              className="text-2xl font-bold cursor-pointer hover:text-primary"
              onClick={() => {
                setEditName(data.plan.name);
                setIsEditingName(true);
              }}
            >
              {data.plan.name}
            </h2>
          )}
          {isEditingDescription ? (
            <div className="space-y-2">
              <Textarea
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                onBlur={handleSaveDescription}
                placeholder="Enter plan description"
                rows={3}
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={handleSaveDescription}
                  disabled={updatePlanMutation.isPending}
                >
                  Save
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setIsEditingDescription(false);
                    setEditDescription(data.plan.description || '');
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div
              className="text-muted-foreground cursor-pointer hover:text-foreground min-h-12"
              onClick={() => {
                setEditDescription(data.plan.description || '');
                setIsEditingDescription(true);
              }}
            >
              {data.plan.description || (
                <span className="italic">Click to add description</span>
              )}
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAddSkillDialogOpen(true)}
          >
            Add Skill
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setImportDialogOpen(true)}
          >
            Import
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportText}>
            Export Text
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportXml}>
            Export XML
          </Button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {sortedEntries.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-muted-foreground">
              No entries yet. Add skills to get started.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {sortedEntries.map((entry) => (
              <PlanEntryRow key={entry.entry_id} entry={entry} />
            ))}
          </div>
        )}
      </div>
      <AddSkillDialog
        open={addSkillDialogOpen}
        onOpenChange={setAddSkillDialogOpen}
        planId={planId}
      />
      <ImportPlanDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        planId={planId}
      />
    </div>
  );
}
