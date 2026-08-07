import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useI18n } from '../lib/i18n'
import { isAdmin } from '../lib/can'
import { dueDatesInRange, toDateStr } from '../lib/routineDates'
import PersonFilter, { personMatches } from '../components/PersonFilter'
import type { Project, Routine, Task } from '../lib/types'

interface TaskWithParent extends Task {
  parentTitle?: string
}

interface DayItem {
  kind: 'task' | 'routine'
  id: string
  label: string
  person: string
  color: string | null
  projectId?: string
  done: boolean
}

export default function CalendarPage() {
  const { session, profile, profiles } = useAuth()
  const { t, lang } = useI18n()
  const navigate = useNavigate()
  const [month, setMonth] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })
  const [tasks, setTasks] = useState<TaskWithParent[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [routines, setRoutines] = useState<Routine[]>([])
  const [showMain, setShowMain] = useState(true)
  const [showSubs, setShowSubs] = useState(true)
  const [showRoutines, setShowRoutines] = useState(true)
  const [selectedDay, setSelectedDay] = useState<string>(toDateStr(new Date()))
  const [personFilter, setPersonFilter] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('calendar_person_filter') ?? '[]')
    } catch {
      return []
    }
  })
  const admin = isAdmin(profile)
  const monthStart = month
  const monthEnd = new Date(month.getFullYear(), month.getMonth() + 1, 0)

  useEffect(() => {
    const load = async () => {
      // members see only their own items; admin sees everything
      let taskQuery = supabase
        .from('tasks')
        .select('*')
        .gte('due_date', toDateStr(monthStart))
        .lte('due_date', toDateStr(monthEnd))
      if (!admin && session) taskQuery = taskQuery.eq('assignee_id', session.user.id)
      const [tsk, prj, rtn] = await Promise.all([
        taskQuery,
        supabase.from('projects').select('*'),
        supabase.from('routines').select('*').eq('active', true).eq('approved', true),
      ])
      const taskRows = ((tsk.data as TaskWithParent[]) ?? [])
      const parentIds = [...new Set(taskRows.map((x) => x.parent_id).filter(Boolean))] as string[]
      if (parentIds.length) {
        const { data: parents } = await supabase.from('tasks').select('id, title').in('id', parentIds)
        const titleOf: Record<string, string> = {}
        for (const row of parents ?? []) titleOf[row.id] = row.title
        for (const row of taskRows) {
          if (row.parent_id) row.parentTitle = titleOf[row.parent_id]
        }
      }
      setTasks(taskRows)
      setProjects((prj.data as Project[]) ?? [])
      setRoutines((rtn.data as Routine[]) ?? [])
    }
    load()
  }, [month.getTime(), admin, session?.user.id])

  const nameOf = (uid: string | null) => profiles.find((p) => p.id === uid)?.full_name ?? ''

  const itemsByDay = useMemo(() => {
    const map: Record<string, DayItem[]> = {}
    const push = (day: string, item: DayItem) => {
      map[day] ??= []
      map[day].push(item)
    }
    if (showMain || showSubs) {
      for (const task of tasks) {
        if (!task.due_date) continue
        if (task.parent_id ? !showSubs : !showMain) continue
        if (admin && !personMatches(personFilter, task.assignee_id)) continue
        const project = projects.find((p) => p.id === task.project_id)
        push(task.due_date, {
          kind: 'task',
          id: task.id,
          label: task.parentTitle ? `${task.parentTitle} – ${task.title}` : task.title,
          person: nameOf(task.assignee_id),
          color: project?.color ?? '#94a3b8',
          projectId: task.project_id,
          done: task.status === 'done',
        })
      }
    }
    if (showRoutines) {
      for (const routine of routines) {
        if (admin && !personMatches(personFilter, routine.assignee_id)) continue
        for (const day of dueDatesInRange(routine, monthStart, monthEnd)) {
          push(day, {
            kind: 'routine',
            id: routine.id,
            label: routine.title,
            person: nameOf(routine.assignee_id),
            color: null,
            done: false,
          })
        }
      }
    }
    return map
  }, [tasks, routines, projects, profiles, showMain, showSubs, showRoutines, monthStart.getTime(), admin, personFilter])

  // Build the calendar grid (weeks start on Sunday)
  const weeks = useMemo(() => {
    const cells: (Date | null)[] = []
    for (let i = 0; i < monthStart.getDay(); i++) cells.push(null)
    for (let d = 1; d <= monthEnd.getDate(); d++) {
      cells.push(new Date(month.getFullYear(), month.getMonth(), d))
    }
    while (cells.length % 7 !== 0) cells.push(null)
    const out: (Date | null)[][] = []
    for (let i = 0; i < cells.length; i += 7) out.push(cells.slice(i, i + 7))
    return out
  }, [month.getTime()])

  const locale = lang === 'th' ? 'th-TH' : 'en-US'
  const monthLabel = month.toLocaleDateString(locale, { month: 'long', year: 'numeric' })
  const todayKey = toDateStr(new Date())
  const usedProjects = projects.filter((p) => tasks.some((task) => task.project_id === p.id))

  const openItem = (item: DayItem) => {
    if (item.kind === 'task') navigate(`/projects/${item.projectId}?task=${item.id}`)
    else navigate('/routines')
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold">{t('calendar')}</h1>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} className="rounded-md border border-slate-700 px-2 py-1 text-sm hover:bg-slate-800">←</button>
          <span className="min-w-36 text-center text-sm font-semibold">{monthLabel}</span>
          <button onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} className="rounded-md border border-slate-700 px-2 py-1 text-sm hover:bg-slate-800">→</button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 text-sm">
        <label className="flex cursor-pointer items-center gap-1.5">
          <input type="checkbox" checked={showMain} onChange={() => setShowMain(!showMain)} className="h-4 w-4 accent-indigo-600" />
          {t('mainTasks')}
        </label>
        <label className="flex cursor-pointer items-center gap-1.5">
          <input type="checkbox" checked={showSubs} onChange={() => setShowSubs(!showSubs)} className="h-4 w-4 accent-indigo-600" />
          {t('subtasks')}
        </label>
        <label className="flex cursor-pointer items-center gap-1.5">
          <input type="checkbox" checked={showRoutines} onChange={() => setShowRoutines(!showRoutines)} className="h-4 w-4 accent-slate-500" />
          🔁 {t('showRoutines')}
        </label>
        {admin && (
          <PersonFilter
            filter={personFilter}
            onChange={(v) => {
              setPersonFilter(v)
              localStorage.setItem('calendar_person_filter', JSON.stringify(v))
            }}
          />
        )}
        <div className="ml-auto flex flex-wrap items-center gap-3">
          {usedProjects.map((p) => (
            <span key={p.id} className="flex items-center gap-1 text-xs text-slate-400">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: p.color }} />
              {p.name}
            </span>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-700 bg-slate-900 shadow-sm">
        <div className="grid grid-cols-7 border-b border-slate-800 text-center text-xs font-semibold text-slate-400">
          {[0, 1, 2, 3, 4, 5, 6].map((d) => (
            <div key={d} className="py-2">
              {new Date(2023, 0, 1 + d).toLocaleDateString(locale, { weekday: 'short' })}
            </div>
          ))}
        </div>
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 border-b border-slate-800 last:border-b-0">
            {week.map((day, di) => {
              const key = day ? toDateStr(day) : `${wi}-${di}`
              const items = day ? (itemsByDay[toDateStr(day)] ?? []) : []
              const isToday = day && toDateStr(day) === todayKey
              const isSelected = day && toDateStr(day) === selectedDay
              return (
                <div
                  key={key}
                  onClick={() => day && setSelectedDay(toDateStr(day))}
                  className={`min-h-16 cursor-pointer border-r border-slate-800 p-1 align-top last:border-r-0 sm:min-h-24 ${
                    isSelected ? 'bg-indigo-950/40' : ''
                  }`}
                >
                  {day && (
                    <>
                      <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-xs ${isToday ? 'bg-indigo-600 font-bold text-white' : 'text-slate-400'}`}>
                        {day.getDate()}
                      </span>
                      {/* dots on mobile */}
                      <div className="mt-0.5 flex flex-wrap gap-0.5 sm:hidden">
                        {items.slice(0, 6).map((item, i) => (
                          <span
                            key={i}
                            className={`h-1.5 w-1.5 rounded-full ${item.kind === 'routine' ? 'bg-slate-400' : ''}`}
                            style={item.color ? { background: item.color } : undefined}
                          />
                        ))}
                      </div>
                      {/* labels on desktop */}
                      <div className="mt-0.5 hidden space-y-0.5 sm:block">
                        {items.slice(0, 3).map((item, i) => (
                          <button
                            key={i}
                            onClick={(e) => {
                              e.stopPropagation()
                              openItem(item)
                            }}
                            className={`block w-full truncate rounded px-1 text-left text-[10px] leading-4 hover:bg-slate-800 ${
                              item.kind === 'routine' ? 'text-slate-400 italic' : ''
                            } ${item.done ? 'line-through opacity-50' : ''}`}
                          >
                            {item.kind === 'routine' ? '🔁 ' : (
                              <span className="mr-0.5 inline-block h-1.5 w-1.5 rounded-full align-middle" style={{ background: item.color ?? '#94a3b8' }} />
                            )}
                            {item.label}{item.person ? ` — ${item.person}` : ''}
                          </button>
                        ))}
                        {items.length > 3 && (
                          <span className="block px-1 text-[10px] text-slate-400">+{items.length - 3}</span>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </div>

      {/* selected-day detail (essential on mobile) */}
      <div className="rounded-xl border border-slate-700 bg-slate-900 p-3 shadow-sm">
        <h2 className="mb-2 text-sm font-semibold text-slate-300">
          {new Date(selectedDay + 'T00:00:00').toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' })}
          {selectedDay === todayKey && <span className="ml-2 rounded-full bg-indigo-900 px-2 py-0.5 text-xs text-indigo-300">{t('today')}</span>}
        </h2>
        <div className="space-y-1">
          {(itemsByDay[selectedDay] ?? []).map((item, i) => (
            <button
              key={i}
              onClick={() => openItem(item)}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-slate-800"
            >
              {item.kind === 'routine' ? (
                <span>🔁</span>
              ) : (
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: item.color ?? '#94a3b8' }} />
              )}
              <span className={`min-w-0 flex-1 truncate ${item.done ? 'text-slate-400 line-through' : ''}`}>{item.label}</span>
              <span className="text-xs whitespace-nowrap text-slate-400">{item.person}</span>
            </button>
          ))}
          {(itemsByDay[selectedDay] ?? []).length === 0 && (
            <p className="px-2 py-1 text-sm text-slate-600">—</p>
          )}
        </div>
      </div>
    </div>
  )
}
