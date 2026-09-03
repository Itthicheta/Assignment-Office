import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useI18n } from '../lib/i18n'
import Avatar from './Avatar'

export const NONE_SENTINEL = '__none__'

// filter semantics: [] = everyone; ['__none__'] = nobody; otherwise subset of ids
export function personMatches(filter: string[], personId: string | null | undefined) {
  if (filter.length === 0) return true
  return !!personId && filter.includes(personId)
}

// same, for multi-assignee lists: matches when ANY assignee is in the filter
export function personMatchesAny(filter: string[], personIds: string[]) {
  if (filter.length === 0) return true
  return personIds.some((id) => filter.includes(id))
}

export default function PersonFilter({
  filter,
  onChange,
}: {
  filter: string[]
  onChange: (v: string[]) => void
}) {
  const { profiles } = useAuth()
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const allIds = profiles.map((x) => x.id)
  const isAll = filter.length === 0
  const selected = isAll ? allIds : filter.filter((id) => id !== NONE_SENTINEL)

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-400 hover:bg-slate-800"
      >
        {isAll ? t('team') : `${selected.length}/${allIds.length}`} ▾
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-52 rounded-xl border border-slate-700 bg-slate-900 p-2 shadow-lg">
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border-b border-slate-800 px-2 py-1.5 text-sm font-semibold hover:bg-slate-800">
            <input
              type="checkbox"
              checked={isAll}
              onChange={() => onChange(isAll ? [NONE_SENTINEL] : [])}
              className="h-4 w-4 accent-indigo-600"
            />
            {t('allPeople')}
          </label>
          {profiles.map((p) => (
            <label key={p.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-800">
              <input
                type="checkbox"
                checked={selected.includes(p.id)}
                onChange={() => {
                  const next = selected.includes(p.id)
                    ? selected.filter((x) => x !== p.id)
                    : [...selected, p.id]
                  onChange(next.length === allIds.length ? [] : next.length === 0 ? [NONE_SENTINEL] : next)
                }}
                className="h-4 w-4 accent-indigo-600"
              />
              <Avatar name={p.full_name} size={6} />
              <span className="truncate">{p.full_name}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}
