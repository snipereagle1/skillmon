import { create } from 'zustand';

interface SkillDetailState {
  open: boolean;
  skillId: number | null;
  characterId: number | null;
  openSkillDetail: (skillId: number, characterId: number | null) => void;
  closeSkillDetail: () => void;
}

export const useSkillDetailStore = create<SkillDetailState>((set) => ({
  open: false,
  skillId: null,
  characterId: null,
  openSkillDetail: (skillId: number, characterId: number | null) =>
    set({ open: true, skillId, characterId }),
  closeSkillDetail: () =>
    set({ open: false, skillId: null, characterId: null }),
}));
