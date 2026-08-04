import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useI18n } from '../lib/i18n'
import Avatar from '../components/Avatar'

export default function Team() {
  const { profile, profiles, refreshProfiles } = useAuth()
  const { t } = useI18n()
  const [fullName, setFullName] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [busy, setBusy] = useState(false)

  if (profile?.role !== 'admin') {
    return <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-400">{t('adminOnly')}</p>
  }

  const createMember = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    if (password !== confirm) {
      setError(t('passwordMismatch'))
      return
    }
    setBusy(true)
    const { data, error } = await supabase.functions.invoke('create-user', {
      body: { username: username.trim().toLowerCase(), password, full_name: fullName.trim() },
    })
    if (error) {
      // Edge function errors carry their JSON body in error.context
      let message = error.message
      try {
        const body = await (error as { context?: Response }).context?.json()
        if (body?.error) message = body.error
      } catch { /* keep default message */ }
      setError(message)
    } else if (data?.error) {
      setError(data.error)
    } else {
      setSuccess(`${t('memberCreated')} (${username.trim().toLowerCase()})`)
      setFullName('')
      setUsername('')
      setPassword('')
      setConfirm('')
      refreshProfiles()
    }
    setBusy(false)
  }

  const changeRole = async (id: string, role: 'admin' | 'member') => {
    await supabase.from('profiles').update({ role }).eq('id', id)
    refreshProfiles()
  }

  const inputCls =
    'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none'

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">{t('team')}</h1>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-slate-600">+ {t('newMember')}</h2>
        <form onSubmit={createMember} className="grid gap-2 sm:grid-cols-2">
          <input required value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder={t('fullName')} className={inputCls} />
          <input
            required
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder={t('username')}
            pattern="[a-zA-Z0-9_.\-]{3,30}"
            title="3-30 chars: a-z, 0-9, dot, dash, underscore"
            className={inputCls}
          />
          <input required type="password" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t('password')} autoComplete="new-password" className={inputCls} />
          <input required type="password" minLength={6} value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder={t('confirmPassword')} autoComplete="new-password" className={inputCls} />
          {error && <p className="text-sm text-red-600 sm:col-span-2">{error}</p>}
          {success && <p className="text-sm text-emerald-600 sm:col-span-2">{success}</p>}
          <button
            disabled={busy}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 sm:col-span-2 sm:justify-self-start"
          >
            {t('createMember')}
          </button>
        </form>
      </section>

      <section className="space-y-2">
        {profiles.map((p) => (
          <div key={p.id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <Avatar name={p.full_name} size={9} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{p.full_name}</span>
              <span className="block truncate text-xs text-slate-400">@{p.username ?? '—'}</span>
            </span>
            {p.id === profile.id ? (
              <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
                {p.role === 'admin' ? t('adminRole') : t('memberRole')}
              </span>
            ) : (
              <select
                value={p.role}
                onChange={(e) => changeRole(p.id, e.target.value as 'admin' | 'member')}
                className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs focus:border-indigo-500 focus:outline-none"
              >
                <option value="member">{t('memberRole')}</option>
                <option value="admin">{t('adminRole')}</option>
              </select>
            )}
          </div>
        ))}
      </section>
    </div>
  )
}
