import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  addPlanEntry,
  createSkillPlan,
  deletePlanEntry,
  deleteSkillPlan,
  exportSkillPlanText,
  exportSkillPlanXml,
  getAllSkillPlans,
  getSkillPlan,
  getSkillPlanWithEntries,
  importSkillPlanText,
  importSkillPlanXml,
  reorderPlanEntries,
  updatePlanEntry,
  updateSkillPlan,
} from '@/generated/commands';
import type {
  AddPlanEntryParams,
  CreateSkillPlanParams,
  DeletePlanEntryParams,
  DeleteSkillPlanParams,
  ImportSkillPlanTextParams,
  ImportSkillPlanXmlParams,
  ReorderPlanEntriesParams,
  SkillPlanResponse,
  SkillPlanWithEntriesResponse,
  UpdatePlanEntryParams,
  UpdateSkillPlanParams,
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
    onSuccess: () => {
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
      queryClient.invalidateQueries({ queryKey: ['skillPlan', params.planId] });
      queryClient.invalidateQueries({
        queryKey: ['skillPlanWithEntries', params.planId],
      });
      queryClient.invalidateQueries({
        queryKey: ['exportSkillPlanText', params.planId],
      });
      queryClient.invalidateQueries({
        queryKey: ['exportSkillPlanXml', params.planId],
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
