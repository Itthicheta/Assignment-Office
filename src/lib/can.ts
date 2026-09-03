// Client-side mirror of the permission rules enforced in the database
// (see supabase/migrations — enforce_task_update / can_create_task /
// can_delete_task / RLS). The database is the source of truth.
// Tasks carry multiple assignees (assignee_ids); subtasks exactly one.
import type { Profile, Task } from './types'

export const isAdmin = (p: Profile | null) => p?.role === 'admin'

const isAssignee = (p: Profile | null, t: Task) => !!p && t.assignee_ids.includes(p.id)

// Full field control over a TOP-LEVEL task: admin or its creator
export const canEditFields = (p: Profile | null, t: Task) =>
  !!p && (isAdmin(p) || t.created_by === p.id)

// Approved tasks are rename-locked for everyone but admin
export const canRename = (p: Profile | null, t: Task) =>
  canEditFields(p, t) && (!t.approved || isAdmin(p))

// Subtask management (create/delete/assign/edit): main task's assignees + admin
export const canManageSubtasks = (p: Profile | null, parent: Task) =>
  !!p && (isAdmin(p) || parent.assignee_ids.includes(p.id))

export const canDelete = (p: Profile | null, t: Task, parent?: Task | null) => {
  if (!p) return false
  if (isAdmin(p)) return true
  if (t.parent_id) return !!parent && parent.assignee_ids.includes(p.id)
  return t.created_by === p.id && !t.approved
}

export const canEditDescription = (p: Profile | null, t: Task, parent?: Task | null) => {
  if (!p) return false
  if (t.parent_id) return canManageSubtasks(p, parent!) || isAssignee(p, t)
  return canEditFields(p, t) || isAssignee(p, t)
}

// Done tick: any assignee (+admin) — one shared tick per task
export const canTickDone = (p: Profile | null, t: Task, _parent?: Task | null) => {
  if (!p) return false
  if (isAdmin(p)) return true
  return isAssignee(p, t) && !t.tick_checked
}

// Checked tick: tasks → admin only; subtasks → main task's assignees + admin.
// Items where worker = checker (sole-admin-assignee task; subtask assigned to
// one of the main assignees) complete with the single Done tick instead.
export const canTickChecked = (p: Profile | null, t: Task, parent?: Task | null) => {
  if (!p || !t.tick_done) return false
  if (t.parent_id) {
    const sub = t.assignee_ids[0]
    if (sub && parent?.assignee_ids.includes(sub)) return false
    return canManageSubtasks(p, parent!)
  }
  return isAdmin(p)
}

// Legitimacy approval of member-created tasks: admin only
export const canApprove = (p: Profile | null) => isAdmin(p)

// Shared project-page ordering: admin or project creator
export const canReorderProject = (p: Profile | null, projectCreatedBy: string) =>
  !!p && (isAdmin(p) || projectCreatedBy === p.id)
