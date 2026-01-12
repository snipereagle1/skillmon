import { AlertCircle, AlertTriangle, CheckCircle2, Info } from 'lucide-react';

import { ScrollArea } from '@/components/ui/scroll-area';
import type {
  ValidationEntryResponse,
  ValidationResponse,
} from '@/generated/types';
import { useSkillPlanValidation } from '@/hooks/tauri/useSkillPlans';
import { cn } from '@/lib/utils';

interface SkillPlanValidationDisplayProps {
  planId: number;
  validationOverride?: ValidationResponse | null;
  isProposed?: boolean;
}

export function SkillPlanValidationDisplay({
  planId,
  validationOverride,
  isProposed,
}: SkillPlanValidationDisplayProps) {
  const { data: fetchedValidation, isLoading } = useSkillPlanValidation(planId);

  const validation =
    validationOverride !== undefined ? validationOverride : fetchedValidation;

  if (isLoading || !validation) {
    if (!isProposed) return null;
    return (
      <div className="flex items-center gap-4 p-2 px-4 h-10">
        <span className="text-xs text-muted-foreground italic">
          Validating proposed order...
        </span>
      </div>
    );
  }

  const hasIssues =
    validation.errors.length > 0 || validation.warnings.length > 0;

  const statusContent = (
    <div className="flex items-center gap-2">
      {validation.is_valid && !hasIssues ? (
        <>
          <CheckCircle2 className="h-4 w-4 text-green-500" />
          <span className="text-xs font-medium text-green-600 dark:text-green-400">
            {isProposed ? 'Proposed order is valid' : 'Plan is valid'}
          </span>
        </>
      ) : validation.errors.length > 0 ? (
        <>
          <AlertCircle className="h-4 w-4 text-destructive" />
          <span className="text-xs font-bold text-destructive">
            {isProposed ? 'Proposed order has errors' : 'Plan has errors'}
          </span>
        </>
      ) : (
        <>
          <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-500" />
          <span className="text-xs font-bold text-yellow-700 dark:text-yellow-400">
            {isProposed ? 'Proposed order has warnings' : 'Plan has warnings'}
          </span>
        </>
      )}
    </div>
  );

  return (
    <div className="flex flex-col w-full">
      <div className="flex items-center justify-between gap-4 p-2 px-4 border-b border-border/50 h-10 shrink-0">
        <div className="flex items-center gap-4">
          {statusContent}
          {isProposed && (
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 text-[10px] font-bold uppercase tracking-wider">
              <Info className="h-3 w-3" />
              <span>Preview</span>
            </div>
          )}
        </div>
      </div>

      {hasIssues && (
        <div className="p-3 bg-muted/20">
          <div className="space-y-3">
            {validation.errors.length > 0 && (
              <div className="flex flex-col gap-1">
                <ScrollArea className="h-20">
                  <ul className="list-disc pl-6 space-y-0.5">
                    {validation.errors.map((error, idx) => (
                      <li key={idx} className="text-xs text-destructive">
                        {formatError(error)}
                      </li>
                    ))}
                  </ul>
                </ScrollArea>
              </div>
            )}
            {validation.warnings.length > 0 && (
              <div className="flex flex-col gap-1">
                <ScrollArea
                  className={cn(
                    'h-20',
                    validation.errors.length > 0 &&
                      'pt-2 border-t border-border/50'
                  )}
                >
                  <ul className="list-disc pl-6 space-y-0.5">
                    {validation.warnings.map((warning, idx) => (
                      <li
                        key={idx}
                        className="text-xs text-yellow-700 dark:text-yellow-400"
                      >
                        {formatError(warning)}
                      </li>
                    ))}
                  </ul>
                </ScrollArea>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function formatError(error: ValidationEntryResponse) {
  switch (error.variant) {
    case 'Cycle':
      return 'Circular dependency detected in plan.';
    case 'MissingPrerequisite':
      return `${error.node_skill_name} ${levelToRoman(error.node_level)} is missing prerequisite ${error.other_skill_name} ${levelToRoman(error.other_level)}.`;
    case 'OrderingViolation':
      return `${error.node_skill_name} ${levelToRoman(error.node_level)} would be trained before its prerequisite ${error.other_skill_name} ${levelToRoman(error.other_level)}.`;
    default:
      return 'Unknown validation issue';
  }
}

function levelToRoman(level: number) {
  return ['I', 'II', 'III', 'IV', 'V'][level - 1] || level.toString();
}
