import {
  type QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';

import type {
  MergeIntoPlanResponse,
  PreviewPlanFromCharacterResponse,
  ReplacePlanEntryInput,
  SkillmonPlan,
  SkillPlanResponse,
  SkillPlanWithEntriesResponse,
  ValidationResponse,
} from '@/generated/types';

import { queryKeys } from './queryKeys';

interface CreateSkillPlanParams {
  [key: string]: unknown;
  name: string;
  description?: string;
  autoPrerequisites?: boolean;
  groupId?: number | null;
}

interface CreateMergedSkillPlanParams {
  [key: string]: unknown;
  name: string;
  description?: string;
  sourcePlanIds: number[];
}

interface MergePlansIntoParams {
  [key: string]: unknown;
  targetPlanId: number;
  sourcePlanIds: number[];
}

interface ReplacePlanEntriesParams {
  [key: string]: unknown;
  planId: number;
  entries: ReplacePlanEntryInput[];
}

interface UpdateSkillPlanParams {
  [key: string]: unknown;
  planId: number;
  name: string;
  description?: string;
  autoPrerequisites: boolean;
}

interface DeleteSkillPlanParams {
  [key: string]: unknown;
  planId: number;
}

interface AddPlanEntryParams {
  [key: string]: unknown;
  planId: number;
  skillTypeId: number;
  plannedLevel: number;
  notes?: string;
}

interface UpdatePlanEntryParams {
  [key: string]: unknown;
  entryId: number;
  plannedLevel?: number;
  notes?: string;
}

interface DeletePlanEntryParams {
  [key: string]: unknown;
  entryId: number;
}

interface ReorderPlanEntriesParams {
  [key: string]: unknown;
  planId: number;
  entryIds: number[];
}

interface ImportSkillPlanTextParams {
  [key: string]: unknown;
  planId: number;
  text: string;
}

interface ImportSkillPlanXmlParams {
  [key: string]: unknown;
  planId: number;
  xml: string;
}

interface ValidateReorderParams {
  [key: string]: unknown;
  planId: number;
  entryIds: number[];
}

interface ExportSkillPlanJsonParams {
  [key: string]: unknown;
  planId: number;
}

interface ImportSkillPlanJsonParams {
  [key: string]: unknown;
  plan: SkillmonPlan;
}

interface CreatePlanFromCharacterParams {
  [key: string]: unknown;
  characterId: number;
  planName: string;
  description?: string;
  includedGroupIds: number[];
}

// Invalidate every cache a plan derives from its entries. Used by every
// mutation that rewrites a plan's entries wholesale (merge / replace / import).
// The plan's own row (skillPlans / skillPlan) is intentionally left alone — its
// response carries no entry-derived fields and these writes don't bump
// updated_at — and skillPlanWithEntries is seeded by the caller from the
// authoritative response, so it is not invalidated here either.
function invalidatePlanDerivedCaches(queryClient: QueryClient, planId: number) {
  const keys = [
    queryKeys.skillPlanValidation(planId),
    queryKeys.skillPlanSimulation(planId),
    queryKeys.skillPlanOptimization(planId),
    queryKeys.planComparisonByPlan(planId),
    queryKeys.planComparisonAll(planId),
    queryKeys.exportSkillPlanText(planId),
    queryKeys.exportSkillPlanXml(planId),
    queryKeys.remaps.plan(planId),
  ];
  for (const queryKey of keys) {
    queryClient.invalidateQueries({ queryKey });
  }
}

export function useSkillPlans() {
  return useQuery<SkillPlanResponse[]>({
    queryKey: queryKeys.skillPlans(),
    queryFn: async () => {
      return await invoke<SkillPlanResponse[]>('get_all_skill_plans');
    },
  });
}

export function useSkillPlan(planId: number | null) {
  return useQuery<SkillPlanResponse | null>({
    queryKey: queryKeys.skillPlan(planId),
    queryFn: async () => {
      if (planId === null) {
        return null;
      }
      return await invoke<SkillPlanResponse>('get_skill_plan', { planId });
    },
    enabled: planId !== null,
  });
}

export function useSkillPlanWithEntries(planId: number | null) {
  return useQuery<SkillPlanWithEntriesResponse | null>({
    queryKey: queryKeys.skillPlanWithEntries(planId),
    queryFn: async () => {
      if (planId === null) {
        return null;
      }
      return await invoke<SkillPlanWithEntriesResponse>(
        'get_skill_plan_with_entries',
        { planId }
      );
    },
    enabled: planId !== null,
  });
}

export function useCreateSkillPlan() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: CreateSkillPlanParams) => {
      return await invoke<number>('create_skill_plan', params);
    },
    onSuccess: (data) => {
      queryClient.removeQueries({ queryKey: queryKeys.skillPlan(data) });
      queryClient.removeQueries({
        queryKey: queryKeys.skillPlanWithEntries(data),
      });
      queryClient.removeQueries({
        queryKey: queryKeys.skillPlanValidation(data),
      });
      queryClient.removeQueries({
        queryKey: queryKeys.planComparisonByPlan(data),
      });
      queryClient.removeQueries({
        queryKey: queryKeys.planComparisonAll(data),
      });
      queryClient.removeQueries({
        queryKey: queryKeys.exportSkillPlanText(data),
      });
      queryClient.removeQueries({
        queryKey: queryKeys.exportSkillPlanXml(data),
      });
      queryClient.removeQueries({
        queryKey: queryKeys.remaps.plan(data),
      });
      queryClient.removeQueries({
        queryKey: queryKeys.skillPlanSimulation(data),
      });
      queryClient.removeQueries({
        queryKey: queryKeys.skillPlanOptimization(data),
      });

      queryClient.invalidateQueries({ queryKey: queryKeys.skillPlans() });
    },
  });
}

