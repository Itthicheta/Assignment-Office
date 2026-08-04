import { supabase } from './supabase'

// Insert an in-app notification for another user. Never notify yourself.
export async function notify(opts: {
  userId: string | null | undefined
  actorId: string
  taskId: string
  type: 'assigned' | 'comment' | 'review' | 'returned' | 'done'
}) {
  if (!opts.userId || opts.userId === opts.actorId) return
  await supabase.from('notifications').insert({
    user_id: opts.userId,
    actor_id: opts.actorId,
    task_id: opts.taskId,
    type: opts.type,
  })
}

export async function logActivity(opts: {
  taskId: string
  actorId: string
  action: string
  detail?: Record<string, string>
}) {
  await supabase.from('activity').insert({
    task_id: opts.taskId,
    actor_id: opts.actorId,
    action: opts.action,
    detail: opts.detail ?? {},
  })
}
