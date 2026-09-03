import { supabase } from './supabase'
import { logActivity, notify } from './notify'
import type { Task } from './types'

// Toggle the assignee's Done tick. checkerIds = who reviews this item
// (admins for tasks, the main task's assignee for subtasks) — they get
// notified that work awaits their Checked tick.
export async function setTickDone(
  task: Task,
  value: boolean,
  actorId: string,
  checkerIds: (string | null | undefined)[] = [],
): Promise<string | null> {
  const { error } = await supabase.from('tasks').update({ tick_done: value }).eq('id', task.id)
  if (error) return error.message
  await logActivity({
    projectId: task.project_id,
    taskId: task.id,
    actorId,
    action: value ? 'tick_done' : 'untick_done',
  })
  if (value) {
    for (const uid of new Set(checkerIds)) {
      await notify({ userId: uid, actorId, taskId: task.id, type: 'review' })
    }
  }
  return null
}

// Toggle the checker's approval tick; every assignee is told the outcome.
export async function setTickChecked(task: Task, value: boolean, actorId: string): Promise<string | null> {
  const { error } = await supabase.from('tasks').update({ tick_checked: value }).eq('id', task.id)
  if (error) return error.message
  await logActivity({
    projectId: task.project_id,
    taskId: task.id,
    actorId,
    action: value ? 'checked' : 'unchecked',
  })
  for (const uid of task.assignee_ids) {
    await notify({ userId: uid, actorId, taskId: task.id, type: value ? 'done' : 'returned' })
  }
  return null
}

// Admin's legitimacy approval: locks rename/delete; notifies the creator.
export async function setApproved(task: Task, value: boolean, actorId: string): Promise<string | null> {
  const { error } = await supabase.from('tasks').update({ approved: value }).eq('id', task.id)
  if (error) return error.message
  await logActivity({
    projectId: task.project_id,
    taskId: task.id,
    actorId,
    action: value ? 'approved' : 'unapproved',
  })
  if (value && actorId !== task.created_by) {
    await notify({ userId: task.created_by, actorId, taskId: task.id, type: 'task_approved' })
  }
  return null
}

// Reject work: creator/admin unticks the assignee's work tick to send it back.
export async function rejectWork(task: Task, actorId: string): Promise<string | null> {
  const { error } = await supabase.from('tasks').update({ tick_done: false }).eq('id', task.id)
  if (error) return error.message
  await logActivity({ projectId: task.project_id, taskId: task.id, actorId, action: 'untick_done' })
  for (const uid of task.assignee_ids) {
    await notify({ userId: uid, actorId, taskId: task.id, type: 'returned' })
  }
  return null
}
