import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useI18n } from '../lib/i18n'
import type { Task } from '../lib/types'

interface Result extends Task {
  parentTitle?: string
}

// Bold every occurrence of any search term inside the title
function Highlight({ text, terms }: { text: string; terms: string[] }) {
  if (!terms.length) return <>{text}</>
  const escaped = terms.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
  const pattern = new RegExp(`(${escaped})`, 'gi')
  const tester = new RegExp(`^(${escaped})$`, 'i')
  const parts = text.split(pattern)
  return (
    <>
      {parts.map((part, i) =>
        tester.test(part) ? (
          <b key={i} className="text-indigo-300">{part}</b>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  )
}

export default function SearchBox() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Result[]>([])
  const [open, setOpen] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setMobileOpen(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  // debounced live search on the title, all words must match
  useEffect(() => {
    const terms = query.trim().split(/\s+/).filter((s) => s.length >= 1)
    if (query.trim().length < 2) {
      setResults([])
      setOpen(false)
      return
    }
    const handle = setTimeout(async () => {
      let q = supabase.from('tasks').select('*').limit(20).order('updated_at', { ascending: false })
      for (const term of terms) q = q.ilike('title', `%${term}%`)
      const { data } = await q
      const rows = ((data as Result[]) ?? [])
      const pids = [...new Set(rows.map((x) => x.parent_id).filter(Boolean))] as string[]
      if (pids.length) {
        const { data: parents } = await supabase.from('tasks').select('id, title').in('id', pids)
        const titleOf: Record<string, string> = {}
        for (const row of parents ?? []) titleOf[row.id] = row.title
        for (const row of rows) {
          if (row.parent_id) row.parentTitle = titleOf[row.parent_id]
        }
      }
      setResults(rows)
      setOpen(true)
    }, 300)
    return () => clearTimeout(handle)
  }, [query])

  const terms = query.trim().split(/\s+/).filter(Boolean)
  const mains = results.filter((x) => !x.parent_id)
  const subs = results.filter((x) => x.parent_id)

  const openResult = (task: Result) => {
    setQuery('')
    setOpen(false)
    setMobileOpen(false)
    navigate(`/projects/${task.project_id}?task=${task.id}`)
  }

  const resultRow = (task: Result) => (
    <button
      key={task.id}
      onClick={() => openResult(task)}
      className="block w-full truncate rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-800"
    >
      {task.parentTitle && <span className="text-slate-500">{task.parentTitle} – </span>}
      <Highlight text={task.title} terms={terms} />
      {task.status === 'done' && <span className="ml-1 text-xs text-emerald-400">✓</span>}
    </button>
  )

  const dropdown = open && (
    <div className="absolute top-full right-0 left-0 z-40 mt-1 max-h-96 overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 p-2 shadow-xl">
      {results.length === 0 && <p className="px-3 py-2 text-sm text-slate-500">{t('noResults')}</p>}
      {mains.length > 0 && (
        <>
          <p className="px-3 pt-1 pb-0.5 text-[10px] font-semibold text-slate-500 uppercase">{t('mainTasks')}</p>
          {mains.map(resultRow)}
        </>
      )}
      {subs.length > 0 && (
        <>
          <p className="px-3 pt-2 pb-0.5 text-[10px] font-semibold text-slate-500 uppercase">{t('subtasks')}</p>
          {subs.map(resultRow)}
        </>
      )}
    </div>
  )

  return (
    <div ref={ref} className="min-w-0 flex-1 sm:max-w-xs">
      {/* desktop: inline input */}
      <div className="relative hidden sm:block">
        <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-sm text-slate-500">🔍</span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => query.trim().length >= 2 && setOpen(true)}
          placeholder={t('searchPlaceholder')}
          className="w-full rounded-lg border border-slate-700 bg-slate-900 py-1.5 pr-3 pl-8 text-sm text-slate-200 focus:border-indigo-500 focus:outline-none"
        />
        {dropdown}
      </div>
      {/* mobile: icon toggling a bar */}
      <div className="sm:hidden">
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="rounded-full p-1.5 text-slate-400 hover:bg-slate-800"
          title={t('searchPlaceholder')}
        >
          🔍
        </button>
        {mobileOpen && (
          <div className="absolute top-full right-0 left-0 z-40 border-b border-slate-800 bg-slate-900 p-2">
            <div className="relative">
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('searchPlaceholder')}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-indigo-500 focus:outline-none"
              />
              {dropdown}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
