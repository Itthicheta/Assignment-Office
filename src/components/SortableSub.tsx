import type { ReactNode } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

// Drag wrapper for subtask rows: adds a ⠿ handle on the left when enabled.
export default function SortableSub({
  id,
  disabled,
  children,
}: {
  id: string
  disabled: boolean
  children: ReactNode
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`relative ${isDragging ? 'z-10 opacity-70' : ''}`}
    >
      {!disabled && (
        <span
          {...attributes}
          {...listeners}
          className="absolute top-1/2 left-0 -translate-y-1/2 cursor-grab touch-none px-0.5 text-slate-600 select-none active:cursor-grabbing"
        >
          ⠿
        </span>
      )}
      <div className={disabled ? '' : 'pl-4'}>{children}</div>
    </div>
  )
}
