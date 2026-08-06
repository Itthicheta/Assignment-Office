import { useAuth } from '../context/AuthContext'
import { useI18n } from '../lib/i18n'
import { canTickChecked, canTickDone } from '../lib/can'
import { setTickChecked, setTickDone } from '../lib/taskActions'
import type { Task } from '../lib/types'

// The dual-tick control: [Done] by assignee, [Checked] by whoever reviews —
// the creator/admin for tasks, the main task's assignee/admin for subtasks
// (pass `parent`). Status is derived server-side.
export default function TaskTicks({
  task,
  parent,
  onChanged,
}: {
  task: Task
  parent?: Task | null
  onChanged: () => void
}) {
  const { session, profile, profiles } = useAuth()
  const { t } = useI18n()
  const me = session!.user.id

  const toggleDone = async () => {
    // notify the checkers: admins for tasks, main-task assignee for subtasks
    const checkers = task.parent_id
      ? [parent?.assignee_id]
      : profiles.filter((p) => p.role === 'admin').map((p) => p.id)
    const err = await setTickDone(task, !task.tick_done, me, checkers.filter((x) => x && x !== me))
    if (err) alert(err)
    onChanged()
  }

  const toggleChecked = async () => {
    const err = await setTickChecked(task, !task.tick_checked, me)
    if (err) alert(err)
    onChanged()
  }

  // One box when worker = checker: tasks assigned to an admin; subtasks
  // assigned to the main task's assignee themself.
  const workerChecker = task.parent_id
    ? !!task.assignee_id && task.assignee_id === parent?.assignee_id
    : profiles.find((p) => p.id === task.assignee_id)?.role === 'admin'

  return (
    <span className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
      <label
        title={t('tickWork')}
        className={`flex items-center gap-1 text-xs ${canTickDone(profile, task, parent) ? 'cursor-pointer' : 'opacity-50'}`}
      >
        <input
          type="checkbox"
          checked={task.tick_done}
          disabled={!canTickDone(profile, task, parent)}
          onChange={toggleDone}
          className="h-4 w-4 accent-blue-600"
        />
        <span className="hidden text-slate-500 lg:inline">{t('tickWork')}</span>
      </label>
      {!workerChecker && (
        <label
          title={t('tickCheck')}
          className={`flex items-center gap-1 text-xs ${canTickChecked(profile, task, parent) ? 'cursor-pointer' : 'opacity-50'}`}
        >
          <input
            type="checkbox"
            checked={task.tick_checked}
            disabled={!canTickChecked(profile, task, parent)}
            onChange={toggleChecked}
            className="h-4 w-4 accent-emerald-600"
          />
          <span className="hidden text-slate-500 lg:inline">{t('tickCheck')}</span>
        </label>
      )}
    </span>
  )
}
