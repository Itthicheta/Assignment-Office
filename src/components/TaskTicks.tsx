import { useAuth } from '../context/AuthContext'
import { useI18n } from '../lib/i18n'
import { canTickChecked, canTickDone, isSelfTask } from '../lib/can'
import { setTickChecked, setTickDone } from '../lib/taskActions'
import type { Task } from '../lib/types'

// The dual-tick control: [work done] by assignee, [checked] by creator/admin.
// Status is derived server-side; both ticks (or one on self-tasks) = Done.
export default function TaskTicks({ task, onChanged }: { task: Task; onChanged: () => void }) {
  const { session, profile } = useAuth()
  const { t } = useI18n()
  const me = session!.user.id

  const toggleDone = async () => {
    const err = await setTickDone(task, !task.tick_done, me)
    if (err) alert(err)
    onChanged()
  }

  const toggleChecked = async () => {
    const err = await setTickChecked(task, !task.tick_checked, me)
    if (err) alert(err)
    onChanged()
  }

  return (
    <span className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
      <label
        title={t('tickWork')}
        className={`flex items-center gap-1 text-xs ${canTickDone(profile, task) ? 'cursor-pointer' : 'opacity-50'}`}
      >
        <input
          type="checkbox"
          checked={task.tick_done}
          disabled={!canTickDone(profile, task)}
          onChange={toggleDone}
          className="h-4 w-4 accent-blue-600"
        />
        <span className="hidden text-slate-500 lg:inline">{t('tickWork')}</span>
      </label>
      {!isSelfTask(task) && (
        <label
          title={t('tickCheck')}
          className={`flex items-center gap-1 text-xs ${canTickChecked(profile, task) ? 'cursor-pointer' : 'opacity-50'}`}
        >
          <input
            type="checkbox"
            checked={task.tick_checked}
            disabled={!canTickChecked(profile, task)}
            onChange={toggleChecked}
            className="h-4 w-4 accent-emerald-600"
          />
          <span className="hidden text-slate-500 lg:inline">{t('tickCheck')}</span>
        </label>
      )}
    </span>
  )
}
