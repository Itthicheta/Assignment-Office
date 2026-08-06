// Client-side mirror of the permission rules enforced in the database
// (see supabase/migrations — enforce_task_update / can_create_task /
// can_delete_task / RLS). The database is the source of truth.
import type { Profile, Task } from './types'

export const isAdmin = (p: Profile | null) => p?.role === 'admin'

// Full field control over a TOP-LEVEL task: admin or its creator
export const canEditFields = (p: Profile | null, t: Task) =>
  !!p && (isAdmin(p) || t.created_by === p.id)

// Approved tasks are rename-locked for everyone but admin
export const canRename = (p: Profile | null, t: Task) =>
  canEditFields(p, t) && (!t.approved || isAdmin(p))

// Subtask management (create/delete/assign/edit): main task's assignee + admin
export const canManageSubtasks = (p: Profile | null, parent: Task) =>
  !!p && (isAdmin(p) || parent.assignee_id === p.id)

export const canDelete = (p: Profile | null, t: Task, parent?: Task | null) => {
  if (!p) return false
  if (isAdmin(p)) return true
  if (t.parent_id) return !!parent && parent.assignee_id === p.id
  return t.created_by === p.id && !t.approved
}

export const canEditDescription = (p: Profile | null, t: Task, parent?: Task | null) => {
  if (!p) return false
  if (t.parent_id) return canManageSubtasks(p, parent!) || t.assignee_id === p.id
  return canEditFields(p, t) || t.assignee_id === p.id
}

// Done tick: strictly the assignee (+admin), tasks and subtasks alike
export const canTickDone = (p: Profile | null, t: Task, _parent?: Task | null) => {
  if (!p) return false
  if (isAdmin(p)) return true
  return t.assignee_id === p.id && !t.tick_checked
}

// Checked tick: tasks → admin only; subtasks → main task's assignee + admin.
// Items where worker = checker (task assigned to an admin; subtask assigned
// to the main assignee themself) complete with the single Done tick and
// show no Checked box (see TaskTicks / derive_task_status).
export const canTickChecked = (p: Profile | null, t: Task, parent?: Task | null) => {
  if (!p || !t.tick_done) return false
  if (t.parent_id) return t.assignee_id !== parent?.assignee_id && canManageSubtasks(p, parent!)
  return isAdmin(p)
}

// Legitimacy approval of member-created tasks: admin only
export const canApprove = (p: Profile | null) => isAdmin(p)

// Shared project-page ordering: admin or project creator
export const canReorderProject = (p: Profile | null, projectCreatedBy: string) =>
  !!p && (isAdmin(p) || projectCreatedBy === p.id)

// Non-admin creators may assign their tasks only to themselves or nobody
export const assigneeChoices = (p: Profile | null, t: Task, all: Profile[]) => {
  if (isAdmin(p)) return all
  return all.filter((x) => x.id === p?.id)
}
