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

import { queryKeys } from './queryKeys';

export function useSkillPlans() {
  return useQuery<SkillPlanResponse[]>({
    queryKey: queryKeys.skillPlans(),
    queryFn: async () => {
      return await getAllSkillPlans();
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
      return await getSkillPlan({ planId });
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

export function useUpdateSkillPlan() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: UpdateSkillPlanParams) => {
      return await updateSkillPlan(params);
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
      return await deleteSkillPlan(params);
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
      return await addPlanEntry(params);
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

export function useUpdatePlanEntry() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: UpdatePlanEntryParams) => {
      return await updatePlanEntry(params);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.skillPlanWithEntriesAll(),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.skillPlanValidationAll(),
      });
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
      queryClient.invalidateQueries({
        queryKey: queryKeys.skillPlanWithEntriesAll(),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.skillPlanValidationAll(),
      });
    },
  });
}

export function useRemoveSkillLevel() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, { entryId: number; planId: number }>({
    mutationFn: async (params) => {
      return await removeSkillLevel({ entryId: params.entryId });
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
      return await removeSkill(params);
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
      return await removeSkillAndPrerequisites(params);
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
      return await reorderPlanEntries(params);
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
      return await importSkillPlanText(params);
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

export function useImportSkillPlanXml() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: ImportSkillPlanXmlParams) => {
      return await importSkillPlanXml(params);
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

export function useExportSkillPlanText(planId: number | null) {
  return useQuery<string>({
    queryKey: queryKeys.exportSkillPlanText(planId),
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
    queryKey: queryKeys.exportSkillPlanXml(planId),
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
    queryKey: queryKeys.skillPlanValidation(planId),
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
