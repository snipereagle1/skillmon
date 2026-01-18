import {
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { useState } from 'react';

export interface UseSortableListOptions<T> {
  items: T[];
  onReorder: (newItems: T[]) => void;
  getId: (item: T) => number | string;
}

/**
 * A generic hook for managing sortable lists with dnd-kit.
 * Handles local state syncing, sensors, and drag event handlers.
 */
export function useSortableList<T>({
  items,
  onReorder,
  getId,
}: UseSortableListOptions<T>) {
  const [activeId, setActiveId] = useState<number | string | null>(null);
  const [localItems, setLocalItems] = useState<T[]>(items);
  const [prevItems, setPrevItems] = useState<T[]>(items);

  // Sync with prop changes when not dragging
  if (items !== prevItems) {
    if (!activeId) {
      setLocalItems(items);
    }
    setPrevItems(items);
  }

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as number | string);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = localItems.findIndex(
        (item) => getId(item) === active.id
      );
      const newIndex = localItems.findIndex((item) => getId(item) === over.id);

      if (oldIndex !== -1 && newIndex !== -1) {
        setLocalItems((prev) => arrayMove(prev, oldIndex, newIndex));
      }
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      // The localItems might have already been moved in handleDragOver,
      // but let's ensure it's correct for onReorder.
      const oldIndex = localItems.findIndex(
        (item) => getId(item) === active.id
      );
      const newIndex = localItems.findIndex((item) => getId(item) === over.id);

      if (oldIndex !== -1 && newIndex !== -1) {
        const newOrder = arrayMove(localItems, oldIndex, newIndex);
        setLocalItems(newOrder);
        onReorder(newOrder);
      } else {
        // If they were already moved in DragOver, localItems is already the new order
        onReorder(localItems);
      }
    } else if (over && active.id === over.id) {
      // Just dropped where it was, but might have been moved in DragOver
      onReorder(localItems);
    }
    setActiveId(null);
  };

  const activeItem =
    activeId !== null
      ? localItems.find((item) => getId(item) === activeId)
      : null;

  const reset = () => {
    setLocalItems(items);
    setPrevItems(items);
  };

  return {
    localItems,
    activeId,
    activeItem,
    isDragging: activeId !== null,
    sensors,
    handleDragStart,
    handleDragOver,
    handleDragEnd,
    reset,
  };
}
