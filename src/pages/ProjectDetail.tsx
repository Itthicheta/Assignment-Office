import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { DndContext, PointerSensor, TouchSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useI18n } from '../lib/i18n'
import { logActivity, notify } from '../lib/notify'
import { canEditFields, canReorderProject, isAdmin } from '../lib/can'
import { PriorityBadge } from '../components/Badges'
import Avatar from '../components/Avatar'
import TaskTicks from '../components/TaskTicks'
import TaskDrawer from '../components/TaskDrawer'
import FilesSection from '../components/FilesSection'
import type { Profile, Project, Task } from '../lib/types'

const todayStr = () => new Date().toISOString().slice(0, 10)

function TaskRow({
  task,
  profiles,
  draggable,
  onOpen,
  onChanged,
  onAssign,
}: {
  task: Task
  profiles: Profile[]
  draggable: boolean
  onOpen: () => void
  onChanged: () => void
  onAssign: (assigneeId: string) => void
}) {
  const { t } = useI18n()
  const { profile } = useAuth()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    disabled: !draggable,
  })
  const editor = canEditFields(profile, task)
  const overdue = task.due_date && task.due_date < todayStr() && task.status !== 'done'
  const waitingCheck = task.tick_done && !task.tick_checked && task.status !== 'done'

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      onClick={onOpen}
      className={`flex w-full cursor-pointer items-center gap-2 rounded-xl border bg-white px-3 py-3 text-left shadow-sm hover:border-indigo-300 ${
        isDragging ? 'z-10 opacity-70' : ''
      } ${waitingCheck ? 'border-amber-300 bg-amber-50' : 'border-slate-200'}`}
    >
      {draggable && (
        <span
          {...attributes}
          {...listeners}
          onClick={(e) => e.stopPropagation()}
          className="cursor-grab touch-none px-1 text-slate-300 select-none active:cursor-grabbing"
        >
          ⠿
        </span>
      )}
      <TaskTicks task={task} onChanged={onChanged} />
      <span className="min-w-0 flex-1">
        <span className={`block truncate text-sm font-medium ${task.status === 'done' ? 'text-slate-400 line-through' : ''}`}>
          {task.title}
        </span>
      </span>
      <PriorityBadge priority={task.priority} />
      {task.due_date && (
        <span className={`hidden text-xs whitespace-nowrap sm:inline ${overdue ? 'font-semibold text-red-600' : 'text-slate-500'}`}>
          {task.due_date}
        </span>
      )}
      {editor ? (
        <select
          value={task.assignee_id ?? ''}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => onAssign(e.target.value)}
          className="max-w-28 rounded-lg border border-slate-200 bg-white px-1.5 py-1 text-xs text-slate-600 focus:border-indigo-400 focus:outline-none"
        >
          <option value="">{t('unassigned')}</option>
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>{p.full_name}</option>
          ))}
        </select>
      ) : task.assignee_id ? (
        <Avatar name={profiles.find((p) => p.id === task.assignee_id)?.full_name ?? '?'} size={7} />
      ) : null}
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

  const inProgress = useMemo(
    () => tasks.filter((x) => !x.parent_id && x.status === 'in_progress').sort((a, b) => a.position - b.position),
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
    const { data, error } = await supabase
      .from('tasks')
      .insert({ project_id: id, title: newTitle.trim(), created_by: session.user.id })
      .select()
      .single()
    if (error) {
      alert(error.message)
      return
    }
    if (data) {
      await logActivity({ projectId: id, taskId: data.id, actorId: session.user.id, action: 'created' })
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

  if (!loaded || !project) return <p className="text-slate-400">{t('loading')}</p>

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link to="/projects" className="text-slate-400 hover:text-slate-600">←</Link>
        <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: project.color }} />
        {canEditProject ? (
          <input
            value={nameEdit}
            onChange={(e) => setNameEdit(e.target.value)}
            onBlur={saveProjectName}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent text-xl font-bold hover:border-slate-200 focus:border-indigo-400 focus:bg-white focus:outline-none"
          />
        ) : (
          <h1 className="text-xl font-bold">{project.name}</h1>
        )}
      </div>
      {project.description && <p className="text-sm text-slate-500">{project.description}</p>}

      <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <FilesSection projectId={project.id} taskId={null} />
      </div>

      {isAdmin(profile) && (
        <form onSubmit={addTask}>
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder={`+ ${t('addTask')}`}
            className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm shadow-sm focus:border-indigo-500 focus:outline-none"
          />
        </form>
      )}

      {inProgress.length === 0 && doneTasks.length === 0 && (
        <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-400">
          {t('noTasks')}
        </p>
      )}

      {inProgress.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-blue-700">
            {t('in_progress')} <span className="text-xs font-normal text-slate-400">({inProgress.length})</span>
          </h2>
          <DndContext sensors={sensors} onDragEnd={onDragEnd}>
            <SortableContext items={inProgress.map((x) => x.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-2">
                {inProgress.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    profiles={profiles}
                    draggable={draggable}
                    onOpen={() => setParams({ task: task.id })}
                    onChanged={load}
                    onAssign={(a) => assignTask(task, a)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </section>
      )}

      {doneTasks.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-emerald-700">
            {t('done')} <span className="text-xs font-normal text-slate-400">({doneTasks.length})</span>
          </h2>
          <div className="space-y-2">
            {doneTasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                profiles={profiles}
                draggable={false}
                onOpen={() => setParams({ task: task.id })}
                onChanged={load}
                onAssign={(a) => assignTask(task, a)}
              />
            ))}
          </div>
        </section>
      )}

      {openTask && (
        <TaskDrawer
          task={openTask}
          subtasks={subtasksOf(openTask.id)}
          onClose={() => setParams({})}
          onChanged={load}
        />
      )}
    </div>
  )
}
