import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { DndContext, PointerSensor, TouchSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useI18n, type TKey } from '../lib/i18n'
import { logActivity, notify } from '../lib/notify'
import {
  assigneeChoices,
  canDelete,
  canEditDescription,
  canEditFields,
  canManageSubtasks,
  canRename,
} from '../lib/can'
import type { Activity, Comment, Priority, Project, Task } from '../lib/types'
import { fmtDue, isOverdue } from '../lib/due'
import { isAdmin } from '../lib/can'
import Avatar from './Avatar'
import TaskTicks from './TaskTicks'
import ApproveControl from './ApproveControl'
import FilesSection from './FilesSection'
import SortableSub from './SortableSub'
import { positionAfterMove } from '../lib/reorder'

interface Props {
  task: Task
  parent?: Task | null
  subtasks: Task[]
  onClose: () => void
  onChanged: () => void
}

export default function TaskDrawer({ task, parent, subtasks, onClose, onChanged }: Props) {
  const { session, profile, profiles } = useAuth()
  const { t } = useI18n()
  const [comments, setComments] = useState<Comment[]>([])
  const [activity, setActivity] = useState<Activity[]>([])
  const [commentBody, setCommentBody] = useState('')
  const [newSub, setNewSub] = useState('')
  const [title, setTitle] = useState(task.title)
  const [description, setDescription] = useState(task.description)
  const [subEdits, setSubEdits] = useState<Record<string, string>>({})
  const [editingComment, setEditingComment] = useState<{ id: string; body: string } | null>(null)
  const [projectList, setProjectList] = useState<Project[]>([])
  const navigate = useNavigate()
  const subSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
  )

  const onSubDragEnd = async (e: DragEndEvent) => {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const pos = positionAfterMove(subtasks, String(active.id), String(over.id))
    if (pos === null) return
    const { error } = await supabase.from('tasks').update({ position: pos }).eq('id', active.id)
    if (error) alert(error.message)
    onChanged()
  }

  const me = session!.user.id
  const isSub = !!task.parent_id
  const editor = isSub ? canManageSubtasks(profile, parent!) : canEditFields(profile, task)
  const renamer = isSub ? editor : canRename(profile, task)
  const descEditor = canEditDescription(profile, task, parent)
  const subManager = canManageSubtasks(profile, task)

  useEffect(() => {
    setTitle(task.title)
    setDescription(task.description)
    const load = async () => {
      const [c, a] = await Promise.all([
        supabase.from('comments').select('*').eq('task_id', task.id).order('created_at'),
        supabase.from('activity').select('*').eq('task_id', task.id).order('created_at', { ascending: false }).limit(30),
      ])
      setComments((c.data as Comment[]) ?? [])
      setActivity((a.data as Activity[]) ?? [])
    }
    load()
  }, [task.id])

  // project list for the admin's move-to-project dropdown
  useEffect(() => {
    if (!isAdmin(profile) || task.parent_id) return
    supabase
      .from('projects')
      .select('*')
      .eq('archived', false)
      .order('name')
      .then(({ data }) => setProjectList((data as Project[]) ?? []))
  }, [profile?.role, task.parent_id])

  // move the task — its subtasks and files travel with it
  const moveToProject = async (projectId: string) => {
    if (!projectId || projectId === task.project_id) return
    const { error } = await supabase.from('tasks').update({ project_id: projectId }).eq('id', task.id)
    if (error) {
      alert(error.message)
      return
    }
    const subIds = subtasks.map((s) => s.id)
    if (subIds.length) {
      await supabase.from('tasks').update({ project_id: projectId }).in('id', subIds)
    }
    await supabase.from('attachments').update({ project_id: projectId }).in('task_id', [task.id, ...subIds])
    navigate(`/projects/${projectId}?task=${task.id}`)
  }

  const reloadActivity = async () => {
    const { data } = await supabase
      .from('activity')
      .select('*')
      .eq('task_id', task.id)
      .order('created_at', { ascending: false })
      .limit(30)
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
    // new subtasks auto-assign to their creator
    const { error } = await supabase.from('tasks').insert({
      project_id: task.project_id,
      parent_id: task.id,
      title: newSub.trim(),
      created_by: me,
      assignee_id: me,
    })
    if (error) alert(error.message)
    setNewSub('')
    onChanged()
  }

  const saveSubTitle = async (sub: Task) => {
    const next = (subEdits[sub.id] ?? sub.title).trim()
    if (next && next !== sub.title) {
      const { error } = await supabase.from('tasks').update({ title: next }).eq('id', sub.id)
      if (error) alert(error.message)
      onChanged()
    }
    setSubEdits((s) => {
      const { [sub.id]: _, ...rest } = s
      return rest
    })
  }

  const assignSubtask = async (sub: Task, assignee_id: string) => {
    const value = assignee_id || null
    const { error } = await supabase.from('tasks').update({ assignee_id: value }).eq('id', sub.id)
    if (error) alert(error.message)
    else await notify({ userId: value, actorId: me, taskId: sub.id, type: 'assigned' })
    onChanged()
  }

  const removeSubtask = async (sub: Task) => {
    const { error } = await supabase.from('tasks').delete().eq('id', sub.id)
    if (error) alert(error.message)
    onChanged()
  }

  const removeTask = async () => {
    if (!confirm(t('confirmDelete'))) return
    const { error } = await supabase.from('tasks').delete().eq('id', task.id)
    if (error) {
      alert(error.message)
      return
    }
    onClose()
    onChanged()
  }

  const nameOf = (uid: string | null) => profiles.find((p) => p.id === uid)?.full_name ?? '—'

  const activityText = (a: Activity) => {
    const map: Record<string, string> = {
      created: t('act_created'),
      assigned: `${t('act_assigned')} ${a.detail.name ?? ''}`,
      unassigned: t('act_unassigned'),
      due: `${t('act_due')} ${a.detail.date ?? ''}`,
      priority: `${t('act_priority')} ${a.detail.priority ? t(a.detail.priority as TKey) : ''}`,
      deleted: `${t('act_deleted')} “${a.detail.title ?? ''}”`,
      tick_done: t('act_tick_done'),
      untick_done: t('act_untick_done'),
      checked: t('act_checked'),
      unchecked: t('act_unchecked'),
      approved: t('act_approved'),
      unapproved: t('act_unapproved'),
      status: `→ ${a.detail.status ? t(a.detail.status as TKey) : ''}`,
    }
    return map[a.action] ?? a.action
  }

  const inputCls =
    'w-full rounded-lg border border-slate-600 bg-slate-900 px-2 py-1.5 text-sm focus:border-indigo-500 focus:outline-none disabled:bg-slate-900 disabled:text-slate-400'

  const mainAssigneeChoices = assigneeChoices(profile, task, profiles)

  return (
    <div className="fixed inset-0 z-30 flex justify-end bg-black/30" onClick={onClose}>
      <div
        className="flex h-full w-full max-w-lg flex-col overflow-y-auto bg-slate-900 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-slate-800 p-4">
          <div className="flex items-start gap-2">
            <textarea
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={!renamer}
              rows={1}
              className="flex-1 resize-none border-none bg-transparent text-lg font-semibold focus:outline-none disabled:text-slate-200"
            />
            {title.trim() !== task.title && title.trim() !== '' && (
              <button
                onClick={saveTitle}
                className="rounded-md bg-indigo-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-indigo-700"
              >
                ✓ {t('save')}
              </button>
            )}
            <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-800">✕</button>
          </div>
          <div className="mt-1 flex items-center justify-between gap-2">
            {isSub && parent && (
              <span className="truncate text-xs text-slate-400">↳ {parent.title}</span>
            )}
            {!isSub && isAdmin(profile) && projectList.length > 1 && (
              <select
                value={task.project_id}
                onChange={(e) => moveToProject(e.target.value)}
                title={t('projects')}
                className="max-w-40 rounded-md border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-xs text-slate-400 focus:border-indigo-500 focus:outline-none"
              >
                {projectList.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            )}
            <span className="ml-auto flex items-center gap-2 text-xs whitespace-nowrap text-slate-400">
              {t('createdBy')}: {nameOf(task.created_by)}
              <ApproveControl task={task} onChanged={() => { onChanged(); reloadActivity() }} />
            </span>
          </div>
        </div>

        <div className="space-y-4 p-4">
          {/* ① status & fields */}
          <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-800/40 p-3">
          <div className="flex items-center justify-between gap-2 rounded-xl bg-slate-900 px-3 py-2.5">
            <TaskTicks task={task} parent={parent} onChanged={() => { onChanged(); reloadActivity() }} />
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${task.status === 'done' ? 'bg-emerald-950/70 text-emerald-300' : task.tick_done ? 'bg-amber-900/60 text-amber-300' : 'bg-blue-950/70 text-blue-300'}`}>
              {task.status === 'done' ? t('done') : task.tick_done ? t('waitingMyCheck') : t('in_progress')}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs font-semibold text-slate-400">
              {t('assignee')}
              <select
                value={task.assignee_id ?? ''}
                onChange={(e) => changeAssignee(e.target.value)}
                disabled={!editor}
                className={`mt-1 ${inputCls}`}
              >
                <option value="">{t('unassigned')}</option>
                {mainAssigneeChoices.map((p) => (
                  <option key={p.id} value={p.id}>{p.full_name}</option>
                ))}
                {task.assignee_id && !mainAssigneeChoices.some((p) => p.id === task.assignee_id) && (
                  <option value={task.assignee_id}>{nameOf(task.assignee_id)}</option>
                )}
              </select>
            </label>
            <label className="block text-xs font-semibold text-slate-400">
              {t('priority')}
              <select
                value={task.priority}
                onChange={(e) => changePriority(e.target.value as Priority)}
                disabled={!editor}
                className={`mt-1 ${inputCls}`}
              >
                <option value="normal">{t('normal')}</option>
                <option value="urgent">{t('urgent')}</option>
              </select>
            </label>
            <label className="block text-xs font-semibold text-slate-400">
              {t('dueDate')}
              <input
                type="date"
                value={task.due_date ?? ''}
                onChange={(e) => changeDue(e.target.value)}
                disabled={!editor}
                className={`mt-1 ${inputCls}`}
              />
            </label>
            <label className="block text-xs font-semibold text-slate-400">
              {t('dueTime')}
              <input
                type="time"
                value={task.due_time?.slice(0, 5) ?? ''}
                onChange={async (e) => {
                  await patch({ due_time: e.target.value || null })
                }}
                disabled={!editor || !task.due_date}
                className={`mt-1 ${inputCls}`}
              />
            </label>
          </div>

          <label className="block text-xs font-semibold text-slate-400">
            {t('description')}
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={saveDescription}
              disabled={!descEditor}
              rows={3}
              placeholder={descEditor ? t('addDetails') : ''}
              className={`mt-1 ${inputCls} resize-y`}
            />
          </label>
          </div>

          {/* ② subtasks & files */}
          <div className="space-y-3 rounded-xl border border-slate-800 bg-indigo-950/30 p-3">
          {!isSub && (
            <div>
              <h3 className="mb-1 text-xs font-semibold text-slate-400">
                {t('subtasks')} ({subtasks.filter((s) => s.status === 'done').length}/{subtasks.length})
              </h3>
              <div className="space-y-1">
                <DndContext sensors={subSensors} onDragEnd={onSubDragEnd}>
                <SortableContext items={subtasks.map((s) => s.id)} strategy={verticalListSortingStrategy}>
                {subtasks.map((sub) => (
                  <SortableSub key={sub.id} id={sub.id} disabled={!subManager}>
                  <div className="rounded-lg border border-slate-800 bg-slate-900 px-2 py-1.5">
                    <div className="flex items-center gap-2">
                      <input
                        value={subEdits[sub.id] ?? sub.title}
                        onChange={(e) => setSubEdits((s) => ({ ...s, [sub.id]: e.target.value }))}
                        onBlur={() => saveSubTitle(sub)}
                        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                        disabled={!subManager}
                        className={`flex-1 border-none bg-transparent text-sm focus:outline-none ${sub.status === 'done' ? 'text-slate-400 line-through' : ''}`}
                      />
                      {!subManager && sub.due_date && (
                        <span className={`text-[10px] whitespace-nowrap ${isOverdue(sub) ? 'font-semibold text-red-400' : 'text-slate-400'}`}>
                          {fmtDue(sub)}
                        </span>
                      )}
                      <TaskTicks task={sub} parent={task} onChanged={onChanged} />
                      <select
                        value={sub.assignee_id ?? ''}
                        onChange={(e) => assignSubtask(sub, e.target.value)}
                        disabled={!subManager}
                        className="max-w-24 rounded-md border border-slate-700 bg-slate-900 px-1 py-0.5 text-xs text-slate-400 focus:outline-none"
                      >
                        <option value="">—</option>
                        {profiles.map((p) => (
                          <option key={p.id} value={p.id}>{p.full_name}</option>
                        ))}
                      </select>
                      {subManager && (
                        <button onClick={() => removeSubtask(sub)} className="text-slate-600 hover:text-red-500">✕</button>
                      )}
                    </div>
                    {subManager && (
                      <div className="mt-1 flex items-center gap-2 pl-1">
                        <span className="text-[10px] text-slate-500">📅</span>
                        <input
                          type="date"
                          value={sub.due_date ?? ''}
                          onChange={async (e) => {
                            const { error } = await supabase
                              .from('tasks')
                              .update({ due_date: e.target.value || null, ...(e.target.value ? {} : { due_time: null }) })
                              .eq('id', sub.id)
                            if (error) alert(error.message)
                            onChanged()
                          }}
                          className={`rounded-md border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-[11px] focus:border-indigo-500 focus:outline-none ${isOverdue(sub) ? 'text-red-400' : 'text-slate-300'}`}
                        />
                        <input
                          type="time"
                          value={sub.due_time?.slice(0, 5) ?? ''}
                          disabled={!sub.due_date}
                          onChange={async (e) => {
                            const { error } = await supabase
                              .from('tasks')
                              .update({ due_time: e.target.value || null })
                              .eq('id', sub.id)
                            if (error) alert(error.message)
                            onChanged()
                          }}
                          className="rounded-md border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-[11px] text-slate-300 focus:border-indigo-500 focus:outline-none disabled:opacity-40"
                        />
                      </div>
                    )}
                  </div>
                  </SortableSub>
                ))}
                </SortableContext>
                </DndContext>
              </div>
              {subManager && (
                <form onSubmit={addSubtask}>
                  <input
                    value={newSub}
                    onChange={(e) => setNewSub(e.target.value)}
                    placeholder={`+ ${t('addSubtask')}`}
                    className="mt-1 w-full rounded-lg border border-dashed border-slate-600 px-2 py-1.5 text-sm focus:border-indigo-500 focus:outline-none"
                  />
                </form>
              )}
            </div>
          )}

          <FilesSection
            projectId={task.project_id}
            taskId={task.id}
            canUpload={
              isAdmin(profile) ||
              task.assignee_id === me ||
              subtasks.some((s) => s.assignee_id === me)
            }
          />
          </div>

          {/* ③ comments & activity */}
          <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-800/40 p-3">
          <div>
            <h3 className="mb-1 text-xs font-semibold text-slate-400">{t('comments')} ({comments.length})</h3>
            <div className="space-y-2">
              {comments.map((c) => (
                <div key={c.id} className="flex items-start gap-2">
                  <Avatar name={nameOf(c.author_id)} size={6} />
                  <div className="flex-1 rounded-lg bg-slate-900 px-3 py-2">
                    <p className="flex items-center text-xs font-semibold">
                      {nameOf(c.author_id)}
                      <span className="ml-2 font-normal text-slate-400">{new Date(c.created_at).toLocaleString()}</span>
                      {c.author_id === me && (
                        <span className="ml-auto flex gap-2">
                          <button
                            onClick={() => setEditingComment({ id: c.id, body: c.body })}
                            className="font-normal text-slate-600 hover:text-indigo-400"
                          >✏️</button>
                          <button
                            onClick={async () => {
                              await supabase.from('comments').delete().eq('id', c.id)
                              setComments((cs) => cs.filter((x) => x.id !== c.id))
                            }}
                            className="font-normal text-slate-600 hover:text-red-500"
                          >✕</button>
                        </span>
                      )}
                    </p>
                    {editingComment?.id === c.id ? (
                      <form
                        onSubmit={async (e) => {
                          e.preventDefault()
                          const body = editingComment.body.trim()
                          if (body) {
                            await supabase.from('comments').update({ body }).eq('id', c.id)
                            setComments((cs) => cs.map((x) => (x.id === c.id ? { ...x, body } : x)))
                          }
                          setEditingComment(null)
                        }}
                        className="mt-1 flex gap-2"
                      >
                        <input
                          autoFocus
                          value={editingComment.body}
                          onChange={(e) => setEditingComment({ id: c.id, body: e.target.value })}
                          className="flex-1 rounded-md border border-slate-600 px-2 py-1 text-sm focus:border-indigo-500 focus:outline-none"
                        />
                        <button className="rounded-md bg-indigo-600 px-2 py-1 text-xs font-semibold text-white">{t('send')}</button>
                      </form>
                    ) : (
                      <p className="text-sm whitespace-pre-wrap">{c.body}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <form onSubmit={addComment} className="mt-2 flex gap-2">
              <input
                value={commentBody}
                onChange={(e) => setCommentBody(e.target.value)}
                placeholder={t('writeComment')}
                className="flex-1 rounded-lg border border-slate-600 px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none"
              />
              <button className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700">
                {t('send')}
              </button>
            </form>
          </div>

          <details>
            <summary className="cursor-pointer text-xs font-semibold text-slate-400 select-none">
              {t('activityLog')} ({activity.length}) ▸
            </summary>
            <ul className="mt-2 space-y-1">
              {activity.map((a) => (
                <li key={a.id} className="text-xs text-slate-400">
                  <b className="text-slate-400">{nameOf(a.actor_id)}</b> {activityText(a)}
                  <span className="ml-1">· {new Date(a.created_at).toLocaleString()}</span>
                </li>
              ))}
            </ul>
          </details>
          </div>

          {canDelete(profile, task, parent) && (
            <button onClick={removeTask} className="text-xs text-red-500 hover:underline">
              🗑 {t('deleteTask')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
