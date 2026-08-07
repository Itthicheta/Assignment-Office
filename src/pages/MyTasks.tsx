import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { DndContext, PointerSensor, TouchSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useI18n } from '../lib/i18n'
import { PriorityBadge } from '../components/Badges'
import { fmtDue, isDueToday, isOverdue, todayStr } from '../lib/due'
import { setApproved } from '../lib/taskActions'
import { notify } from '../lib/notify'
import Avatar from '../components/Avatar'
import type { Routine, Task } from '../lib/types'

interface TaskWithProject extends Task {
  project: { id: string; name: string; color: string; created_at: string } | null
  parent: { title: string } | null
}

const FILTER_KEY = 'mytasks_project_filter'

interface TypeFilterValue {
  main: boolean
  subs: boolean
}

function loadTypeFilter(key: string): TypeFilterValue {
  try {
    return JSON.parse(localStorage.getItem(key) ?? '') || { main: true, subs: true }
  } catch {
    return { main: true, subs: true }
  }
}

// Small Tasks/Subtasks dropdown used by the check and overdue sections
function TypeFilter({
  value,
  onChange,
  labels,
}: {
  value: TypeFilterValue
  onChange: (v: TypeFilterValue) => void
  labels: { main: string; subs: string }
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-xs font-medium text-slate-400 hover:bg-slate-800"
      >
        {value.main && value.subs ? `${labels.main} + ${labels.subs}` : value.main ? labels.main : labels.subs} ▾
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-40 rounded-xl border border-slate-700 bg-slate-900 p-2 shadow-lg">
          <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-800">
            <input
              type="checkbox"
              checked={value.main}
              onChange={() => onChange({ ...value, main: !value.main })}
              className="h-4 w-4 accent-indigo-600"
            />
            {labels.main}
          </label>
          <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-800">
            <input
              type="checkbox"
              checked={value.subs}
              onChange={() => onChange({ ...value, subs: !value.subs })}
              className="h-4 w-4 accent-indigo-600"
            />
            {labels.subs}
          </label>
        </div>
      )}
    </div>
  )
}

function SortableRow({ task, myPos }: { task: TaskWithProject; myPos: number }) {
  const navigate = useNavigate()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id })
  const overdue = isOverdue(task)
  const waitingCheck = task.tick_done && !task.tick_checked

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      onClick={() => navigate(`/projects/${task.project_id}?task=${task.id}`)}
      className={`flex cursor-pointer items-center gap-2 rounded-xl border bg-slate-900 px-3 py-3 shadow-sm hover:border-indigo-700 ${
        isDragging ? 'z-10 opacity-70' : ''
      } ${waitingCheck ? 'border-amber-300 bg-amber-950/40' : 'border-slate-700'}`}
      data-pos={myPos}
    >
      <span
        {...attributes}
        {...listeners}
        onClick={(e) => e.stopPropagation()}
        className="cursor-grab touch-none px-1 text-slate-600 select-none active:cursor-grabbing"
      >
        ⠿
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">
          {task.parent ? (
            <>
              <span className="text-slate-400">{task.parent.title} – </span>
              {task.title}
            </>
          ) : (
            task.title
          )}
        </span>
      </span>
      <PriorityBadge priority={task.priority} />
      {task.due_date && (
        <span className={`text-xs whitespace-nowrap ${overdue ? 'font-semibold text-red-400' : 'text-slate-400'}`}>
          {fmtDue(task)}
        </span>
      )}
    </div>
  )
}

