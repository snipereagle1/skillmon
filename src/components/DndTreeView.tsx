import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { ChevronRight } from 'lucide-react';
import React, { useCallback, useMemo, useState } from 'react';

import { cn } from '@/lib/utils';

export interface TreeNode {
  id: string;
  name: string;
  icon?: React.ComponentType<{ className?: string }>;
  openIcon?: React.ComponentType<{ className?: string }>;
  selectedIcon?: React.ComponentType<{ className?: string }>;
  children?: TreeNode[];
  actions?: React.ReactNode;
  draggable?: boolean;
  droppable?: boolean;
  disabled?: boolean;
  className?: string;
  onClick?: () => void;
}

export type DropTarget =
  | { type: 'row'; id: string }
  | { type: 'gap'; parentId: string | null; index: number };

export interface RenderItemParams {
  item: TreeNode;
  level: number;
  isLeaf: boolean;
  isSelected: boolean;
  isOpen: boolean;
}

export interface DndTreeViewProps {
  data: TreeNode[];
  selectedId?: string | null;
  onSelectChange?: (id: string | null) => void;
  onDrop?: (sourceId: string, target: DropTarget) => void;
  canDrop?: (sourceId: string, target: DropTarget) => boolean;
  renderItem?: (params: RenderItemParams) => React.ReactNode;
  defaultExpanded?: 'all' | string[];
  /** Controlled expanded set. When provided together with `onExpandedChange`,
   * internal expand state is bypassed. */
  expanded?: Set<string>;
  onExpandedChange?: (next: Set<string>) => void;
  defaultLeafIcon?: React.ComponentType<{ className?: string }>;
  defaultNodeIcon?: React.ComponentType<{ className?: string }>;
  indentPx?: number;
  className?: string;
}

type DragData = { sourceId: string };
type DropData = DropTarget;

type FlatRow =
  | {
      kind: 'gap';
      parentId: string | null;
      index: number;
      depth: number;
      key: string;
    }
  | {
      kind: 'node';
      node: TreeNode;
      depth: number;
      parentId: string | null;
      siblingIndex: number;
      hasChildren: boolean;
      key: string;
    };

function flatten(
  nodes: TreeNode[],
  depth: number,
  parentId: string | null,
  expanded: Set<string>,
  out: FlatRow[]
) {
  out.push({
    kind: 'gap',
    parentId,
    index: 0,
    depth,
    key: `gap:${parentId ?? 'root'}:0`,
  });
  nodes.forEach((node, siblingIndex) => {
    const hasChildren = !!node.children?.length;
    out.push({
      kind: 'node',
      node,
      depth,
      parentId,
      siblingIndex,
      hasChildren,
      key: `node:${node.id}`,
    });
    if (hasChildren && expanded.has(node.id)) {
      flatten(node.children!, depth + 1, node.id, expanded, out);
    }
    out.push({
      kind: 'gap',
      parentId,
      index: siblingIndex + 1,
      depth,
      key: `gap:${parentId ?? 'root'}:${siblingIndex + 1}`,
    });
  });
}

function collectAllIds(nodes: TreeNode[], out: Set<string>) {
  for (const n of nodes) {
    out.add(n.id);
    if (n.children?.length) collectAllIds(n.children, out);
  }
}

export function DndTreeView({
  data,
  selectedId,
  onSelectChange,
  onDrop,
  canDrop,
  renderItem,
  defaultExpanded = 'all',
  expanded: controlledExpanded,
  onExpandedChange,
  defaultLeafIcon,
  defaultNodeIcon,
  indentPx = 12,
  className,
}: DndTreeViewProps) {
  const isControlled =
    controlledExpanded !== undefined && onExpandedChange !== undefined;
  const [uncontrolledExpanded, setUncontrolledExpanded] = useState<Set<string>>(
    () => {
      if (isControlled) return new Set();
      if (defaultExpanded === 'all') {
        const all = new Set<string>();
        collectAllIds(data, all);
        return all;
      }
      return new Set(defaultExpanded);
    }
  );
  const expanded = isControlled ? controlledExpanded : uncontrolledExpanded;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  const flat = useMemo(() => {
    const out: FlatRow[] = [];
    flatten(data, 0, null, expanded, out);
    return out;
  }, [data, expanded]);

  const toggleExpand = useCallback(
    (id: string) => {
      if (isControlled) {
        const next = new Set(controlledExpanded);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        onExpandedChange(next);
        return;
      }
      setUncontrolledExpanded((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    },
    [isControlled, controlledExpanded, onExpandedChange]
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || !onDrop) return;
    const drag = active.data.current as DragData | undefined;
    const drop = over.data.current as DropData | undefined;
    if (!drag || !drop) return;
    if (drop.type === 'row' && drop.id === drag.sourceId) return;
    if (canDrop && !canDrop(drag.sourceId, drop)) return;
    onDrop(drag.sourceId, drop);
  };

  return (
    <div className={cn('relative p-2', className)} role="tree">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        {flat.map((row) => {
          if (row.kind === 'gap') {
            return (
              <Gap
                key={row.key}
                parentId={row.parentId}
                index={row.index}
                depth={row.depth}
                indentPx={indentPx}
              />
            );
          }
          return (
            <NodeRow
              key={row.key}
              row={row}
              isSelected={selectedId === row.node.id}
              isOpen={expanded.has(row.node.id)}
              onToggleExpand={toggleExpand}
              onSelectChange={onSelectChange}
              renderItem={renderItem}
              defaultLeafIcon={defaultLeafIcon}
              defaultNodeIcon={defaultNodeIcon}
              indentPx={indentPx}
            />
          );
        })}
      </DndContext>
    </div>
  );
}

interface GapProps {
  parentId: string | null;
  index: number;
  depth: number;
  indentPx: number;
}

function Gap({ parentId, index, depth, indentPx }: GapProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: `gap:${parentId ?? 'root'}:${index}`,
    data: { type: 'gap', parentId, index } satisfies DropTarget,
  });
  return (
    <div
      ref={setNodeRef}
      style={{ paddingLeft: depth * indentPx }}
      className={cn(
        'h-1 rounded-full transition-colors',
        isOver && 'h-2 bg-primary'
      )}
    />
  );
}

