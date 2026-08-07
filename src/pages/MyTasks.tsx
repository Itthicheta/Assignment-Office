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
import Avatar from '../components/Avatar'
import type { Task } from '../lib/types'

interface TaskWithProject extends Task {
  project: { id: string; name: string; color: string; created_at: string } | null
  parent: { title: string } | null
}

const FILTER_KEY = 'mytasks_project_filter'

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
  const [order, setOrder] = useState<Record<string, number>>({})
  const [filter, setFilter] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(FILTER_KEY) ?? '[]')
    } catch {
      return []
    }
  })
  const [filterOpen, setFilterOpen] = useState(false)
  const [typeFilter, setTypeFilter] = useState<{ main: boolean; subs: boolean }>(() => {
    try {
      return JSON.parse(localStorage.getItem('reviews_type_filter') ?? '') || { main: true, subs: true }
    } catch {
      return { main: true, subs: true }
    }
  })
  const [typeFilterOpen, setTypeFilterOpen] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const filterRef = useRef<HTMLDivElement>(null)
  const typeFilterRef = useRef<HTMLDivElement>(null)

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
      if (typeFilterRef.current && !typeFilterRef.current.contains(e.target as Node)) setTypeFilterOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const setTypeFilterPersist = (v: { main: boolean; subs: boolean }) => {
    setTypeFilter(v)
    localStorage.setItem('reviews_type_filter', JSON.stringify(v))
  }

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

      {(() => {
        const isAdm = profile?.role === 'admin'
        const items = (isAdm ? chase : mine.filter((x) => isOverdue(x)))
          .filter((x) => activeFilter.includes(x.project_id))
          .sort((a, b) =>
            `${a.due_date}${a.due_time ?? ''}`.localeCompare(`${b.due_date}${b.due_time ?? ''}`),
          )
        if (!items.length) return null
        return (
          <section>
            <h2 className="mb-2 text-sm font-semibold text-red-500">
              ⏰ {isAdm ? t('chaseSection') : t('overdueSection')}{' '}
              <span className="text-xs font-normal">({items.length})</span>
            </h2>
            <div className="space-y-2">
              {items.map((task) => {
                const assignee = profiles.find((p) => p.id === task.assignee_id)
                return (
                  <Link
                    key={task.id}
                    to={`/projects/${task.project_id}?task=${task.id}`}
                    className="flex items-center gap-3 rounded-xl border border-red-900 bg-red-950/40 px-4 py-3 hover:border-red-600"
                  >
                    {isAdm && assignee && <Avatar name={assignee.full_name} size={7} />}
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
              <h2 className="text-sm font-semibold text-amber-400">
                {t('waitingMyCheck')} <span className="text-xs">({shown.length})</span>
              </h2>
              <div className="relative ml-auto" ref={typeFilterRef}>
                <button
                  onClick={() => setTypeFilterOpen(!typeFilterOpen)}
                  className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-xs font-medium text-slate-400 hover:bg-slate-800"
                >
                  {typeFilter.main && typeFilter.subs
                    ? `${t('mainTasks')} + ${t('subtasks')}`
                    : typeFilter.main
                      ? t('mainTasks')
                      : t('subtasks')} ▾
                </button>
                {typeFilterOpen && (
                  <div className="absolute right-0 z-20 mt-1 w-40 rounded-xl border border-slate-700 bg-slate-900 p-2 shadow-lg">
                    <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-800">
                      <input
                        type="checkbox"
                        checked={typeFilter.main}
                        onChange={() => setTypeFilterPersist({ ...typeFilter, main: !typeFilter.main })}
                        className="h-4 w-4 accent-indigo-600"
                      />
                      {t('mainTasks')}
                    </label>
                    <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-800">
                      <input
                        type="checkbox"
                        checked={typeFilter.subs}
                        onChange={() => setTypeFilterPersist({ ...typeFilter, subs: !typeFilter.subs })}
                        className="h-4 w-4 accent-indigo-600"
                      />
                      {t('subtasks')}
                    </label>
                  </div>
                )}
              </div>
            </div>
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
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: proj.color }} />
                {proj.name} <span className="text-xs font-normal text-slate-400">({groupTasks.length})</span>
              </h2>
              <DndContext sensors={sensors} onDragEnd={onDragEnd(groupTasks)}>
                <SortableContext items={groupTasks.map((x) => x.id)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-2">
                    {groupTasks.map((task) => (
                      <SortableRow key={task.id} task={task} myPos={sortKey(task)} />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            </section>
          )
        })}
    </div>
  )
}