export default function MyTasks() {
  const { session, profile, profiles } = useAuth()
  const { t } = useI18n()
  const [mine, setMine] = useState<TaskWithProject[]>([])
  const [reviews, setReviews] = useState<TaskWithProject[]>([])
  const [chase, setChase] = useState<TaskWithProject[]>([])
  const [pendingTasks, setPendingTasks] = useState<TaskWithProject[]>([])
  const [pendingRoutines, setPendingRoutines] = useState<Routine[]>([])
  const [order, setOrder] = useState<Record<string, number>>({})
  const [filter, setFilter] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(FILTER_KEY) ?? '[]')
    } catch {
      return []
    }
  })
  const [filterOpen, setFilterOpen] = useState(false)
  const [typeFilter, setTypeFilter] = useState<TypeFilterValue>(() => loadTypeFilter('reviews_type_filter'))
  const [overdueFilter, setOverdueFilter] = useState<TypeFilterValue>(() => loadTypeFilter('overdue_type_filter'))
  const [loaded, setLoaded] = useState(false)
  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem('mytasks_collapsed') ?? '[]'))
    } catch {
      return new Set<string>()
    }
  })
  const filterRef = useRef<HTMLDivElement>(null)

  const toggleSection = (key: string) =>
    setCollapsed((s) => {
      const next = new Set(s)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      localStorage.setItem('mytasks_collapsed', JSON.stringify([...next]))
      return next
    })

  const chevron = (key: string) => (
    <button
      onClick={() => toggleSection(key)}
      className="rounded px-1 text-sm text-slate-500 select-none hover:text-slate-300"
    >
      {collapsed.has(key) ? '▸' : '▾'}
    </button>
  )

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
  )

  const load = async () => {
    if (!session) return
    const [a, o] = await Promise.all([
      supabase
        .from('tasks')
        .select('*, project:projects(id, name, color, created_at)')
        .eq('assignee_id', session.user.id)
        .eq('status', 'in_progress'),
      supabase.from('my_task_order').select('*').eq('user_id', session.user.id),
    ])
    // Self-referencing joins are ambiguous in PostgREST — fetch parent titles separately.
    const mineRows = ((a.data as TaskWithProject[]) ?? []).map((x) => ({ ...x, parent: null as { title: string } | null }))
    const parentIds = [...new Set(mineRows.map((x) => x.parent_id).filter(Boolean))] as string[]
    if (parentIds.length) {
      const { data: parents } = await supabase.from('tasks').select('id, title').in('id', parentIds)
      const titleOf: Record<string, string> = {}
      for (const row of parents ?? []) titleOf[row.id] = row.title
      for (const row of mineRows) {
        if (row.parent_id && titleOf[row.parent_id]) row.parent = { title: titleOf[row.parent_id] }
      }
    }
    setMine(mineRows)

    // "Waiting for my check": admin checks every task and subtask; members
    // check the subtasks under tasks assigned to them.
    let reviewRows: TaskWithProject[] = []
    if (profile?.role === 'admin') {
      const { data } = await supabase
        .from('tasks')
        .select('*, project:projects(id, name, color, created_at)')
        .eq('status', 'in_progress')
        .eq('tick_done', true)
        .eq('tick_checked', false)
      reviewRows = ((data as TaskWithProject[]) ?? []).map((x) => ({ ...x, parent: null as { title: string } | null }))
    } else {
      const myTop = mineRows.filter((x) => !x.parent_id)
      if (myTop.length) {
        const { data } = await supabase
          .from('tasks')
          .select('*, project:projects(id, name, color, created_at)')
          .in('parent_id', myTop.map((x) => x.id))
          .eq('status', 'in_progress')
          .eq('tick_done', true)
          .eq('tick_checked', false)
        const titles = Object.fromEntries(myTop.map((x) => [x.id, x.title]))
        reviewRows = ((data as TaskWithProject[]) ?? []).map((x) => ({
          ...x,
          parent: x.parent_id && titles[x.parent_id] ? { title: titles[x.parent_id] } : null,
        }))
      }
    }
    // Admin approval inbox: member-created tasks and routines not yet approved
    if (profile?.role === 'admin') {
      const [pt, pr] = await Promise.all([
        supabase
          .from('tasks')
          .select('*, project:projects(id, name, color, created_at)')
          .eq('approved', false)
          .is('parent_id', null),
        supabase.from('routines').select('*').eq('approved', false),
      ])
      setPendingTasks((((pt.data as TaskWithProject[]) ?? []).map((x) => ({ ...x, parent: null }))))
      setPendingRoutines((pr.data as Routine[]) ?? [])
    }

    // Admin chase list: every in-progress task/subtask due today or past due
    let chaseRows: TaskWithProject[] = []
    if (profile?.role === 'admin') {
      const { data } = await supabase
        .from('tasks')
        .select('*, project:projects(id, name, color, created_at)')
        .eq('status', 'in_progress')
        .not('due_date', 'is', null)
        .lte('due_date', todayStr())
      chaseRows = ((data as TaskWithProject[]) ?? [])
        .filter((x) => isOverdue(x) || isDueToday(x))
        .map((x) => ({ ...x, parent: null as { title: string } | null }))
    }

    // Attach parent titles to subtasks in the review/chase lists
    const needParents = [...reviewRows, ...chaseRows].filter((x) => x.parent_id && !x.parent)
    const missingIds = [...new Set(needParents.map((x) => x.parent_id))] as string[]
    if (missingIds.length) {
      const { data: parents } = await supabase.from('tasks').select('id, title').in('id', missingIds)
      const titleOf: Record<string, string> = {}
      for (const row of parents ?? []) titleOf[row.id] = row.title
      for (const row of needParents) {
        if (row.parent_id && titleOf[row.parent_id]) row.parent = { title: titleOf[row.parent_id] }
      }
    }

    setReviews(reviewRows)
    setChase(chaseRows)
    const ord: Record<string, number> = {}
    for (const row of o.data ?? []) ord[row.task_id] = row.position
    setOrder(ord)
    setLoaded(true)
  }

  useEffect(() => {
    load()
  }, [session?.user.id, profile?.role])

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) setFilterOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const myProjects = useMemo(() => {
    const map = new Map<string, { id: string; name: string; color: string; created_at: string }>()
    for (const task of [...mine, ...reviews, ...chase]) if (task.project) map.set(task.project.id, task.project)
    return [...map.values()].sort((x, y) => x.created_at.localeCompare(y.created_at))
  }, [mine, reviews, chase])

  const activeFilter = filter.length ? filter : myProjects.map((p) => p.id)

  const toggleFilter = (pid: string) => {
    const base = filter.length ? filter : myProjects.map((p) => p.id)
    const next = base.includes(pid) ? base.filter((x) => x !== pid) : [...base, pid]
    const val = next.length === myProjects.length ? [] : next
    setFilter(val)
    localStorage.setItem(FILTER_KEY, JSON.stringify(val))
  }

  const sortKey = (task: TaskWithProject) => order[task.id] ?? task.position

  const onDragEnd = (groupTasks: TaskWithProject[]) => async (e: DragEndEvent) => {
    const { active, over } = e
    if (!over || active.id === over.id || !session) return
    const sorted = [...groupTasks].sort((x, y) => sortKey(x) - sortKey(y))
    const oldIndex = sorted.findIndex((x) => x.id === active.id)
    const newIndex = sorted.findIndex((x) => x.id === over.id)
    if (oldIndex < 0 || newIndex < 0) return
    const reordered = arrayMove(sorted, oldIndex, newIndex)
    const before = reordered[newIndex - 1] ? sortKey(reordered[newIndex - 1]) : undefined
    const after = reordered[newIndex + 1] ? sortKey(reordered[newIndex + 1]) : undefined
    const newPos =
      before !== undefined && after !== undefined
        ? (before + after) / 2
        : before !== undefined
          ? before + 1
          : after !== undefined
            ? after - 1
            : 0
    setOrder((o) => ({ ...o, [active.id as string]: newPos }))
    await supabase.from('my_task_order').upsert({ user_id: session.user.id, task_id: active.id, position: newPos })
  }

  if (!loaded) return <p className="text-slate-400">{t('loading')}</p>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">{t('myTasks')}</h1>
        {myProjects.length > 0 && (
          <div className="relative" ref={filterRef}>
            <button
              onClick={() => setFilterOpen(!filterOpen)}
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800"
            >
              {filter.length === 0 ? t('allProjects') : `${activeFilter.length}/${myProjects.length}`} ▾
            </button>
            {filterOpen && (
              <div className="absolute right-0 z-20 mt-1 w-56 rounded-xl border border-slate-700 bg-slate-900 p-2 shadow-lg">
                {myProjects.map((p) => (
                  <label key={p.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-800">
                    <input
                      type="checkbox"
                      checked={activeFilter.includes(p.id)}
                      onChange={() => toggleFilter(p.id)}
                      className="h-4 w-4 accent-indigo-600"
                    />
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: p.color }} />
                    <span className="truncate">{p.name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {profile?.role === 'admin' && (pendingTasks.length > 0 || pendingRoutines.length > 0) && (
        <section>
          <h2 className="mb-2 flex items-center gap-1 text-sm font-semibold text-indigo-400">
            {chevron('approval')}
            🔏 {t('waitingMyApproval')}{' '}
            <span className="text-xs font-normal">({pendingTasks.length + pendingRoutines.length})</span>
          </h2>
          {!collapsed.has('approval') && (
          <div className="space-y-2">
            {pendingTasks.map((task) => {
              const creator = profiles.find((p) => p.id === task.created_by)
              return (
                <div
                  key={task.id}
                  className="flex items-center gap-3 rounded-xl border border-indigo-800 bg-indigo-950/30 px-4 py-3"
                >
                  {creator && (
                    <span className="flex min-w-0 items-center gap-1.5">
                      <Avatar name={creator.full_name} size={7} />
                      <span className="hidden max-w-24 truncate text-xs text-slate-400 sm:inline">{creator.full_name}</span>
                    </span>
                  )}
                  <Link to={`/projects/${task.project_id}?task=${task.id}`} className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium hover:text-indigo-300">{task.title}</span>
                    <span className="block truncate text-xs text-slate-400">{task.project?.name}</span>
                  </Link>
                  <button
                    onClick={async () => {
                      const err = await setApproved(task, true, session!.user.id)
                      if (err) alert(err)
                      load()
                    }}
                    className="rounded-md bg-indigo-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-indigo-700"
                  >
                    ✓ {t('approve')}
                  </button>
                </div>
              )
            })}
            {pendingRoutines.map((r) => {
              const creator = profiles.find((p) => p.id === r.created_by)
              return (
                <div
                  key={r.id}
                  className="flex items-center gap-3 rounded-xl border border-indigo-800 bg-indigo-950/30 px-4 py-3"
                >
                  {creator && (
                    <span className="flex min-w-0 items-center gap-1.5">
                      <Avatar name={creator.full_name} size={7} />
                      <span className="hidden max-w-24 truncate text-xs text-slate-400 sm:inline">{creator.full_name}</span>
                    </span>
                  )}
                  <Link to="/routines" className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium hover:text-indigo-300">🔁 {r.title}</span>
                    <span className="block truncate text-xs text-slate-400">{t('routines')}</span>
                  </Link>
                  <button
                    onClick={async () => {
                      await supabase.from('routines').update({ approved: true }).eq('id', r.id)
                      await notify({ userId: r.created_by, actorId: session!.user.id, type: 'routine_approved' })
                      load()
                    }}
                    className="rounded-md bg-indigo-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-indigo-700"
                  >
                    ✓ {t('approve')}
                  </button>
                </div>
              )
            })}
          </div>
          )}
        </section>
      )}

      {(() => {
        const isAdm = profile?.role === 'admin'
        const items = (isAdm ? chase : mine.filter((x) => isOverdue(x)))
          .filter((x) => activeFilter.includes(x.project_id))
          .filter((x) => (x.parent_id ? overdueFilter.subs : overdueFilter.main))
          .sort((a, b) =>
            `${a.due_date}${a.due_time ?? ''}`.localeCompare(`${b.due_date}${b.due_time ?? ''}`),
          )
        if (!items.length) return null
        return (
          <section>
            <div className="mb-2 flex items-center gap-2">
              <h2 className="flex items-center gap-1 text-sm font-semibold text-red-500">
                {chevron('chase')}
                ⏰ {isAdm ? t('chaseSection') : t('overdueSection')}{' '}
                <span className="text-xs font-normal">({items.length})</span>
              </h2>
              <div className="ml-auto">
                <TypeFilter
                  value={overdueFilter}
                  onChange={(v) => {
                    setOverdueFilter(v)
                    localStorage.setItem('overdue_type_filter', JSON.stringify(v))
                  }}
                  labels={{ main: t('mainTasks'), subs: t('subtasks') }}
                />
              </div>
            </div>
            {!collapsed.has('chase') && (
            <div className="space-y-2">
              {items.map((task) => {
                const assignee = profiles.find((p) => p.id === task.assignee_id)
                return (
                  <Link
                    key={task.id}
                    to={`/projects/${task.project_id}?task=${task.id}`}
                    className="flex items-center gap-3 rounded-xl border border-red-900 bg-red-950/40 px-4 py-3 hover:border-red-600"
                  >
                    {isAdm && assignee && (
                      <span className="flex min-w-0 items-center gap-1.5">
                        <Avatar name={assignee.full_name} size={7} />
                        <span className="max-w-24 truncate text-xs text-slate-400">{assignee.full_name}</span>
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {task.parent ? `${task.parent.title} – ${task.title}` : task.title}
                      </span>
                      <span className="block truncate text-xs text-slate-400">{task.project?.name}</span>
                    </span>
                    <span className={`text-xs whitespace-nowrap ${isOverdue(task) ? 'font-semibold text-red-400' : 'text-amber-400'}`}>
                      {fmtDue(task)}
                    </span>
                  </Link>
                )
              })}
            </div>
            )}
          </section>
        )
      })()}

      {reviews.length > 0 && (() => {
        const shown = reviews
          .filter((task) => activeFilter.includes(task.project_id))
          .filter((task) => (task.parent_id ? typeFilter.subs : typeFilter.main))
        return (
          <section>
            <div className="mb-2 flex items-center gap-2">
              <h2 className="flex items-center gap-1 text-sm font-semibold text-amber-400">
                {chevron('reviews')}
                {t('waitingMyCheck')} <span className="text-xs">({shown.length})</span>
              </h2>
              <div className="ml-auto">
                <TypeFilter
                  value={typeFilter}
                  onChange={(v) => {
                    setTypeFilter(v)
                    localStorage.setItem('reviews_type_filter', JSON.stringify(v))
                  }}
                  labels={{ main: t('mainTasks'), subs: t('subtasks') }}
                />
              </div>
            </div>
            {!collapsed.has('reviews') && (
            <div className="space-y-2">
              {shown.map((task) => {
                const assignee = profiles.find((p) => p.id === task.assignee_id)
                return (
                  <Link
                    key={task.id}
                    to={`/projects/${task.project_id}?task=${task.id}`}
                    className="flex items-center gap-3 rounded-xl border border-amber-900 bg-amber-950/40 px-4 py-3 hover:border-amber-600"
                  >
                    {assignee && <Avatar name={assignee.full_name} size={7} />}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {task.parent ? `${task.parent.title} – ${task.title}` : task.title}
                      </span>
                      <span className="block truncate text-xs text-slate-400">{task.project?.name}</span>
                    </span>
                  </Link>
                )
              })}
            </div>
            )}
          </section>
        )
      })()}

      {mine.length === 0 && reviews.length === 0 && (
        <p className="rounded-xl border border-dashed border-slate-600 p-8 text-center text-sm text-slate-400">
          {t('allCaughtUp')}
        </p>
      )}

      {myProjects
        .filter((p) => activeFilter.includes(p.id))
        .map((proj) => {
          const groupTasks = mine
            .filter((task) => task.project_id === proj.id)
            .sort((x, y) => sortKey(x) - sortKey(y))
          if (groupTasks.length === 0) return null
          return (
            <section key={proj.id}>
              <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-200">
                {chevron(proj.id)}
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: proj.color }} />
                {proj.name} <span className="text-xs font-normal text-slate-400">({groupTasks.length})</span>
              </h2>
              {!collapsed.has(proj.id) && (
              <DndContext sensors={sensors} onDragEnd={onDragEnd(groupTasks)}>
                <SortableContext items={groupTasks.map((x) => x.id)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-2">
                    {groupTasks.map((task) => (
                      <SortableRow key={task.id} task={task} myPos={sortKey(task)} />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
              )}
            </section>
          )
        })}
    </div>
  )
}
