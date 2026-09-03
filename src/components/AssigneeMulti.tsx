import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useI18n } from '../lib/i18n'
import Avatar from './Avatar'

// Multi-assignee picker for tasks: stacked avatars + a tick-list dropdown.
// Read-only mode shows the avatars only.
export default function AssigneeMulti({
  ids,
  disabled,
  onChange,
}: {
  ids: string[]
  disabled: boolean
  onChange: (ids: string[]) => void
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

  const selected = profiles.filter((p) => ids.includes(p.id))

  const display = selected.length ? (
    <span className="flex items-center -space-x-2">
      {selected.slice(0, 3).map((p) => (
        <Avatar key={p.id} name={p.full_name} size={7} />
      ))}
      {selected.length > 3 && (
        <span className="z-10 ml-1 pl-3 text-xs text-slate-400">+{selected.length - 3}</span>
      )}
    </span>
  ) : (
    <span className="text-xs whitespace-nowrap text-slate-500">{t('unassigned')}</span>
  )

  if (disabled) return display

  return (
    <div className="relative" ref={ref} onClick={(e) => e.stopPropagation()}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center rounded-lg border border-transparent px-1 py-0.5 hover:border-slate-600"
        title={t('assignee')}
      >
        {display}
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-1 w-52 rounded-xl border border-slate-700 bg-slate-900 p-2 shadow-xl">
          {profiles.map((p) => (
            <label
              key={p.id}
              className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-800"
            >
              <input
                type="checkbox"
                checked={ids.includes(p.id)}
                onChange={() =>
                  onChange(ids.includes(p.id) ? ids.filter((x) => x !== p.id) : [...ids, p.id])
                }
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