export function useCreateMergedSkillPlan() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: CreateMergedSkillPlanParams) => {
      return await invoke<number>('create_merged_skill_plan', params);
    },
    onSuccess: (data) => {
      queryClient.removeQueries({ queryKey: queryKeys.skillPlan(data) });
      queryClient.removeQueries({
        queryKey: queryKeys.skillPlanWithEntries(data),
      });
      queryClient.removeQueries({
        queryKey: queryKeys.skillPlanValidation(data),
      });
      queryClient.removeQueries({
        queryKey: queryKeys.planComparisonByPlan(data),
      });
      queryClient.removeQueries({
        queryKey: queryKeys.planComparisonAll(data),
      });
      queryClient.removeQueries({
        queryKey: queryKeys.exportSkillPlanText(data),
      });
      queryClient.removeQueries({
        queryKey: queryKeys.exportSkillPlanXml(data),
      });
      queryClient.removeQueries({
        queryKey: queryKeys.remaps.plan(data),
      });
      queryClient.removeQueries({
        queryKey: queryKeys.skillPlanSimulation(data),
      });
      queryClient.removeQueries({
        queryKey: queryKeys.skillPlanOptimization(data),
      });

      queryClient.invalidateQueries({ queryKey: queryKeys.skillPlans() });
    },
  });
}

export function useMergePlansInto() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: MergePlansIntoParams) => {
      return await invoke<MergeIntoPlanResponse>('merge_plans_into', params);
    },
    onSuccess: (data, params) => {
      const targetId = params.targetPlanId;
      // Seed from the authoritative merge response; invalidate the rest.
      queryClient.setQueryData(
        queryKeys.skillPlanWithEntries(targetId),
        data.plan
      );
      invalidatePlanDerivedCaches(queryClient, targetId);
    },
  });
}

export function useReplacePlanEntries() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: ReplacePlanEntriesParams) => {
      return await invoke<SkillPlanWithEntriesResponse>(
        'replace_plan_entries',
        params
      );
    },
    onSuccess: (data, params) => {
      const planId = params.planId;
      // Seed from the authoritative response; invalidate the rest.
      queryClient.setQueryData(queryKeys.skillPlanWithEntries(planId), data);
      invalidatePlanDerivedCaches(queryClient, planId);
    },
  });
}

