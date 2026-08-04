import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useI18n } from '../lib/i18n'
import { isAdmin } from '../lib/can'
import { isDueOn, recentDueDates, toDateStr } from '../lib/routineDates'
import Avatar from '../components/Avatar'
import type { Routine, RoutineCompletion } from '../lib/types'

export default function Routines() {
  const { session, profile, profiles } = useAuth()
  const { t, lang } = useI18n()
  const [routines, setRoutines] = useState<Routine[]>([])
  const [completions, setCompletions] = useState<RoutineCompletion[]>([])
  const [showForm, setShowForm] = useState(false)
  const [title, setTitle] = useState('')
  const [assignee, setAssignee] = useState('')
  const [repeatType, setRepeatType] = useState<'weekly' | 'monthly'>('weekly')
  const [weekdays, setWeekdays] = useState<number[]>([])
  const [monthdays, setMonthdays] = useState<number[]>([])
  const [loaded, setLoaded] = useState(false)

  const admin = isAdmin(profile)
  const today = new Date()
  const todayKey = toDateStr(today)

  const dayName = (d: number) => {
    // 2023-01-01 was a Sunday; offset by weekday index
    const ref = new Date(2023, 0, 1 + d)
    return ref.toLocaleDateString(lang === 'th' ? 'th-TH' : 'en-US', { weekday: 'short' })
  }

  const load = async () => {
    const since = new Date()
    since.setDate(since.getDate() - 60)
    const [r, c] = await Promise.all([
      supabase.from('routines').select('*').order('created_at'),
      supabase.from('routine_completions').select('*').gte('on_date', toDateStr(since)),
    ])
    setRoutines((r.data as Routine[]) ?? [])
    setCompletions((c.data as RoutineCompletion[]) ?? [])
    setLoaded(true)
  }

  useEffect(() => {
    load()
  }, [])

  const doneOn = (routineId: string, date: string) =>
    completions.some((c) => c.routine_id === routineId && c.on_date === date)

  const createRoutine = async (e: FormEvent) => {
    e.preventDefault()
    if (!session || !title.trim() || !assignee) return
    if (repeatType === 'weekly' && weekdays.length === 0) return
    if (repeatType === 'monthly' && monthdays.length === 0) return
    const { error } = await supabase.from('routines').insert({
      title: title.trim(),
      assignee_id: assignee,
      repeat_type: repeatType,
      weekdays: repeatType === 'weekly' ? weekdays : [],
      monthdays: repeatType === 'monthly' ? monthdays : [],
      created_by: session.user.id,
    })
    if (error) {
      alert(error.message)
      return
    }
    setTitle('')
    setAssignee('')
    setWeekdays([])
    setMonthdays([])
    setShowForm(false)
    load()
  }

  const toggleToday = async (routine: Routine) => {
    if (!session) return
    const canTick = admin || routine.assignee_id === session.user.id
    if (!canTick) return
    if (doneOn(routine.id, todayKey)) {
      await supabase.from('routine_completions').delete().eq('routine_id', routine.id).eq('on_date', todayKey)
    } else {
      const { error } = await supabase.from('routine_completions').insert({
        routine_id: routine.id,
        on_date: todayKey,
        completed_by: session.user.id,
      })
      if (error) alert(error.message)
    }
    load()
  }

  const toggleActive = async (routine: Routine) => {
    await supabase.from('routines').update({ active: !routine.active }).eq('id', routine.id)
    load()
  }

  const removeRoutine = async (routine: Routine) => {
    if (!confirm(t('confirmDeleteRoutine'))) return
    await supabase.from('routines').delete().eq('id', routine.id)
    load()
  }

  const scheduleText = (r: Routine) =>
    r.repeat_type === 'weekly'
      ? [...r.weekdays].sort((a, b) => a - b).map(dayName).join(', ')
      : [...r.monthdays].sort((a, b) => a - b).join(', ')

  const chip = (selected: boolean) =>
    `cursor-pointer rounded-lg border px-2 py-1 text-xs font-medium select-none ${
      selected ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50'
    }`

  if (!loaded) return <p className="text-slate-400">{t('loading')}</p>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">{t('routines')}</h1>
        {admin && (
          <button
            onClick={() => setShowForm(!showForm)}
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            + {t('newRoutine')}
          </button>
        )}
      </div>

      {showForm && (
        <form onSubmit={createRoutine} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid gap-2 sm:grid-cols-2">
            <input
              autoFocus
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('routineTitle')}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            />
            <select
              required
              value={assignee}
              onChange={(e) => setAssignee(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            >
              <option value="">{t('assignee')}…</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>{p.full_name}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex cursor-pointer items-center gap-1.5">
              <input type="radio" checked={repeatType === 'weekly'} onChange={() => setRepeatType('weekly')} className="accent-indigo-600" />
              {t('repeatWeekly')}
            </label>
            <label className="flex cursor-pointer items-center gap-1.5">
              <input type="radio" checked={repeatType === 'monthly'} onChange={() => setRepeatType('monthly')} className="accent-indigo-600" />
              {t('repeatMonthly')}
            </label>
          </div>
          {repeatType === 'weekly' ? (
            <div className="flex flex-wrap gap-1.5">
              {[0, 1, 2, 3, 4, 5, 6].map((d) => (
                <span
                  key={d}
                  onClick={() => setWeekdays((w) => (w.includes(d) ? w.filter((x) => x !== d) : [...w, d]))}
                  className={chip(weekdays.includes(d))}
                >
                  {dayName(d)}
                </span>
              ))}
            </div>
          ) : (
            <div className="flex flex-wrap gap-1">
              {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                <span
                  key={d}
                  onClick={() => setMonthdays((m) => (m.includes(d) ? m.filter((x) => x !== d) : [...m, d]))}
                  className={chip(monthdays.includes(d))}
                >
                  {d}
                </span>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <button className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700">
              {t('create')}
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="rounded-lg px-4 py-1.5 text-sm text-slate-500 hover:bg-slate-100">
              {t('cancel')}
            </button>
          </div>
        </form>
      )}

      {routines.length === 0 && !showForm && (
        <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-400">
          {t('noRoutines')}
        </p>
      )}

      <div className="space-y-2">
        {routines.map((r) => {
          const person = profiles.find((p) => p.id === r.assignee_id)
          const dueToday = isDueOn(r, today)
          const history = recentDueDates(r, 10)
          const canTick = admin || r.assignee_id === session?.user.id
          return (
            <div key={r.id} className={`rounded-xl border bg-white p-3 shadow-sm ${r.active ? 'border-slate-200' : 'border-slate-100 opacity-60'}`}>
              <div className="flex items-center gap-3">
                {person && <Avatar name={person.full_name} size={7} />}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">🔁 {r.title}</span>
                  <span className="block text-xs text-slate-400">
                    {person?.full_name} · {scheduleText(r)}
                  </span>
                </span>
                {dueToday && r.active ? (
                  <label className={`flex items-center gap-1.5 text-xs ${canTick ? 'cursor-pointer' : 'opacity-50'}`}>
                    <input
                      type="checkbox"
                      checked={doneOn(r.id, todayKey)}
                      disabled={!canTick}
                      onChange={() => toggleToday(r)}
                      className="h-4 w-4 accent-emerald-600"
                    />
                    <span className="text-slate-500">{t('doneToday')}</span>
                  </label>
                ) : (
                  <span className="text-xs text-slate-300">{t('notDueToday')}</span>
                )}
                {admin && (
                  <>
                    <button
                      onClick={() => toggleActive(r)}
                      className={`rounded-md border px-2 py-0.5 text-xs ${r.active ? 'border-emerald-200 text-emerald-600' : 'border-slate-200 text-slate-400'}`}
                    >
                      {r.active ? t('active') : t('paused')}
                    </button>
                    <button onClick={() => removeRoutine(r)} className="text-slate-300 hover:text-red-500">✕</button>
                  </>
                )}
              </div>
              {history.length > 0 && (
                <div className="mt-2 flex items-center gap-1 pl-10">
                  <span className="mr-1 text-[10px] text-slate-400">{t('history')}:</span>
                  {[...history].reverse().map((d) => (
                    <span
                      key={d}
                      title={d}
                      className={`inline-block h-3.5 w-3.5 rounded-sm text-center text-[9px] leading-3.5 ${
                        doneOn(r.id, d) ? 'bg-emerald-400 text-white' : d === todayKey ? 'bg-slate-200' : 'bg-red-200 text-red-700'
                      }`}
                    >
                      {doneOn(r.id, d) ? '✓' : d === todayKey ? '' : '✗'}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
