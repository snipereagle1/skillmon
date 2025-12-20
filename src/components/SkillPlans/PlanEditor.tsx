import { save } from '@tauri-apps/plugin-dialog';
import { writeTextFile } from '@tauri-apps/plugin-fs';
import { Copy } from 'lucide-react';
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
  const [isExportingText, setIsExportingText] = useState(false);
  const [isExportingXml, setIsExportingXml] = useState(false);
  const [isCopyingText, setIsCopyingText] = useState(false);

  const handleExportText = async () => {
    if (!data) {
      console.log('No data available for export');
      return;
    }
    console.log('Starting text export...');
    setIsExportingText(true);
    try {
      console.log('Fetching plan text...');
      const text = await exportSkillPlanText({ planId });
      console.log('Plan text fetched, opening save dialog...');
      const filePath = await save({
        title: 'Save Skill Plan',
        defaultPath: `${data.plan.name}.txt`,
        filters: [
          { name: 'Text Files', extensions: ['txt'] },
          { name: 'All Files', extensions: ['*'] },
        ],
      });
      console.log('Save dialog result:', filePath);

      if (filePath) {
        console.log('Writing file to:', filePath);
        await writeTextFile(filePath, text);
        console.log('File written successfully');
      } else {
        console.log('Save dialog cancelled by user');
      }
    } catch (err) {
      console.error('Failed to export plan:', err);
      const errorMessage =
        err instanceof Error ? err.message : 'Unknown error occurred';
      alert(`Failed to export plan: ${errorMessage}`);
    } finally {
      setIsExportingText(false);
    }
  };

  const handleExportXml = async () => {
    if (!data) {
      console.log('No data available for export');
      return;
    }
    console.log('Starting XML export...');
    setIsExportingXml(true);
    try {
      console.log('Fetching plan XML...');
      const xml = await exportSkillPlanXml({ planId });
      console.log('Plan XML fetched, opening save dialog...');
      const filePath = await save({
        title: 'Save Skill Plan',
        defaultPath: `${data.plan.name}.xml`,
        filters: [
          { name: 'XML Files', extensions: ['xml'] },
          { name: 'All Files', extensions: ['*'] },
        ],
      });
      console.log('Save dialog result:', filePath);

      if (filePath) {
        console.log('Writing file to:', filePath);
        await writeTextFile(filePath, xml);
        console.log('File written successfully');
      } else {
        console.log('Save dialog cancelled by user');
      }
    } catch (err) {
      console.error('Failed to export plan:', err);
      const errorMessage =
        err instanceof Error ? err.message : 'Unknown error occurred';
      alert(`Failed to export plan: ${errorMessage}`);
    } finally {
      setIsExportingXml(false);
    }
  };

  const handleCopyTextToClipboard = async () => {
    if (!data) return;
    setIsCopyingText(true);
    try {
      const text = await exportSkillPlanText({ planId });
      await navigator.clipboard.writeText(text);
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
      alert('Failed to copy to clipboard');
    } finally {
      setIsCopyingText(false);
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

  const totalSP = sortedEntries.reduce(
    (sum, entry) => sum + entry.skillpoints_for_level,
    0
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
        {sortedEntries.length > 0 && (
          <div className="text-sm text-foreground">
            <span className="font-medium">Total Skillpoints: </span>
            <span>{totalSP.toLocaleString('en-US')}</span>
          </div>
        )}
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
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportText}
            disabled={isExportingText}
          >
            Export Text
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopyTextToClipboard}
            disabled={isCopyingText}
          >
            <Copy className="mr-2 h-4 w-4" />
            Copy Text
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportXml}
            disabled={isExportingXml}
          >
            Export XML
          </Button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {sortedEntries.length === 0 ? (
          <div className="flex items-center justify-center h-full p-8">
            <p className="text-muted-foreground">
              No entries yet. Add skills to get started.
            </p>
          </div>
        ) : (
          (() => {
            let cumulativeSP = 0;
            return sortedEntries.map((entry) => {
              const offsetPercentage =
                totalSP > 0 ? (cumulativeSP / totalSP) * 100 : 0;
              cumulativeSP += entry.skillpoints_for_level;
              return (
                <PlanEntryRow
                  key={entry.entry_id}
                  entry={entry}
                  totalPlanSP={totalSP}
                  offsetPercentage={offsetPercentage}
                />
              );
            });
          })()
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