export function useUpdateSkillPlan() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: UpdateSkillPlanParams) => {
      return await invoke('update_skill_plan', params);
    },
    onSuccess: (_, params) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.skillPlans() });
      queryClient.invalidateQueries({
        queryKey: queryKeys.skillPlan(params.planId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.skillPlanWithEntries(params.planId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.skillPlanValidation(params.planId),
      });
    },
  });
}

export function useDeleteSkillPlan() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: DeleteSkillPlanParams) => {
      return await invoke('delete_skill_plan', params);
    },
    onSuccess: (_, params) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.skillPlans() });

      queryClient.removeQueries({
        queryKey: queryKeys.skillPlan(params.planId),
      });
      queryClient.removeQueries({
        queryKey: queryKeys.skillPlanWithEntries(params.planId),
      });
      queryClient.removeQueries({
        queryKey: queryKeys.skillPlanValidation(params.planId),
      });
      queryClient.removeQueries({
        queryKey: queryKeys.planComparisonByPlan(params.planId),
      });
      queryClient.removeQueries({
        queryKey: queryKeys.planComparisonAll(params.planId),
      });
      queryClient.removeQueries({
        queryKey: queryKeys.exportSkillPlanText(params.planId),
      });
      queryClient.removeQueries({
        queryKey: queryKeys.exportSkillPlanXml(params.planId),
      });
      queryClient.removeQueries({
        queryKey: queryKeys.remaps.plan(params.planId),
      });
      queryClient.removeQueries({
        queryKey: queryKeys.skillPlanSimulation(params.planId),
      });
      queryClient.removeQueries({
        queryKey: queryKeys.skillPlanOptimization(params.planId),
      });
    },
  });
}

export function useAddPlanEntry() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: AddPlanEntryParams) => {
      return await invoke<SkillPlanWithEntriesResponse>(
        'add_plan_entry',
        params
      );
    },
    onSuccess: (data, params) => {
      queryClient.setQueryData(
        queryKeys.skillPlanWithEntries(params.planId),
        data
      );
      queryClient.invalidateQueries({
        queryKey: queryKeys.skillPlanWithEntries(params.planId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.skillPlanValidation(params.planId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.planComparisonAll(params.planId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.planComparisonByPlan(params.planId),
      });
    },
  });
}

export function useUpdatePlanEntry() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: UpdatePlanEntryParams) => {
      return await invoke('update_plan_entry', params);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.skillPlanWithEntriesAll(),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.skillPlanValidationAll(),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.planComparisonAllRoot(),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.planComparisonByPlanAll(),
      });
    },
  });
}

export function useDeletePlanEntry() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: DeletePlanEntryParams) => {
      return await invoke('delete_plan_entry', params);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.skillPlanWithEntriesAll(),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.skillPlanValidationAll(),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.planComparisonAllRoot(),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.planComparisonByPlanAll(),
      });
    },
  });
}

export function useRemoveSkillLevel() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, { entryId: number; planId: number }>({
    mutationFn: async (params) => {
      return await invoke('remove_skill_level', { entryId: params.entryId });
    },
    onSuccess: (_, params) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.skillPlanWithEntries(params.planId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.skillPlanValidation(params.planId),
      });
    },
  });
}

export function useRemoveSkill() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { planId: number; skillTypeId: number }) => {
      return await invoke('remove_skill', params);
    },
    onSuccess: (_, params) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.skillPlanWithEntries(params.planId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.skillPlanValidation(params.planId),
      });
    },
  });
}

export function useRemoveSkillAndPrerequisites() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { planId: number; skillTypeId: number }) => {
      return await invoke<SkillPlanWithEntriesResponse>(
        'remove_skill_and_prerequisites',
        params
      );
    },
    onSuccess: (data, params) => {
      queryClient.setQueryData(
        queryKeys.skillPlanWithEntries(params.planId),
        data
      );
      queryClient.invalidateQueries({
        queryKey: queryKeys.skillPlanWithEntries(params.planId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.skillPlanValidation(params.planId),
      });
    },
  });
}

