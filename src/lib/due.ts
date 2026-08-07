// Deadline helpers. A deadline is a date plus an OPTIONAL time —
// no time means "due by end of that day".
interface Duelike {
  due_date: string | null
  due_time: string | null
  status: string
}

export const todayStr = () => new Date().toISOString().slice(0, 10)

const nowTime = () => new Date().toTimeString().slice(0, 5)

export function isOverdue(t: Duelike): boolean {
  if (!t.due_date || t.status === 'done') return false
  const today = todayStr()
  if (t.due_date < today) return true
  if (t.due_date === today && t.due_time) return t.due_time.slice(0, 5) <= nowTime()
  return false
}

export const isDueToday = (t: Duelike) => t.status !== 'done' && t.due_date === todayStr()

export const fmtDue = (t: Duelike) =>
  t.due_date ? (t.due_time ? `${t.due_date} ${t.due_time.slice(0, 5)}` : t.due_date) : ''
