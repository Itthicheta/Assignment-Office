import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { DndContext, PointerSensor, TouchSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useI18n } from '../lib/i18n'
import { logActivity, notify } from '../lib/notify'
import { assigneeChoices, canEditFields, canManageSubtasks, canReorderProject, isAdmin } from '../lib/can'
import { PriorityBadge } from '../components/Badges'
import { fmtDue, isOverdue } from '../lib/due'
import Avatar from '../components/Avatar'
import TaskTicks from '../components/TaskTicks'
import ApproveControl from '../components/ApproveControl'
import TaskDrawer from '../components/TaskDrawer'
import FilesSection from '../components/FilesSection'
import SortableSub from '../components/SortableSub'
import { positionAfterMove } from '../lib/reorder'
import type { Profile, Project, Task } from '../lib/types'


function AssigneeSelect({
  task,
  parent,
  profiles,
  onAssign,
}: {
  task: Task
  parent?: Task | null
  profiles: Profile[]
  onAssign: (assigneeId: string) => void
}) {
  const { profile } = useAuth()
  const { t } = useI18n()
  const editable = task.parent_id ? canManageSubtasks(profile, parent!) : canEditFields(profile, task)

  if (!editable) {
    return task.assignee_id ? (
      <Avatar name={profiles.find((p) => p.id === task.assignee_id)?.full_name ?? '?'} size={7} />
    ) : null
  }
  const choices = assigneeChoices(profile, task, profiles)
  return (
    <select
      value={task.assignee_id ?? ''}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => onAssign(e.target.value)}
      className="max-w-28 rounded-lg border border-slate-700 bg-slate-900 px-1.5 py-1 text-xs text-slate-300 focus:border-indigo-400 focus:outline-none"
    >
      <option value="">{t('unassigned')}</option>
      {choices.map((p) => (
        <option key={p.id} value={p.id}>{p.full_name}</option>
      ))}
      {/* keep an out-of-list current assignee visible */}
      {task.assignee_id && !choices.some((p) => p.id === task.assignee_id) && (
        <option value={task.assignee_id}>
          {profiles.find((p) => p.id === task.assignee_id)?.full_name ?? '?'}
        </option>
      )}
    </select>
  )
}