export function useReorderPlanEntries() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: ReorderPlanEntriesParams) => {
      return await invoke('reorder_plan_entries', params);
    },
    onSuccess: (_, params) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.skillPlanWithEntries(params.planId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.skillPlanValidation(params.planId),
      });
    },
  });
}

export function useImportSkillPlanText() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: ImportSkillPlanTextParams) => {
      return await invoke<SkillPlanWithEntriesResponse>(
        'import_skill_plan_text',
        params
      );
    },
    onSuccess: (data, params) => {
      const planId = params.planId;
      // Seed from the authoritative import response; invalidate the rest.
      queryClient.setQueryData(queryKeys.skillPlanWithEntries(planId), data);
      invalidatePlanDerivedCaches(queryClient, planId);
    },
  });
}

export function useImportSkillPlanXml() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: ImportSkillPlanXmlParams) => {
      return await invoke<SkillPlanWithEntriesResponse>(
        'import_skill_plan_xml',
        params
      );
    },
    onSuccess: (data, params) => {
      const planId = params.planId;
      // Seed from the authoritative import response; invalidate the rest.
      queryClient.setQueryData(queryKeys.skillPlanWithEntries(planId), data);
      invalidatePlanDerivedCaches(queryClient, planId);
    },
  });
}

export function useExportSkillPlanText(planId: number | null) {
  return useQuery<string>({
    queryKey: queryKeys.exportSkillPlanText(planId),
    queryFn: async () => {
      if (planId === null) {
        throw new Error('Plan ID is required');
      }
      return await invoke<string>('export_skill_plan_text', { planId });
    },
    enabled: false,
  });
}

export function useExportSkillPlanXml(planId: number | null) {
  return useQuery<string>({
    queryKey: queryKeys.exportSkillPlanXml(planId),
    queryFn: async () => {
      if (planId === null) {
        throw new Error('Plan ID is required');
      }
      return await invoke<string>('export_skill_plan_xml', { planId });
    },
    enabled: false,
  });
}

export function useSkillPlanValidation(planId: number | null) {
  return useQuery<ValidationResponse | null>({
    queryKey: queryKeys.skillPlanValidation(planId),
    queryFn: async () => {
      if (planId === null) {
        return null;
      }
      return await invoke<ValidationResponse>('validate_skill_plan', {
        planId,
      });
    },
    enabled: planId !== null,
  });
}

export function useValidateReorder() {
  return useMutation({
    mutationFn: async (params: ValidateReorderParams) => {
      return await invoke<ValidationResponse>('validate_reorder', params);
    },
  });
}

export function useExportSkillPlanJson() {
  return useMutation({
    mutationFn: async (params: ExportSkillPlanJsonParams) => {
      return await invoke<SkillmonPlan>('export_skill_plan_json', params);
    },
  });
}

export function useImportSkillPlanJson() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: ImportSkillPlanJsonParams) => {
      return await invoke<number>('import_skill_plan_json', params);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.skillPlans() });
      queryClient.invalidateQueries({
        queryKey: queryKeys.skillPlanWithEntriesAll(),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.skillPlanValidationAll(),
      });
    },
  });
}

export function usePreviewPlanFromCharacter(
  characterId: number | null,
  includedGroupIds: number[]
) {
  return useQuery({
    queryKey: queryKeys.planFromCharacterPreview(characterId, includedGroupIds),
    queryFn: async () => {
      if (characterId === null) {
        throw new Error('Character ID is required');
      }
      return await invoke<PreviewPlanFromCharacterResponse>(
        'preview_plan_from_character',
        {
          characterId,
          includedGroupIds,
        }
      );
    },
    enabled: characterId !== null && includedGroupIds.length > 0,
  });
}

export function useCreatePlanFromCharacter() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: CreatePlanFromCharacterParams) => {
      return await invoke<number>('create_plan_from_character', params);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.skillPlans() });
    },
  });
}
