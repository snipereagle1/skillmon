import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  addPlanEntry,
  createSkillPlan,
  deletePlanEntry,
  deleteSkillPlan,
  exportSkillPlanJson,
  exportSkillPlanText,
  exportSkillPlanXml,
  getAllSkillPlans,
  getSkillPlan,
  getSkillPlanWithEntries,
  importSkillPlanJson,
  importSkillPlanText,
  importSkillPlanXml,
  removeSkill,
  removeSkillAndPrerequisites,
  removeSkillLevel,
  reorderPlanEntries,
  updatePlanEntry,
  updateSkillPlan,
  validateReorder,
  validateSkillPlan,
} from '@/generated/commands';
import type {
  AddPlanEntryParams,
  CreateSkillPlanParams,
  DeletePlanEntryParams,
  DeleteSkillPlanParams,
  ExportSkillPlanJsonParams,
  ImportSkillPlanJsonParams,
  ImportSkillPlanTextParams,
  ImportSkillPlanXmlParams,
  ReorderPlanEntriesParams,
  SkillPlanResponse,
  SkillPlanWithEntriesResponse,
  UpdatePlanEntryParams,
  UpdateSkillPlanParams,
  ValidateReorderParams,
  ValidationResponse,
} from '@/generated/types';

export function useSkillPlans() {
  return useQuery<SkillPlanResponse[]>({
    queryKey: ['skillPlans'],
    queryFn: async () => {
      return await getAllSkillPlans();
    },
  });
}

export function useSkillPlan(planId: number | null) {
  return useQuery<SkillPlanResponse | null>({
    queryKey: ['skillPlan', planId],
    queryFn: async () => {
      if (planId === null) {
        return null;
      }
      return await getSkillPlan({ planId });
    },
    enabled: planId !== null,
  });
}

export function useSkillPlanWithEntries(planId: number | null) {
  return useQuery<SkillPlanWithEntriesResponse | null>({
    queryKey: ['skillPlanWithEntries', planId],
    queryFn: async () => {
      if (planId === null) {
        return null;
      }
      return await getSkillPlanWithEntries({ planId });
    },
    enabled: planId !== null,
  });
}

export function useCreateSkillPlan() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: CreateSkillPlanParams) => {
      return await createSkillPlan(params);
    },
    onSuccess: (data) => {
      // Remove any existing queries for this ID in case it was reused by the backend
      queryClient.removeQueries({ queryKey: ['skillPlan', data] });
      queryClient.removeQueries({ queryKey: ['skillPlanWithEntries', data] });
      queryClient.removeQueries({ queryKey: ['skillPlanValidation', data] });
      queryClient.removeQueries({ queryKey: ['planComparison', data] });
      queryClient.removeQueries({ queryKey: ['planComparisonAll', data] });
      queryClient.removeQueries({ queryKey: ['exportSkillPlanText', data] });
      queryClient.removeQueries({ queryKey: ['exportSkillPlanXml', data] });
      queryClient.removeQueries({ queryKey: ['remaps', 'plan', data] });
      queryClient.removeQueries({ queryKey: ['skillPlanSimulation', data] });
      queryClient.removeQueries({ queryKey: ['skillPlanOptimization', data] });

      queryClient.invalidateQueries({ queryKey: ['skillPlans'] });
    },
  });
}

export function useUpdateSkillPlan() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: UpdateSkillPlanParams) => {
      return await updateSkillPlan(params);
    },
    onSuccess: (_, params) => {
      queryClient.invalidateQueries({ queryKey: ['skillPlans'] });
      queryClient.invalidateQueries({ queryKey: ['skillPlan', params.planId] });
      queryClient.invalidateQueries({
        queryKey: ['skillPlanWithEntries', params.planId],
      });
      queryClient.invalidateQueries({
        queryKey: ['skillPlanValidation', params.planId],
      });
    },
  });
}

export function useDeleteSkillPlan() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: DeleteSkillPlanParams) => {
      return await deleteSkillPlan(params);
    },
    onSuccess: (_, params) => {
      queryClient.invalidateQueries({ queryKey: ['skillPlans'] });

      // Completely remove queries for the deleted plan to avoid stale cache issues
      // if the ID is reused by the backend
      queryClient.removeQueries({ queryKey: ['skillPlan', params.planId] });
      queryClient.removeQueries({
        queryKey: ['skillPlanWithEntries', params.planId],
      });
      queryClient.removeQueries({
        queryKey: ['skillPlanValidation', params.planId],
      });
      queryClient.removeQueries({
        queryKey: ['planComparison', params.planId],
      });
      queryClient.removeQueries({
        queryKey: ['planComparisonAll', params.planId],
      });
      queryClient.removeQueries({
        queryKey: ['exportSkillPlanText', params.planId],
      });
      queryClient.removeQueries({
        queryKey: ['exportSkillPlanXml', params.planId],
      });
      queryClient.removeQueries({
        queryKey: ['remaps', 'plan', params.planId],
      });
      queryClient.removeQueries({
        queryKey: ['skillPlanSimulation', params.planId],
      });
      queryClient.removeQueries({
        queryKey: ['skillPlanOptimization', params.planId],
      });
    },
  });
}

