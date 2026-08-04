import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useI18n, type TKey } from '../lib/i18n'
import { logActivity, notify } from '../lib/notify'
import { canDelete, canEditDescription, canEditFields, canToggleSubtask, statusChoices } from '../lib/can'
import type { Activity, Comment, Priority, Status, Task } from '../lib/types'
import { PRIORITIES } from '../lib/types'
import Avatar from './Avatar'

interface Props {
  task: Task
  subtasks: Task[]
  onClose: () => void
  onChanged: () => void
}

export default function TaskDrawer({ task, subtasks, onClose, onChanged }: Props) {
  const { session, profile, profiles } = useAuth()
  const { t } = useI18n()
  const [comments, setComments] = useState<Comment[]>([])
  const [activity, setActivity] = useState<Activity[]>([])
  const [commentBody, setCommentBody] = useState('')
  const [newSub, setNewSub] = useState('')
  const [title, setTitle] = useState(task.title)
  const [description, setDescription] = useState(task.description)

  const me = session!.user.id
  const editor = canEditFields(profile, task)
  const descEditor = canEditDescription(profile, task)
  const statuses = statusChoices(profile, task)

  useEffect(() => {
    setTitle(task.title)
    setDescription(task.description)
    const load = async () => {
      const [c, a] = await Promise.all([
        supabase.from('comments').select('*').eq('task_id', task.id).order('created_at'),
        supabase.from('activity').select('*').eq('task_id', task.id).order('created_at', { ascending: false }).limit(20),
      ])
      setComments((c.data as Comment[]) ?? [])
      setActivity((a.data as Activity[]) ?? [])
    }
    load()
  }, [task.id])

  const reloadActivity = async () => {
    const { data } = await supabase
      .from('activity')
      .select('*')
      .eq('task_id', task.id)
      .order('created_at', { ascending: false })
      .limit(20)
    setActivity((data as Activity[]) ?? [])
  }

  const patch = async (fields: Partial<Task>) => {
    const { error } = await supabase.from('tasks').update(fields).eq('id', task.id)
    if (error) {
      alert(error.message)
      return false
    }
    onChanged()
    return true
  }

  const changeStatus = async (status: Status) => {
    if (!(await patch({ status }))) return
    await logActivity({ projectId: task.project_id, taskId: task.id, actorId: me, action: 'status', detail: { status } })
    if (status === 'in_review' && me !== task.created_by) {
      await notify({ userId: task.created_by, actorId: me, taskId: task.id, type: 'review' })
    }
    if (task.status === 'in_review' && ['todo', 'in_progress'].includes(status) && me !== task.assignee_id) {
      await notify({ userId: task.assignee_id, actorId: me, taskId: task.id, type: 'returned' })
    }
    if (status === 'done' && me !== task.assignee_id) {
      await notify({ userId: task.assignee_id, actorId: me, taskId: task.id, type: 'done' })
    }
    reloadActivity()
  }

  const changeAssignee = async (assignee_id: string) => {
    const value = assignee_id || null
    if (!(await patch({ assignee_id: value }))) return
    const name = profiles.find((p) => p.id === value)?.full_name
    await logActivity({
      projectId: task.project_id,
      taskId: task.id,
      actorId: me,
      action: value ? 'assigned' : 'unassigned',
      detail: name ? { name } : {},
    })
    await notify({ userId: value, actorId: me, taskId: task.id, type: 'assigned' })
    reloadActivity()
  }

  const changeDue = async (due_date: string) => {
    if (!(await patch({ due_date: due_date || null }))) return
    await logActivity({ projectId: task.project_id, taskId: task.id, actorId: me, action: 'due', detail: { date: due_date } })
    reloadActivity()
  }

  const changePriority = async (priority: Priority) => {
    if (!(await patch({ priority }))) return
    await logActivity({ projectId: task.project_id, taskId: task.id, actorId: me, action: 'priority', detail: { priority } })
    reloadActivity()
  }

  const saveTitle = async () => {
    if (title.trim() && title !== task.title) await patch({ title: title.trim() })
  }

  const saveDescription = async () => {
    if (description !== task.description) await patch({ description })
  }

  const addComment = async (e: FormEvent) => {
    e.preventDefault()
    if (!commentBody.trim()) return
    await supabase.from('comments').insert({ task_id: task.id, author_id: me, body: commentBody.trim() })
    for (const uid of new Set([task.assignee_id, task.created_by])) {
      await notify({ userId: uid, actorId: me, taskId: task.id, type: 'comment' })
    }
    setCommentBody('')
    const { data } = await supabase.from('comments').select('*').eq('task_id', task.id).order('created_at')
    setComments((data as Comment[]) ?? [])
  }

  const addSubtask = async (e: FormEvent) => {
    e.preventDefault()
    if (!newSub.trim()) return
    await supabase.from('tasks').insert({
      project_id: task.project_id,
      parent_id: task.id,
      title: newSub.trim(),
      created_by: me,
    })
    setNewSub('')
    onChanged()
  }

  const toggleSubtask = async (sub: Task) => {
    if (!canToggleSubtask(profile, sub, task)) return
    await supabase.from('tasks').update({ status: sub.status === 'done' ? 'todo' : 'done' }).eq('id', sub.id)
    onChanged()
  }

  const removeTask = async () => {
    if (!confirm(t('confirmDelete'))) return
    await supabase.from('tasks').delete().eq('id', task.id)
    onClose()
    onChanged()
  }

  const nameOf = (uid: string | null) => profiles.find((p) => p.id === uid)?.full_name ?? '—'

  const activityText = (a: Activity) => {
    const map: Record<string, string> = {
      created: t('act_created'),
      status: `${t('act_status')} ${a.detail.status ? t(a.detail.status as TKey) : ''}`,
      assigned: `${t('act_assigned')} ${a.detail.name ?? ''}`,
      unassigned: t('act_unassigned'),
      due: `${t('act_due')} ${a.detail.date ?? ''}`,
      priority: `${t('act_priority')} ${a.detail.priority ? t(a.detail.priority as TKey) : ''}`,
      deleted: `${t('act_deleted')} “${a.detail.title ?? ''}”`,
    }
    return map[a.action] ?? a.action
  }

  const selectCls =
    'w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm focus:border-indigo-500 focus:outline-none disabled:bg-slate-50 disabled:text-slate-400'

  return (
    <div className="fixed inset-0 z-30 flex justify-end bg-black/30" onClick={onClose}>
      <div
        className="flex h-full w-full max-w-lg flex-col overflow-y-auto bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-2 border-b border-slate-100 p-4">
          <textarea
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={saveTitle}
            disabled={!editor}
            rows={1}
            className="flex-1 resize-none border-none bg-transparent text-lg font-semibold focus:outline-none disabled:text-slate-700"
          />
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100">✕</button>
        </div>

        <div className="space-y-4 p-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs font-semibold text-slate-500">
              {t('status')}
              <select
                value={task.status}
                onChange={(e) => changeStatus(e.target.value as Status)}
                disabled={statuses.length === 0}
                className={`mt-1 ${selectCls}`}
              >
                {(statuses.length ? statuses : [task.status]).map((s) => (
                  <option key={s} value={s}>{t(s)}</option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-semibold text-slate-500">
              {t('assignee')}
              <select
                value={task.assignee_id ?? ''}
                onChange={(e) => changeAssignee(e.target.value)}
                disabled={!editor}
                className={`mt-1 ${selectCls}`}
              >
                <option value="">{t('unassigned')}</option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>{p.full_name}</option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-semibold text-slate-500">
              {t('dueDate')}
              <input
                type="date"
                value={task.due_date ?? ''}
                onChange={(e) => changeDue(e.target.value)}
                disabled={!editor}
                className={`mt-1 ${selectCls}`}
              />
            </label>
            <label className="block text-xs font-semibold text-slate-500">
              {t('priority')}
              <select
                value={task.priority}
                onChange={(e) => changePriority(e.target.value as Priority)}
                disabled={!editor}
                className={`mt-1 ${selectCls}`}
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>{t(p)}</option>
                ))}
              </select>
            </label>
          </div>

          <label className="block text-xs font-semibold text-slate-500">
            {t('description')}
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={saveDescription}
              disabled={!descEditor}
              rows={3}
              placeholder={descEditor ? t('addDetails') : ''}
              className={`mt-1 ${selectCls} resize-y`}
            />
          </label>

          <div>
            <h3 className="mb-1 text-xs font-semibold text-slate-500">
              {t('subtasks')} ({subtasks.filter((s) => s.status === 'done').length}/{subtasks.length})
            </h3>
            <div className="space-y-1">
              {subtasks.map((sub) => (
                <div key={sub.id} className="flex items-center gap-2 rounded-lg border border-slate-100 px-2 py-1.5">
                  <input
                    type="checkbox"
                    checked={sub.status === 'done'}
                    onChange={() => toggleSubtask(sub)}
                    disabled={!canToggleSubtask(profile, sub, task)}
                    className="h-4 w-4 accent-indigo-600"
                  />
                  <span className={`flex-1 text-sm ${sub.status === 'done' ? 'text-slate-400 line-through' : ''}`}>
                    {sub.title}
                  </span>
                  {sub.assignee_id && <Avatar name={nameOf(sub.assignee_id)} size={6} />}
                </div>
              ))}
            </div>
            <form onSubmit={addSubtask}>
              <input
                value={newSub}
                onChange={(e) => setNewSub(e.target.value)}
                placeholder={`+ ${t('addSubtask')}`}
                className="mt-1 w-full rounded-lg border border-dashed border-slate-300 px-2 py-1.5 text-sm focus:border-indigo-500 focus:outline-none"
              />
            </form>
          </div>

          <div>
            <h3 className="mb-1 text-xs font-semibold text-slate-500">{t('comments')} ({comments.length})</h3>
            <div className="space-y-2">
              {comments.map((c) => (
                <div key={c.id} className="flex items-start gap-2">
                  <Avatar name={nameOf(c.author_id)} size={6} />
                  <div className="flex-1 rounded-lg bg-slate-50 px-3 py-2">
                    <p className="text-xs font-semibold">{nameOf(c.author_id)}
                      <span className="ml-2 font-normal text-slate-400">{new Date(c.created_at).toLocaleString()}</span>
                    </p>
                    <p className="text-sm whitespace-pre-wrap">{c.body}</p>
                  </div>
                </div>
              ))}
            </div>
            <form onSubmit={addComment} className="mt-2 flex gap-2">
              <input
                value={commentBody}
                onChange={(e) => setCommentBody(e.target.value)}
                placeholder={t('writeComment')}
                className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none"
              />
              <button className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700">
                {t('send')}
              </button>
            </form>
          </div>

          <div>
            <h3 className="mb-1 text-xs font-semibold text-slate-500">{t('activityLog')}</h3>
            <ul className="space-y-1">
              {activity.map((a) => (
                <li key={a.id} className="text-xs text-slate-400">
                  <b className="text-slate-500">{nameOf(a.actor_id)}</b> {activityText(a)}
                  <span className="ml-1">· {new Date(a.created_at).toLocaleString()}</span>
                </li>
              ))}
            </ul>
          </div>

          {canDelete(profile, task) && (
            <button onClick={removeTask} className="text-xs text-red-500 hover:underline">
              🗑 {t('deleteTask')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
