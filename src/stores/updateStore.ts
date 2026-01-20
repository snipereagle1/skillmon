import type { Update } from '@tauri-apps/plugin-updater';
import { create } from 'zustand';

interface UpdateState {
  updateAvailable: boolean;
  update: Update | null;
  setUpdate: (update: Update | null) => void;
}

export const useUpdateStore = create<UpdateState>((set) => ({
  updateAvailable: false,
  update: null,
  setUpdate: (update) => set({ update, updateAvailable: !!update }),
}));
