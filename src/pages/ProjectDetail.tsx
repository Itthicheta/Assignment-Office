import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useI18n } from '../lib/i18n'
import { logActivity } from '../lib/notify'
import { changeTaskStatus } from '../lib/taskActions'
import { statusChoices } from '../lib/can'
import { PriorityBadge, StatusBadge, STATUS_STYLES } from '../components/Badges'
import Avatar from '../components/Avatar'
import TaskDrawer from '../components/TaskDrawer'
import type { Project, Status, Task } from '../lib/types'
import { STATUSES } from '../lib/types'

const todayStr = () => new Date().toISOString().slice(0, 10)

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

  const openTaskId = params.get('task')

  const load = useCallback(async () => {
    if (!id) return
    const [p, tsk] = await Promise.all([
      supabase.from('projects').select('*').eq('id', id).single(),
      supabase.from('tasks').select('*').eq('project_id', id).order('created_at'),
    ])
    setProject(p.data as Project)
    setNameEdit((p.data as Project)?.name ?? '')
    setTasks((tsk.data as Task[]) ?? [])
    setLoaded(true)
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  const topLevel = useMemo(() => tasks.filter((x) => !x.parent_id), [tasks])
  const subtasksOf = useCallback((taskId: string) => tasks.filter((x) => x.parent_id === taskId), [tasks])

  const addTask = async (e: FormEvent) => {
    e.preventDefault()
    if (!session || !id || !newTitle.trim()) return
    const { data } = await supabase
      .from('tasks')
      .insert({ project_id: id, title: newTitle.trim(), created_by: session.user.id })
      .select()
      .single()
    if (data) {
      await logActivity({ projectId: id, taskId: data.id, actorId: session.user.id, action: 'created' })
    }
    setNewTitle('')
    load()
  }

  const openTask = tasks.find((x) => x.id === openTaskId) ?? null
  const today = todayStr()
  const canEditProject = profile?.role === 'admin' || project?.created_by === session?.user.id

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

      <form onSubmit={addTask}>
        <input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder={`+ ${t('addTask')}`}
          className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm shadow-sm focus:border-indigo-500 focus:outline-none"
        />
      </form>

      {topLevel.length === 0 && (
        <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-400">
          {t('noTasks')}
        </p>
      )}

      {STATUSES.map((status: Status) => {
        const items = topLevel.filter((x) => x.status === status)
        if (items.length === 0) return null
        return (
          <section key={status}>
            <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-600">
              <StatusBadge status={status} />
              <span className="text-xs font-normal text-slate-400">({items.length})</span>
            </h2>
            <div className="space-y-2">
              {items.map((task) => {
                const assignee = profiles.find((p) => p.id === task.assignee_id)
                const subs = subtasksOf(task.id)
                const subsDone = subs.filter((s) => s.status === 'done').length
                const overdue = task.due_date && task.due_date < today && !['done', 'cancelled'].includes(task.status)
                const choices = statusChoices(profile, task)
                return (
                  <div
                    key={task.id}
                    onClick={() => setParams({ task: task.id })}
                    className="flex w-full cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-left shadow-sm hover:border-indigo-300"
                  >
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate text-sm font-medium ${task.status === 'cancelled' ? 'text-slate-400 line-through' : ''}`}>
                        {task.title}
                      </span>
                      {subs.length > 0 && (
                        <span className="text-xs text-slate-400">☑ {subsDone}/{subs.length}</span>
                      )}
                    </span>
                    <PriorityBadge priority={task.priority} />
                    {task.due_date && (
                      <span className={`hidden text-xs whitespace-nowrap sm:inline ${overdue ? 'font-semibold text-red-600' : 'text-slate-500'}`}>
                        {task.due_date}
                      </span>
                    )}
                    {choices.length > 0 ? (
                      <select
                        value={task.status}
                        onClick={(e) => e.stopPropagation()}
                        onChange={async (e) => {
                          const err = await changeTaskStatus(task, e.target.value as Status, session!.user.id)
                          if (err) alert(err)
                          load()
                        }}
                        className={`cursor-pointer appearance-none rounded-full border-none px-2 py-0.5 text-xs font-medium focus:outline-none ${STATUS_STYLES[task.status]}`}
                      >
                        {choices.map((s) => (
                          <option key={s} value={s}>{t(s)}</option>
                        ))}
                      </select>
                    ) : (
                      <StatusBadge status={task.status} />
                    )}
                    {assignee ? (
                      <Avatar name={assignee.full_name} size={7} />
                    ) : (
                      <span className="hidden text-xs whitespace-nowrap text-slate-300 sm:inline">{t('unassigned')}</span>
                    )}
                  </div>
                )
              })}
            </div>
          </section>
        )
      })}

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
