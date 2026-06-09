import { create } from 'zustand';

export type PlanTreeDialog =
  | { kind: 'none' }
  | { kind: 'createPlan'; groupId: number | null }
  | { kind: 'createMergedPlan' }
  | { kind: 'createPlanFromCharacter' }
  | { kind: 'createPlanGroup' }
  | { kind: 'renamePlanGroup'; groupId: number; currentName: string }
  | { kind: 'deletePlanGroup'; groupId: number; name: string }
  | { kind: 'deletePlan'; planId: number; name: string };

interface PlanTreeDialogState {
  dialog: PlanTreeDialog;
  openCreatePlan: (groupId?: number | null) => void;
  openCreateMergedPlan: () => void;
  openCreatePlanFromCharacter: () => void;
  openCreatePlanGroup: () => void;
  openRenamePlanGroup: (groupId: number, currentName: string) => void;
  openDeletePlanGroup: (groupId: number, name: string) => void;
  openDeletePlan: (planId: number, name: string) => void;
  close: () => void;
}

export const usePlanTreeDialogStore = create<PlanTreeDialogState>((set) => ({
  dialog: { kind: 'none' },
  openCreatePlan: (groupId = null) =>
    set({ dialog: { kind: 'createPlan', groupId } }),
  openCreateMergedPlan: () => set({ dialog: { kind: 'createMergedPlan' } }),
  openCreatePlanFromCharacter: () =>
    set({ dialog: { kind: 'createPlanFromCharacter' } }),
  openCreatePlanGroup: () => set({ dialog: { kind: 'createPlanGroup' } }),
  openRenamePlanGroup: (groupId, currentName) =>
    set({ dialog: { kind: 'renamePlanGroup', groupId, currentName } }),
  openDeletePlanGroup: (groupId, name) =>
    set({ dialog: { kind: 'deletePlanGroup', groupId, name } }),
  openDeletePlan: (planId, name) =>
    set({ dialog: { kind: 'deletePlan', planId, name } }),
  close: () => set({ dialog: { kind: 'none' } }),
}));