function TaskRow({
  task,
  subtasks,
  profiles,
  draggable,
  dim = false,
  expanded,
  onToggleExpand,
  onOpen,
  onOpenSub,
  onChanged,
  onAssign,
  onAddSub,
}: {
  task: Task
  subtasks: Task[]
  profiles: Profile[]
  draggable: boolean
  dim?: boolean
  expanded: boolean
  onToggleExpand: () => void
  onOpen: () => void
  onOpenSub: (sub: Task) => void
  onChanged: () => void
  onAssign: (task: Task, assigneeId: string) => void
  onAddSub: (parent: Task, title: string) => void
}) {
  const { profile } = useAuth()
  const { t } = useI18n()
  const [newSub, setNewSub] = useState('')
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    disabled: !draggable,
  })
  const subSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
  )
  const manager = canManageSubtasks(profile, task)

  const onSubDragEnd = async (e: DragEndEvent) => {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const pos = positionAfterMove(subtasks, String(active.id), String(over.id))
    if (pos === null) return
    await supabase.from('tasks').update({ position: pos }).eq('id', active.id)
    onChanged()
  }
  const overdue = isOverdue(task)
  const waitingCheck = task.tick_done && !task.tick_checked && task.status !== 'done'

  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }}>
      <div
        onClick={onOpen}
        className={`flex w-full cursor-pointer items-center gap-2 rounded-xl border bg-slate-900 px-3 py-3 text-left shadow-sm hover:border-indigo-700 ${
          isDragging ? 'z-10 opacity-70' : ''
        } ${waitingCheck ? 'border-amber-300 bg-amber-950/40' : 'border-slate-700'} ${dim ? 'opacity-50 grayscale' : ''}`}
      >
        {draggable && (
          <span
            {...attributes}
            {...listeners}
            onClick={(e) => e.stopPropagation()}
            className="cursor-grab touch-none px-1 text-slate-600 select-none active:cursor-grabbing"
          >
            ⠿
          </span>
        )}
        {subtasks.length > 0 && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onToggleExpand()
            }}
            className="flex items-center gap-1 rounded-lg bg-indigo-950/60 px-2 py-1 text-sm font-semibold text-indigo-400 hover:bg-indigo-900"
          >
            <span className={`inline-block text-base leading-none transition-transform ${expanded ? 'rotate-90' : ''}`}>▸</span>
            <span className="text-xs">{subtasks.filter((s) => s.status === 'done').length}/{subtasks.length}</span>
          </button>
        )}
        <span className="min-w-0 flex-1">
          <span className={`block truncate text-sm font-medium ${task.status === 'done' ? 'text-slate-400 line-through' : ''}`}>
            {task.title}
          </span>
        </span>
        <PriorityBadge priority={task.priority} />
        {task.due_date && (
          <span className={`hidden text-xs whitespace-nowrap sm:inline ${overdue ? 'font-semibold text-red-400' : 'text-slate-400'}`}>
            {fmtDue(task)}
          </span>
        )}
        <TaskTicks task={task} onChanged={onChanged} />
        <AssigneeSelect task={task} profiles={profiles} onAssign={(a) => onAssign(task, a)} />
        <ApproveControl task={task} onChanged={onChanged} />
      </div>

      {expanded && (
        <div className="mt-1 ml-8 space-y-1">
          <DndContext sensors={subSensors} onDragEnd={onSubDragEnd}>
            <SortableContext items={subtasks.map((s) => s.id)} strategy={verticalListSortingStrategy}>
              {subtasks.map((sub) => (
                <SortableSub key={sub.id} id={sub.id} disabled={!manager}>
                  <div
                    onClick={() => onOpenSub(sub)}
                    className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 hover:border-indigo-700"
                  >
                    <span className="text-slate-600">↳</span>
                    <span className={`min-w-0 flex-1 truncate text-sm ${sub.status === 'done' ? 'text-slate-400 line-through' : ''}`}>
                      {sub.title}
                    </span>
                    {sub.due_date && (
                      <span className={`hidden text-[10px] whitespace-nowrap sm:inline ${isOverdue(sub) ? 'font-semibold text-red-400' : 'text-slate-400'}`}>
                        {fmtDue(sub)}
                      </span>
                    )}
                    <TaskTicks task={sub} parent={task} onChanged={onChanged} />
                    <AssigneeSelect task={sub} parent={task} profiles={profiles} onAssign={(a) => onAssign(sub, a)} />
                  </div>
                </SortableSub>
              ))}
            </SortableContext>
          </DndContext>
          {manager && (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                if (newSub.trim()) {
                  onAddSub(task, newSub.trim())
                  setNewSub('')
                }
              }}
            >
              <input
                value={newSub}
                onChange={(e) => setNewSub(e.target.value)}
                placeholder={`+ ${t('addSubtask')}`}
                className="w-full rounded-lg border border-dashed border-indigo-800 bg-slate-900 px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none"
              />
            </form>
          )}
        </div>
      )}
    </div>
  )
}

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>()
  const [params, setParams] = useSearchParams()
  const { session, profile, profiles } = useAuth()
  const { t } = useI18n()
  const [project, setProject] = useState<Project | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [newTitle, setNewTitle] = useState('')
  const [nameEdit, setNameEdit] = useState('')
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [logOpen, setLogOpen] = useState(false)
  const [loaded, setLoaded] = useState(false)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
  )

  const openTaskId = params.get('task')

  const load = useCallback(async () => {
    if (!id) return
    const [p, tsk] = await Promise.all([
      supabase.from('projects').select('*').eq('id', id).single(),
      supabase.from('tasks').select('*').eq('project_id', id).order('position'),
    ])
    setProject(p.data as Project)
    setNameEdit((p.data as Project)?.name ?? '')
    setTasks((tsk.data as Task[]) ?? [])
    setLoaded(true)
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  // three stages: working → work ticked (awaiting check) → fully done (log)
  const inProgress = useMemo(
    () =>
      tasks
        .filter((x) => !x.parent_id && x.status === 'in_progress' && !x.tick_done)
        .sort((a, b) => a.position - b.position),
    [tasks],
  )
  const doneWork = useMemo(
    () =>
      tasks
        .filter((x) => !x.parent_id && x.status === 'in_progress' && x.tick_done)
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
    [tasks],
  )
  const doneTasks = useMemo(
    () =>
      tasks
        .filter((x) => !x.parent_id && x.status === 'done')
        .sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? '')),
    [tasks],
  )
  const subtasksOf = useCallback((taskId: string) => tasks.filter((x) => x.parent_id === taskId), [tasks])

  const addTask = async (e: FormEvent) => {
    e.preventDefault()
    if (!session || !id || !newTitle.trim()) return
    // new tasks auto-assign to their creator
    const { data, error } = await supabase
      .from('tasks')
      .insert({
        project_id: id,
        title: newTitle.trim(),
        created_by: session.user.id,
        assignee_id: session.user.id,
      })
      .select()
      .single()
    if (error) {
      alert(error.message)
      return
    }
    if (data) {
      await logActivity({ projectId: id, taskId: data.id, actorId: session.user.id, action: 'created' })
      if (!isAdmin(profile)) {
        for (const admin of profiles.filter((p) => p.role === 'admin')) {
          await notify({ userId: admin.id, actorId: session.user.id, taskId: data.id, type: 'new_task' })
        }
      }
    }
    setNewTitle('')
    load()
  }

  const assignTask = async (task: Task, assigneeId: string) => {
    const value = assigneeId || null
    const { error } = await supabase.from('tasks').update({ assignee_id: value }).eq('id', task.id)
    if (error) {
      alert(error.message)
      return
    }
    const name = profiles.find((p) => p.id === value)?.full_name
    await logActivity({
      projectId: task.project_id,
      taskId: task.id,
      actorId: session!.user.id,
      action: value ? 'assigned' : 'unassigned',
      detail: name ? { name } : {},
    })
    await notify({ userId: value, actorId: session!.user.id, taskId: task.id, type: 'assigned' })
    load()
  }

  const addSub = async (parentTask: Task, title: string) => {
    // new subtasks auto-assign to their creator
    const { error } = await supabase.from('tasks').insert({
      project_id: id,
      parent_id: parentTask.id,
      title,
      created_by: session!.user.id,
      assignee_id: session!.user.id,
    })
    if (error) alert(error.message)
    load()
  }

  const onDragEnd = async (e: DragEndEvent) => {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const oldIndex = inProgress.findIndex((x) => x.id === active.id)
    const newIndex = inProgress.findIndex((x) => x.id === over.id)
    if (oldIndex < 0 || newIndex < 0) return
    const reordered = arrayMove(inProgress, oldIndex, newIndex)
    const before = reordered[newIndex - 1]?.position
    const after = reordered[newIndex + 1]?.position
    const newPos =
      before !== undefined && after !== undefined
        ? (before + after) / 2
        : before !== undefined
          ? before + 1
          : after !== undefined
            ? after - 1
            : 0
    setTasks((ts) => ts.map((x) => (x.id === active.id ? { ...x, position: newPos } : x)))
    await supabase.from('tasks').update({ position: newPos }).eq('id', active.id)
  }

  const toggleExpand = (taskId: string) =>
    setExpandedIds((s) => {
      const next = new Set(s)
      if (next.has(taskId)) next.delete(taskId)
      else next.add(taskId)
      return next
    })

  const canEditProject = profile?.role === 'admin' || project?.created_by === session?.user.id
  const draggable = project ? canReorderProject(profile, project.created_by) : false

  const saveProjectName = async () => {
    if (!project) return
    const name = nameEdit.trim()
    if (!name || name === project.name) {
      setNameEdit(project.name)
      return
    }
    const { error } = await supabase.from('projects').update({ name }).eq('id', project.id)
    if (error) {
      alert(error.message)
      setNameEdit(project.name)
      return
    }
    load()
  }

  const openTask = tasks.find((x) => x.id === openTaskId) ?? null
  const openParent = openTask?.parent_id ? (tasks.find((x) => x.id === openTask.parent_id) ?? null) : null

  if (!loaded || !project) return <p className="text-slate-400">{t('loading')}</p>

  const renderRow = (task: Task, drag: boolean, dim = false) => (
    <TaskRow
      key={task.id}
      task={task}
      subtasks={subtasksOf(task.id)}
      profiles={profiles}
      draggable={drag}
      dim={dim}
      expanded={expandedIds.has(task.id)}
      onToggleExpand={() => toggleExpand(task.id)}
      onOpen={() => setParams({ task: task.id })}
      onOpenSub={(sub) => setParams({ task: sub.id })}
      onChanged={load}
      onAssign={assignTask}
      onAddSub={addSub}
    />
  )

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link to="/projects" className="text-slate-400 hover:text-slate-300">←</Link>
        <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: project.color }} />
        {canEditProject ? (
          <>
            <input
              value={nameEdit}
              onChange={(e) => setNameEdit(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && saveProjectName()}
              className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent text-xl font-bold hover:border-slate-600 focus:border-indigo-400 focus:bg-slate-800 focus:outline-none"
            />
            {nameEdit.trim() !== project.name && nameEdit.trim() !== '' && (
              <button
                onClick={saveProjectName}
                className="rounded-md bg-indigo-600 px-2.5 py-1 text-xs font-semibold whitespace-nowrap text-white hover:bg-indigo-700"
              >
                ✓ {t('save')}
              </button>
            )}
          </>
        ) : (
          <h1 className="text-xl font-bold">{project.name}</h1>
        )}
        {isAdmin(profile) && (
          <button
            onClick={async () => {
              if (!window.confirm(t('confirmDeleteProject1'))) return
              if (!window.confirm(t('confirmDeleteProject2'))) return
              const { error } = await supabase.from('projects').delete().eq('id', project.id)
              if (error) alert(error.message)
              else window.location.href = '/projects'
            }}
            title={t('deleteProject')}
            className="rounded-md border border-red-900 px-2 py-1 text-xs text-red-400 hover:bg-red-950 hover:text-red-400"
          >
            🗑
          </button>
        )}
      </div>
      {project.description && <p className="text-sm text-slate-400">{project.description}</p>}

      <div className="rounded-xl border border-slate-700 bg-slate-900 p-3 shadow-sm">
        <FilesSection projectId={project.id} taskId={null} canUpload={isAdmin(profile)} />
      </div>

      <form onSubmit={addTask}>
        <input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder={`+ ${t('addTask')}`}
          className="w-full rounded-xl border border-slate-600 bg-slate-900 px-4 py-2.5 text-sm shadow-sm focus:border-indigo-500 focus:outline-none"
        />
      </form>

      {inProgress.length === 0 && doneWork.length === 0 && doneTasks.length === 0 && (
        <p className="rounded-xl border border-dashed border-slate-600 p-8 text-center text-sm text-slate-400">
          {t('noTasks')}
        </p>
      )}

      {inProgress.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-blue-300">
            {t('in_progress')} <span className="text-xs font-normal text-slate-400">({inProgress.length})</span>
          </h2>
          <DndContext sensors={sensors} onDragEnd={onDragEnd}>
            <SortableContext items={inProgress.map((x) => x.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-2">{inProgress.map((task) => renderRow(task, draggable))}</div>
            </SortableContext>
          </DndContext>
        </section>
      )}

      {doneWork.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-amber-300">
            {t('tickWork')} <span className="text-xs font-normal text-slate-400">({doneWork.length})</span>
          </h2>
          <div className="space-y-2">{doneWork.map((task) => renderRow(task, false))}</div>
        </section>
      )}

      {doneTasks.length > 0 && (
        <section>
          <h2 className="mb-2 flex items-center gap-1 text-sm font-semibold text-slate-400">
            <button
              onClick={() => setLogOpen(!logOpen)}
              className="rounded px-1 text-sm text-slate-500 select-none hover:text-slate-300"
            >
              {logOpen ? '▾' : '▸'}
            </button>
            {t('logSection')} <span className="text-xs font-normal text-slate-500">({doneTasks.length})</span>
          </h2>
          {logOpen && (
            <div className="space-y-2">{doneTasks.map((task) => renderRow(task, false, true))}</div>
          )}
        </section>
      )}

      {openTask && (
        <TaskDrawer
          task={openTask}
          parent={openParent}
          subtasks={subtasksOf(openTask.id)}
          onClose={() => setParams({})}
          onChanged={load}
        />
      )}
    </div>
  )
}
