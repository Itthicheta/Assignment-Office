import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useI18n } from '../lib/i18n'
import { isAdmin } from '../lib/can'
import type { Project } from '../lib/types'

const PALETTE = ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#0ea5e9', '#a855f7', '#ec4899', '#14b8a6']

interface Counts {
  total: number
  done: number
}

export default function Projects() {
  const { session, profile } = useAuth()
  const { t } = useI18n()
  const [projects, setProjects] = useState<Project[]>([])
  const [counts, setCounts] = useState<Record<string, Counts>>({})
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [loaded, setLoaded] = useState(false)

  const load = async () => {
    const [p, tsk] = await Promise.all([
      supabase.from('projects').select('*').eq('archived', false).order('created_at'),
      supabase.from('tasks').select('id, project_id, status, parent_id').is('parent_id', null),
    ])
    setProjects((p.data as Project[]) ?? [])
    const c: Record<string, Counts> = {}
    for (const row of tsk.data ?? []) {
      c[row.project_id] ??= { total: 0, done: 0 }
      c[row.project_id].total++
      if (row.status === 'done') c[row.project_id].done++
    }
    setCounts(c)
    setLoaded(true)
  }

  useEffect(() => {
    load()
  }, [])

  const createProject = async (e: FormEvent) => {
    e.preventDefault()
    if (!session || !name.trim()) return
    const color = PALETTE[projects.length % PALETTE.length]
    await supabase.from('projects').insert({
      name: name.trim(),
      description: description.trim(),
      color,
      created_by: session.user.id,
    })
    setName('')
    setDescription('')
    setShowForm(false)
    load()
  }

  if (!loaded) return <p className="text-slate-400">{t('loading')}</p>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">{t('projects')}</h1>
        {isAdmin(profile) && (
          <button
            onClick={() => setShowForm(!showForm)}
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            + {t('newProject')}
          </button>
        )}
      </div>

      {showForm && (
        <form onSubmit={createProject} className="space-y-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <input
            autoFocus
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('projectName')}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t('projectDescription')}
            rows={2}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          />
          <div className="flex gap-2">
            <button className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700">
              {t('create')}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-lg px-4 py-1.5 text-sm text-slate-500 hover:bg-slate-100"
            >
              {t('cancel')}
            </button>
          </div>
        </form>
      )}

      {projects.length === 0 && !showForm && (
        <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-400">
          {t('noProjects')}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {projects.map((p) => {
          const c = counts[p.id] ?? { total: 0, done: 0 }
          const pct = c.total === 0 ? 0 : Math.round((c.done / c.total) * 100)
          return (
            <Link
              key={p.id}
              to={`/projects/${p.id}`}
              className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-indigo-300"
            >
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full" style={{ background: p.color }} />
                <span className="truncate font-semibold">{p.name}</span>
              </div>
              {p.description && <p className="mt-1 line-clamp-2 text-xs text-slate-500">{p.description}</p>}
              <div className="mt-3">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, background: p.color }} />
                </div>
                <p className="mt-1 text-xs text-slate-400">
                  {c.done}/{c.total} {t('tasksDone')} · {pct}%
                </p>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
