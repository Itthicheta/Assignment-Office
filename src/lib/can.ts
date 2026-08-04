// Client-side mirror of the permission rules enforced in the database
// (see supabase/migrations — enforce_task_update / can_create_task / RLS).
import type { Profile, Task } from './types'

export const isAdmin = (p: Profile | null) => p?.role === 'admin'

// Full control over a task: admin or its creator
export const canEditFields = (p: Profile | null, t: Task) =>
  !!p && (isAdmin(p) || t.created_by === p.id)

export const canDelete = canEditFields

export const canEditDescription = (p: Profile | null, t: Task) =>
  canEditFields(p, t) || (!!p && t.assignee_id === p.id)

export const isSelfTask = (t: Task) => !!t.assignee_id && t.created_by === t.assignee_id

// Work tick: the assignee (until approved) or the creator/admin
export const canTickDone = (p: Profile | null, t: Task) => {
  if (!p) return false
  if (canEditFields(p, t)) return true
  return t.assignee_id === p.id && !t.tick_checked
}

// Approval tick: creator/admin only, and only after the work tick
export const canTickChecked = (p: Profile | null, t: Task) =>
  canEditFields(p, t) && t.tick_done && !isSelfTask(t)

// Subtasks may be added by the parent's creator/assignee or an admin
export const canAddSubtask = (p: Profile | null, parent: Task) =>
  canEditFields(p, parent) || (!!p && parent.assignee_id === p.id)

export const canEditSubtask = (p: Profile | null, sub: Task, parent: Task) => {
  if (!p) return false
  return (
    isAdmin(p) ||
    sub.created_by === p.id ||
    sub.assignee_id === p.id ||
    parent.created_by === p.id ||
    parent.assignee_id === p.id
  )
}

// Shared project-page ordering: admin or project creator
export const canReorderProject = (p: Profile | null, projectCreatedBy: string) =>
  !!p && (isAdmin(p) || projectCreatedBy === p.id)