interface NodeRowProps {
  row: Extract<FlatRow, { kind: 'node' }>;
  isSelected: boolean;
  isOpen: boolean;
  onToggleExpand: (id: string) => void;
  onSelectChange?: (id: string | null) => void;
  renderItem?: (params: RenderItemParams) => React.ReactNode;
  defaultLeafIcon?: React.ComponentType<{ className?: string }>;
  defaultNodeIcon?: React.ComponentType<{ className?: string }>;
  indentPx: number;
}

function NodeRow({
  row,
  isSelected,
  isOpen,
  onToggleExpand,
  onSelectChange,
  renderItem,
  defaultLeafIcon,
  defaultNodeIcon,
  indentPx,
}: NodeRowProps) {
  const { node, depth, hasChildren } = row;
  const isLeaf = !hasChildren;
  const draggable = node.draggable ?? false;
  const droppable = node.droppable ?? false;

  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    isDragging,
  } = useDraggable({
    id: `drag:${node.id}`,
    data: { sourceId: node.id } satisfies DragData,
    disabled: !draggable || node.disabled,
  });

  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `row:${node.id}`,
    data: { type: 'row', id: node.id } satisfies DropTarget,
    disabled: !droppable || node.disabled,
  });

  const setRef = (el: HTMLDivElement | null) => {
    setDragRef(el);
    setDropRef(el);
  };

  const Icon = (() => {
    if (isSelected && node.selectedIcon) return node.selectedIcon;
    if (isOpen && node.openIcon) return node.openIcon;
    if (node.icon) return node.icon;
    return isLeaf ? defaultLeafIcon : defaultNodeIcon;
  })();

  return (
    <div
      ref={setRef}
      {...attributes}
      {...listeners}
      role="treeitem"
      aria-selected={isSelected}
      aria-expanded={hasChildren ? isOpen : undefined}
      className={cn(
        'group relative flex items-center rounded-md text-sm transition-colors',
        'hover:bg-accent/70',
        isSelected && 'bg-accent/70 text-accent-foreground',
        isOver && droppable && 'ring-2 ring-primary bg-primary/10',
        isDragging && 'opacity-50',
        node.disabled && 'opacity-50 cursor-not-allowed pointer-events-none',
        node.className
      )}
      style={{ paddingLeft: depth * indentPx }}
    >
      {hasChildren ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleExpand(node.id);
          }}
          className="shrink-0 p-1 text-muted-foreground hover:text-foreground"
          aria-label={isOpen ? 'Collapse' : 'Expand'}
        >
          <ChevronRight
            className={cn(
              'h-4 w-4 transition-transform',
              isOpen && 'rotate-90'
            )}
          />
        </button>
      ) : (
        <span className="h-4 w-4 shrink-0 ml-1 mr-1" />
      )}
      <button
        type="button"
        onClick={() => {
          if (node.disabled) return;
          onSelectChange?.(node.id);
          node.onClick?.();
        }}
        className="flex-1 flex items-center gap-2 py-2 pr-2 text-left min-w-0"
      >
        {Icon && <Icon className="h-4 w-4 shrink-0" />}
        {renderItem ? (
          renderItem({
            item: node,
            level: depth,
            isLeaf,
            isSelected,
            isOpen,
          })
        ) : (
          <span className="truncate">{node.name}</span>
        )}
      </button>
      {node.actions && (
        <div className="absolute right-2 hidden group-hover:flex items-center gap-1">
          {node.actions}
        </div>
      )}
    </div>
  );
}
