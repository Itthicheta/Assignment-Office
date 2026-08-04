import { supabase } from './supabase'
import { logActivity, notify } from './notify'
import type { Status, Task } from './types'

// Change a task's status with the same side effects everywhere it happens
// (list row or task drawer): activity log entry + workflow notifications.
// Returns an error message, or null on success.
export async function changeTaskStatus(task: Task, status: Status, actorId: string): Promise<string | null> {
  const { error } = await supabase.from('tasks').update({ status }).eq('id', task.id)
  if (error) return error.message
  await logActivity({ projectId: task.project_id, taskId: task.id, actorId, action: 'status', detail: { status } })
  if (status === 'in_review' && actorId !== task.created_by) {
    await notify({ userId: task.created_by, actorId, taskId: task.id, type: 'review' })
  }
  if (task.status === 'in_review' && ['todo', 'in_progress'].includes(status) && actorId !== task.assignee_id) {
    await notify({ userId: task.assignee_id, actorId, taskId: task.id, type: 'returned' })
  }
  if (status === 'done' && actorId !== task.assignee_id) {
    await notify({ userId: task.assignee_id, actorId, taskId: task.id, type: 'done' })
  }
  return null
}
