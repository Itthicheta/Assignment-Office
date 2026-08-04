import type { Routine } from './types'

export const toDateStr = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export function isDueOn(routine: Routine, date: Date): boolean {
  if (!routine.active) return false
  if (routine.repeat_type === 'weekly') return routine.weekdays.includes(date.getDay())
  return routine.monthdays.includes(date.getDate())
}

// Due dates within [start, end] inclusive, as YYYY-MM-DD strings
export function dueDatesInRange(routine: Routine, start: Date, end: Date): string[] {
  const out: string[] = []
  const d = new Date(start)
  d.setHours(0, 0, 0, 0)
  while (d <= end) {
    if (isDueOn(routine, d)) out.push(toDateStr(d))
    d.setDate(d.getDate() + 1)
  }
  return out
}

// The routine's last N due dates up to (and including) today
export function recentDueDates(routine: Routine, n: number): string[] {
  const out: string[] = []
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  for (let i = 0; i < 370 && out.length < n; i++) {
    if (isDueOn(routine, d)) out.push(toDateStr(d))
    d.setDate(d.getDate() - 1)
  }
  return out
}
