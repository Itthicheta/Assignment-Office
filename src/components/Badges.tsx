import { useI18n } from '../lib/i18n'
import type { Priority, Status } from '../lib/types'

export const STATUS_STYLES: Record<Status, string> = {
  todo: 'bg-slate-100 text-slate-600',
  in_progress: 'bg-blue-100 text-blue-700',
  in_review: 'bg-amber-100 text-amber-700',
  blocked: 'bg-red-100 text-red-700',
  done: 'bg-emerald-100 text-emerald-700',
  cancelled: 'bg-slate-100 text-slate-400 line-through',
}

const PRIORITY_STYLES: Record<Priority, string> = {
  urgent: 'bg-red-600 text-white',
  high: 'bg-orange-100 text-orange-700',
  normal: 'bg-slate-100 text-slate-500',
  low: 'bg-slate-50 text-slate-400',
}

export function StatusBadge({ status }: { status: Status }) {
  const { t } = useI18n()
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${STATUS_STYLES[status]}`}>
      {t(status)}
    </span>
  )
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  const { t } = useI18n()
  if (priority === 'normal') return null
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase whitespace-nowrap ${PRIORITY_STYLES[priority]}`}>
      {t(priority)}
    </span>
  )
}
