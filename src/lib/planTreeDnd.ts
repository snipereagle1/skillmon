import type { DropTarget } from '@/components/DndTreeView';
import { NodeKind } from '@/generated/types';

export interface NodeIndex {
  parentOf: Map<string, number | null>;
  indexOf: Map<string, number>;
  childCount: Map<number | null, number>;
}

export interface ParsedNodeId {
  kind: NodeKind;
  id: number;
}

export function planNodeId(id: number): string {
  return `plan:${id}`;
}

export function groupNodeId(id: number): string {
  return `group:${id}`;
}

export function parseNodeId(raw: string): ParsedNodeId | null {
  const [kind, idStr] = raw.split(':');
  const id = Number(idStr);
  if (!Number.isFinite(id)) return null;
  if (kind === NodeKind.Plan) return { kind: NodeKind.Plan, id };
  if (kind === NodeKind.Group) return { kind: NodeKind.Group, id };
  return null;
}

export interface ResolvedDrop {
  newParentGroupId: number | null;
  newSortOrder: number;
}

/**
 * Compute the destination parent + sort order for a drop, or null if the drop
 * is invalid or a no-op.
 */
export function resolveDropTarget(
  sourceId: string,
  target: DropTarget,
  nodeIndex: NodeIndex
): ResolvedDrop | null {
  const source = parseNodeId(sourceId);
  if (!source) return null;

  const sourceParentGroupId = nodeIndex.parentOf.get(sourceId) ?? null;
  const sourceIndex = nodeIndex.indexOf.get(sourceId) ?? 0;

  let newParentGroupId: number | null;
  let newSortOrder: number;

  if (target.type === 'row') {
    // Drop onto a folder row → nest as last child.
    const parsed = parseNodeId(target.id);
    if (!parsed || parsed.kind !== NodeKind.Group) return null;
    newParentGroupId = parsed.id;
    const existing = nodeIndex.childCount.get(parsed.id) ?? 0;
    newSortOrder =
      sourceParentGroupId === parsed.id ? Math.max(0, existing - 1) : existing;
  } else {
    // Drop into a gap → sibling at that index inside target.parentId.
    const targetParent = target.parentId
      ? (parseNodeId(target.parentId)?.id ?? null)
      : null;
    newParentGroupId = targetParent;
    let idx = target.index;
    if (sourceParentGroupId === newParentGroupId && sourceIndex < idx) {
      idx -= 1;
    }
    newSortOrder = idx;
  }

  if (
    sourceParentGroupId === newParentGroupId &&
    sourceIndex === newSortOrder
  ) {
    return null;
  }

  return { newParentGroupId, newSortOrder };
}

/** Prevent dropping a folder into itself or any of its descendants. */
export function isDropAllowed(
  sourceId: string,
  target: DropTarget,
  nodeIndex: NodeIndex
): boolean {
  const source = parseNodeId(sourceId);
  if (!source || source.kind !== NodeKind.Group) return true;
  const forbiddenParent = source.id;

  const isDescendantOf = (groupId: number): boolean => {
    if (groupId === forbiddenParent) return true;
    const parent = nodeIndex.parentOf.get(groupNodeId(groupId));
    if (parent == null) return false;
    return isDescendantOf(parent);
  };

  if (target.type === 'row') {
    const parsed = parseNodeId(target.id);
    if (!parsed || parsed.kind !== NodeKind.Group) return true;
    return !isDescendantOf(parsed.id);
  }
  const targetParent = target.parentId
    ? (parseNodeId(target.parentId)?.id ?? null)
    : null;
  if (targetParent == null) return true;
  return !isDescendantOf(targetParent);
}
