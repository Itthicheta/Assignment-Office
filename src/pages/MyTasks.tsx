import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useI18n } from '../lib/i18n'
import { PriorityBadge, StatusBadge } from '../components/Badges'
import Avatar from '../components/Avatar'
import type { Task } from '../lib/types'

interface TaskWithProject extends Task {
  project: { id: string; name: string; color: string } | null
}

const todayStr = () => new Date().toISOString().slice(0, 10)

export default function MyTasks() {
  const { session, profiles } = useAuth()
  const { t } = useI18n()
  const [mine, setMine] = useState<TaskWithProject[]>([])
  const [reviews, setReviews] = useState<TaskWithProject[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!session) return
    const load = async () => {
      const [a, b] = await Promise.all([
        supabase
          .from('tasks')
          .select('*, project:projects(id, name, color)')
          .eq('assignee_id', session.user.id)
          .not('status', 'in', '("done","cancelled")')
          .order('due_date', { ascending: true, nullsFirst: false }),
        supabase
          .from('tasks')
          .select('*, project:projects(id, name, color)')
          .eq('created_by', session.user.id)
          .eq('status', 'in_review')
          .neq('assignee_id', session.user.id),
      ])
      setMine((a.data as TaskWithProject[]) ?? [])
      setReviews((b.data as TaskWithProject[]) ?? [])
      setLoaded(true)
    }
    load()
  }, [session?.user.id])

  const today = todayStr()
  const groups: { key: string; label: string; items: TaskWithProject[]; cls: string }[] = [
    { key: 'overdue', label: t('overdue'), cls: 'text-red-600', items: mine.filter((x) => x.due_date && x.due_date < today) },
    { key: 'today', label: t('dueToday'), cls: 'text-amber-600', items: mine.filter((x) => x.due_date === today) },
    { key: 'upcoming', label: t('upcoming'), cls: 'text-slate-700', items: mine.filter((x) => x.due_date && x.due_date > today) },
    { key: 'nodate', label: t('noDueDate'), cls: 'text-slate-500', items: mine.filter((x) => !x.due_date) },
  ]

  const row = (task: TaskWithProject) => {
    const overdue = task.due_date && task.due_date < today && task.status !== 'done'
    return (
      <Link
        key={task.id}
        to={`/projects/${task.project_id}?task=${task.id}`}
        className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm hover:border-indigo-300"
      >
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: task.project?.color ?? '#94a3b8' }} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{task.title}</span>
          <span className="block truncate text-xs text-slate-400">{task.project?.name}</span>
        </span>
        <PriorityBadge priority={task.priority} />
        {task.due_date && (
          <span className={`text-xs whitespace-nowrap ${overdue ? 'font-semibold text-red-600' : 'text-slate-500'}`}>
            {task.due_date}
          </span>
        )}
        <StatusBadge status={task.status} />
      </Link>
    )
  }

  if (!loaded) return <p className="text-slate-400">{t('loading')}</p>

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">{t('myTasks')}</h1>

      {reviews.length > 0 && (
        <section>
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-600">
            👀 {t('waitingMyReview')} <span className="text-xs">({reviews.length})</span>
          </h2>
          <div className="space-y-2">
            {reviews.map((task) => {
              const assignee = profiles.find((p) => p.id === task.assignee_id)
              return (
                <Link
                  key={task.id}
                  to={`/projects/${task.project_id}?task=${task.id}`}
                  className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 hover:border-amber-400"
                >
                  {assignee && <Avatar name={assignee.full_name} size={7} />}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{task.title}</span>
                    <span className="block truncate text-xs text-slate-400">{task.project?.name}</span>
                  </span>
                  <StatusBadge status={task.status} />
                </Link>
              )
            })}
          </div>
        </section>
      )}

      {mine.length === 0 && reviews.length === 0 && (
        <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-400">
          {t('allCaughtUp')}
        </p>
      )}

      {groups.map(
        (g) =>
          g.items.length > 0 && (
            <section key={g.key}>
              <h2 className={`mb-2 text-sm font-semibold ${g.cls}`}>
                {g.label} <span className="text-xs font-normal">({g.items.length})</span>
              </h2>
              <div className="space-y-2">{g.items.map(row)}</div>
            </section>
          ),
      )}
    </div>
  )
}
