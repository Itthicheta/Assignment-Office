// Client-side mirror of the permission rules enforced in the database
// (supabase/migrations/0001_init.sql → enforce_task_update / RLS policies).
import type { Profile, Status, Task } from './types'

export const isAdmin = (p: Profile | null) => p?.role === 'admin'

export const canEditFields = (p: Profile | null, t: Task) =>
  !!p && (isAdmin(p) || t.created_by === p.id)

export const canDelete = canEditFields

export const canEditDescription = (p: Profile | null, t: Task) =>
  canEditFields(p, t) || (!!p && t.assignee_id === p.id)

// Which statuses can this user move the task to?
export function statusChoices(p: Profile | null, t: Task): Status[] {
  if (!p) return []
  if (canEditFields(p, t)) return ['todo', 'in_progress', 'in_review', 'blocked', 'done', 'cancelled']
  if (t.assignee_id === p.id) return ['todo', 'in_progress', 'in_review', 'blocked']
  return []
}

// Subtasks are looser: parent creator/assignee and subtask assignee can toggle them.
export function canToggleSubtask(p: Profile | null, sub: Task, parent: Task) {
  if (!p) return false
  return (
    isAdmin(p) ||
    sub.created_by === p.id ||
    sub.assignee_id === p.id ||
    parent.created_by === p.id ||
    parent.assignee_id === p.id
  )
}
