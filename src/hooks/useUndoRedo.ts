import { useUndoRedoStore } from '@/stores/undoRedoStore';

export function useUndoRedo() {
  const pushAction = useUndoRedoStore((state) => state.pushAction);
  const undo = useUndoRedoStore((state) => state.undo);
  const redo = useUndoRedoStore((state) => state.redo);
  const canUndo = useUndoRedoStore((state) => state.undoStack.length > 0);
  const canRedo = useUndoRedoStore((state) => state.redoStack.length > 0);
  const isPerformingAction = useUndoRedoStore(
    (state) => state.isPerformingAction
  );
  const clear = useUndoRedoStore((state) => state.clear);

  const trackAction = async (
    label: string,
    execute: () => Promise<void>,
    undoAction: () => Promise<void>
  ) => {
    await execute();
    pushAction({
      label,
      undo: undoAction,
      redo: execute,
    });
  };

  return {
    trackAction,
    undo,
    redo,
    canUndo,
    canRedo,
    isPerformingAction,
    clear,
  };
}
