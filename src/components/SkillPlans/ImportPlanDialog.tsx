import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { match } from 'ts-pattern';

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
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import {
  useImportSkillPlanJson,
  useImportSkillPlanText,
  useImportSkillPlanXml,
} from '@/hooks/tauri/useSkillPlans';

interface ImportPlanDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  planId: number;
}

export function ImportPlanDialog({
  open,
  onOpenChange,
  planId,
}: ImportPlanDialogProps) {
  const [format, setFormat] = useState<'text' | 'xml' | 'json'>('text');
  const [text, setText] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importTextMutation = useImportSkillPlanText();
  const importXmlMutation = useImportSkillPlanXml();
  const importJsonMutation = useImportSkillPlanJson();

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const contents = await file.text();
      setText(contents);
    } catch (err) {
      console.error('Failed to read file:', err);
      toast.error('Failed to read file');
    }
  };

  const handleImport = async () => {
    if (!text.trim()) return;

    try {
      await match(format)
        .with('text', () => importTextMutation.mutateAsync({ planId, text }))
        .with('xml', () => importXmlMutation.mutateAsync({ planId, xml: text }))
        .with('json', () => {
          const planJson = JSON.parse(text);
          return importJsonMutation.mutateAsync({ plan: planJson });
        })
        .exhaustive();

      setText('');
      onOpenChange(false);
    } catch (err) {
      console.error('Failed to import plan:', err);
      if (format === 'json') {
        toast.error('Invalid JSON format');
      }
    }
  };

  const error =
    importTextMutation.error ||
    importXmlMutation.error ||
    importJsonMutation.error ||
    null;

  const isPending =
    importTextMutation.isPending ||
    importXmlMutation.isPending ||
    importJsonMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import Skill Plan</DialogTitle>
          <DialogDescription>
            Import skills from a plain text or XML file. Paste the content below
            or select a file.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Format</Label>
            <RadioGroup
              value={format}
              onValueChange={(v) => setFormat(v as 'text' | 'xml' | 'json')}
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="text" id="text" />
                <Label htmlFor="text" className="cursor-pointer">
                  Plain Text
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="json" id="json" />
                <Label htmlFor="json" className="cursor-pointer">
                  Skillmon JSON
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="xml" id="xml" />
                <Label htmlFor="xml" className="cursor-pointer">
                  XML (PyFA/EVEMon format)
                </Label>
              </div>
            </RadioGroup>
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label htmlFor="import-text">Content</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
              >
                Select File
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept={match(format)
                  .with('text', () => '.txt')
                  .with('json', () => '.json')
                  .with('xml', () => '.xml')
                  .exhaustive()}
                onChange={handleFileSelect}
                className="hidden"
              />
            </div>
            <Textarea
              id="import-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={match(format)
                .with(
                  'text',
                  () => 'Paste skill list here (one per line: Skill Name Level)'
                )
                .with('json', () => 'Paste Skillmon JSON content here')
                .with('xml', () => 'Paste XML content here')
                .exhaustive()}
              rows={12}
              className="font-mono text-sm max-h-[400px] overflow-y-auto"
            />
          </div>
          {error && (
            <p className="text-sm text-destructive">
              {error instanceof Error ? error.message : 'Failed to import plan'}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleImport} disabled={!text.trim() || isPending}>
            {isPending ? 'Importing...' : 'Import'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
