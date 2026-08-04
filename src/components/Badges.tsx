import { useI18n } from '../lib/i18n'
import type { Priority, Status } from '../lib/types'

export const STATUS_STYLES: Record<Status, string> = {
  in_progress: 'bg-blue-100 text-blue-700',
  done: 'bg-emerald-100 text-emerald-700',
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
  if (priority !== 'urgent') return null
  return (
    <span className="rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-semibold whitespace-nowrap text-white uppercase">
      {t('urgent')}
    </span>
  )
}
