import { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { type Action, useUndoRedoStore } from './undoRedoStore';

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));

function makeAction(overrides: Partial<Action> = {}): Action {
  return {
    label: 'Test action',
    undo: vi.fn().mockResolvedValue(undefined),
    redo: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('undoRedoStore', () => {
  beforeEach(() => {
    useUndoRedoStore.setState({
      undoStack: [],
      redoStack: [],
      isPerformingAction: false,
    });
    vi.clearAllMocks();
  });

  it('pushAction clears the redo stack', () => {
    const store = useUndoRedoStore.getState();
    store.pushAction(makeAction({ label: 'a' }));
    // Simulate a populated redo stack, then push again.
    useUndoRedoStore.setState({ redoStack: [makeAction({ label: 'stale' })] });
    useUndoRedoStore.getState().pushAction(makeAction({ label: 'b' }));

    expect(useUndoRedoStore.getState().redoStack).toHaveLength(0);
    expect(useUndoRedoStore.getState().undoStack).toHaveLength(2);
  });

  it('undo runs the action and moves it to the redo stack', async () => {
    const action = makeAction();
    useUndoRedoStore.getState().pushAction(action);

    await useUndoRedoStore.getState().undo();

    expect(action.undo).toHaveBeenCalledOnce();
    expect(useUndoRedoStore.getState().undoStack).toHaveLength(0);
    expect(useUndoRedoStore.getState().redoStack).toEqual([action]);
    expect(useUndoRedoStore.getState().isPerformingAction).toBe(false);
  });

  it('redo runs the action and moves it back to the undo stack', async () => {
    const action = makeAction();
    useUndoRedoStore.getState().pushAction(action);
    await useUndoRedoStore.getState().undo();

    await useUndoRedoStore.getState().redo();

    expect(action.redo).toHaveBeenCalledOnce();
    expect(useUndoRedoStore.getState().redoStack).toHaveLength(0);
    expect(useUndoRedoStore.getState().undoStack).toEqual([action]);
  });

  it('a failed undo leaves the stack intact, surfaces a toast, and rejects', async () => {
    const boom = new Error('db locked');
    const action = makeAction({ undo: vi.fn().mockRejectedValue(boom) });
    useUndoRedoStore.getState().pushAction(action);

    await expect(useUndoRedoStore.getState().undo()).rejects.toThrow(
      'db locked'
    );

    // The action stays on the undo stack so the user can retry; nothing moved
    // to the redo stack.
    expect(useUndoRedoStore.getState().undoStack).toEqual([action]);
    expect(useUndoRedoStore.getState().redoStack).toHaveLength(0);
    expect(useUndoRedoStore.getState().isPerformingAction).toBe(false);
    expect(toast.error).toHaveBeenCalledOnce();
  });

  it('a failed redo leaves the stack intact, surfaces a toast, and rejects', async () => {
    const boom = new Error('db locked');
    const action = makeAction({ redo: vi.fn().mockRejectedValue(boom) });
    useUndoRedoStore.getState().pushAction(action);
    await useUndoRedoStore.getState().undo();

    await expect(useUndoRedoStore.getState().redo()).rejects.toThrow(
      'db locked'
    );

    expect(useUndoRedoStore.getState().redoStack).toEqual([action]);
    expect(useUndoRedoStore.getState().undoStack).toHaveLength(0);
    expect(useUndoRedoStore.getState().isPerformingAction).toBe(false);
    expect(toast.error).toHaveBeenCalledOnce();
  });

  it('ignores undo while another action is in progress', async () => {
    const action = makeAction();
    useUndoRedoStore.setState({
      undoStack: [action],
      isPerformingAction: true,
    });

    await useUndoRedoStore.getState().undo();

    expect(action.undo).not.toHaveBeenCalled();
    expect(useUndoRedoStore.getState().undoStack).toEqual([action]);
  });
});
