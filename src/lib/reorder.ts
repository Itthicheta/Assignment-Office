import { arrayMove } from '@dnd-kit/sortable'

// Midpoint position for a drag-reorder within a position-sorted list.
// Returns the dragged item's new position value, or null if ids are unknown.
export function positionAfterMove<T extends { id: string; position: number }>(
  sorted: T[],
  activeId: string,
  overId: string,
): number | null {
  const oldIndex = sorted.findIndex((x) => x.id === activeId)
  const newIndex = sorted.findIndex((x) => x.id === overId)
  if (oldIndex < 0 || newIndex < 0) return null
  const reordered = arrayMove(sorted, oldIndex, newIndex)
  const before = reordered[newIndex - 1]?.position
  const after = reordered[newIndex + 1]?.position
  return before !== undefined && after !== undefined
    ? (before + after) / 2
    : before !== undefined
      ? before + 1
      : after !== undefined
        ? after - 1
        : 0
}
