import { create } from 'zustand';

export interface Action {
  label: string;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
}

interface UndoRedoState {
  undoStack: Action[];
  redoStack: Action[];
  pushAction: (action: Action) => void;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  clear: () => void;
  isPerformingAction: boolean;
}

export const useUndoRedoStore = create<UndoRedoState>((set, get) => ({
  undoStack: [],
  redoStack: [],
  isPerformingAction: false,

  pushAction: (action) => {
    // When a new action is performed, clear the redo stack
    set((state) => ({
      undoStack: [...state.undoStack, action],
      redoStack: [],
    }));
  },

  undo: async () => {
    const { undoStack, isPerformingAction } = get();
    if (undoStack.length === 0 || isPerformingAction) return;

    set({ isPerformingAction: true });
    const action = undoStack[undoStack.length - 1];
    try {
      await action.undo();
      set((state) => ({
        undoStack: state.undoStack.slice(0, -1),
        redoStack: [...state.redoStack, action],
      }));
    } finally {
      set({ isPerformingAction: false });
    }
  },

  redo: async () => {
    const { redoStack, isPerformingAction } = get();
    if (redoStack.length === 0 || isPerformingAction) return;

    set({ isPerformingAction: true });
    const action = redoStack[redoStack.length - 1];
    try {
      await action.redo();
      set((state) => ({
        redoStack: state.redoStack.slice(0, -1),
        undoStack: [...state.undoStack, action],
      }));
    } finally {
      set({ isPerformingAction: false });
    }
  },

  clear: () => {
    set({ undoStack: [], redoStack: [] });
  },
}));