export function useAddPlanEntry() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: AddPlanEntryParams) => {
      return await addPlanEntry(params);
    },
    onSuccess: (data, params) => {
      queryClient.setQueryData(['skillPlanWithEntries', params.planId], data);
      queryClient.invalidateQueries({
        queryKey: ['skillPlanWithEntries', params.planId],
      });
      queryClient.invalidateQueries({
        queryKey: ['skillPlanValidation', params.planId],
      });
    },
  });
}

export function useUpdatePlanEntry() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: UpdatePlanEntryParams) => {
      return await updatePlanEntry(params);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['skillPlanWithEntries'] });
      queryClient.invalidateQueries({ queryKey: ['skillPlanValidation'] });
    },
  });
}

export function useDeletePlanEntry() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: DeletePlanEntryParams) => {
      return await deletePlanEntry(params);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['skillPlanWithEntries'] });
      queryClient.invalidateQueries({ queryKey: ['skillPlanValidation'] });
    },
  });
}

export function useRemoveSkillLevel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (entryId: number) => {
      return await removeSkillLevel({ entryId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['skillPlanWithEntries'] });
      queryClient.invalidateQueries({ queryKey: ['skillPlanValidation'] });
    },
  });
}

export function useRemoveSkill() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { planId: number; skillTypeId: number }) => {
      return await removeSkill(params);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['skillPlanWithEntries'] });
      queryClient.invalidateQueries({ queryKey: ['skillPlanValidation'] });
    },
  });
}

export function useRemoveSkillAndPrerequisites() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { planId: number; skillTypeId: number }) => {
      return await removeSkillAndPrerequisites(params);
    },
    onSuccess: (data, params) => {
      queryClient.setQueryData(['skillPlanWithEntries', params.planId], data);
      queryClient.invalidateQueries({
        queryKey: ['skillPlanWithEntries', params.planId],
      });
      queryClient.invalidateQueries({
        queryKey: ['skillPlanValidation', params.planId],
      });
    },
  });
}

export function useReorderPlanEntries() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: ReorderPlanEntriesParams) => {
      return await reorderPlanEntries(params);
    },
    onSuccess: (_, params) => {
      queryClient.invalidateQueries({
        queryKey: ['skillPlanWithEntries', params.planId],
      });
      queryClient.invalidateQueries({
        queryKey: ['skillPlanValidation', params.planId],
      });
    },
  });
}

export function useImportSkillPlanText() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: ImportSkillPlanTextParams) => {
      return await importSkillPlanText(params);
    },
    onSuccess: (data, params) => {
      queryClient.setQueryData(['skillPlanWithEntries', params.planId], data);
      queryClient.invalidateQueries({
        queryKey: ['skillPlanWithEntries', params.planId],
      });
      queryClient.invalidateQueries({
        queryKey: ['skillPlanValidation', params.planId],
      });
    },
  });
}

export function useImportSkillPlanXml() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: ImportSkillPlanXmlParams) => {
      return await importSkillPlanXml(params);
    },
    onSuccess: (data, params) => {
      queryClient.setQueryData(['skillPlanWithEntries', params.planId], data);
      queryClient.invalidateQueries({
        queryKey: ['skillPlanWithEntries', params.planId],
      });
      queryClient.invalidateQueries({
        queryKey: ['skillPlanValidation', params.planId],
      });
    },
  });
}

export function useExportSkillPlanText(planId: number | null) {
  return useQuery<string>({
    queryKey: ['exportSkillPlanText', planId],
    queryFn: async () => {
      if (planId === null) {
        throw new Error('Plan ID is required');
      }
      return await exportSkillPlanText({ planId });
    },
    enabled: false,
  });
}

export function useExportSkillPlanXml(planId: number | null) {
  return useQuery<string>({
    queryKey: ['exportSkillPlanXml', planId],
    queryFn: async () => {
      if (planId === null) {
        throw new Error('Plan ID is required');
      }
      return await exportSkillPlanXml({ planId });
    },
    enabled: false,
  });
}

export function useSkillPlanValidation(planId: number | null) {
  return useQuery<ValidationResponse | null>({
    queryKey: ['skillPlanValidation', planId],
    queryFn: async () => {
      if (planId === null) {
        return null;
      }
      return await validateSkillPlan({ planId });
    },
    enabled: planId !== null,
  });
}

export function useValidateReorder() {
  return useMutation({
    mutationFn: async (params: ValidateReorderParams) => {
      return await validateReorder(params);
    },
  });
}

export function useExportSkillPlanJson() {
  return useMutation({
    mutationFn: async (params: ExportSkillPlanJsonParams) => {
      return await exportSkillPlanJson(params);
    },
  });
}

export function useImportSkillPlanJson() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: ImportSkillPlanJsonParams) => {
      return await importSkillPlanJson(params);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['skillPlans'] });
      queryClient.invalidateQueries({ queryKey: ['skillPlanWithEntries'] });
      queryClient.invalidateQueries({ queryKey: ['skillPlanValidation'] });
    },
  });
}
