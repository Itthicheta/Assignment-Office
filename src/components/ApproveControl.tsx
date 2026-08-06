import { useAuth } from '../context/AuthContext'
import { useI18n } from '../lib/i18n'
import { canApprove } from '../lib/can'
import { setApproved } from '../lib/taskActions'
import type { Task } from '../lib/types'

// Admin's legitimacy control for member-created tasks.
// Admin sees a tickable box; others see an amber "pending" chip until
// approved (approved = clean row, no badge — most tasks are approved).
export default function ApproveControl({ task, onChanged }: { task: Task; onChanged: () => void }) {
  const { session, profile } = useAuth()
  const { t } = useI18n()

  if (task.parent_id) return null

  if (canApprove(profile)) {
    return (
      <label
        title={task.approved ? t('approvedLock') : t('approve')}
        onClick={(e) => e.stopPropagation()}
        className="flex cursor-pointer items-center gap-1 text-xs"
      >
        <input
          type="checkbox"
          checked={task.approved}
          onChange={async () => {
            const err = await setApproved(task, !task.approved, session!.user.id)
            if (err) alert(err)
            onChanged()
          }}
          className="h-4 w-4 accent-indigo-600"
        />
        <span className="text-slate-400">🔒</span>
      </label>
    )
  }

  if (!task.approved) {
    return (
      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium whitespace-nowrap text-amber-700">
        {t('pendingApproval')}
      </span>
    )
  }
  return null
}
