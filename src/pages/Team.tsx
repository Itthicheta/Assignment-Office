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
  const [editingId, setEditingId] = useState<string | null>(null)
  const [eUsername, setEUsername] = useState('')
  const [eFullName, setEFullName] = useState('')
  const [ePassword, setEPassword] = useState('')
  const [ePasswordConfirm, setEPasswordConfirm] = useState('')

  if (profile?.role !== 'admin') {
    return <p className="rounded-xl border border-dashed border-slate-600 p-8 text-center text-sm text-slate-400">{t('adminOnly')}</p>
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

  const invokeManage = async (body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke('manage-user', { body })
    if (error) {
      let message = error.message
      try {
        const b = await (error as { context?: Response }).context?.json()
        if (b?.error) message = b.error
      } catch { /* keep default message */ }
      return message
    }
    if (data?.error) return data.error as string
    return null
  }

  const saveEdit = async (id: string) => {
    setError('')
    setSuccess('')
    if (ePassword && ePassword !== ePasswordConfirm) {
      setError(t('passwordMismatch'))
      return
    }
    setBusy(true)
    const body: Record<string, unknown> = { action: 'update', user_id: id }
    if (eUsername.trim()) body.username = eUsername.trim().toLowerCase()
    if (eFullName.trim()) body.full_name = eFullName.trim()
    if (ePassword) body.password = ePassword
    const err = await invokeManage(body)
    if (err) setError(err)
    else {
      setEditingId(null)
      refreshProfiles()
    }
    setBusy(false)
  }

  const deleteAccount = async (id: string) => {
    if (!window.confirm(t('confirmDeleteAccount1'))) return
    if (!window.confirm(t('confirmDeleteAccount2'))) return
    setBusy(true)
    const err = await invokeManage({ action: 'delete', user_id: id })
    if (err) alert(err)
    refreshProfiles()
    setBusy(false)
  }

  const startEdit = (id: string, uname: string | null, fname: string) => {
    setEditingId(id)
    setEUsername(uname ?? '')
    setEFullName(fname)
    setEPassword('')
    setEPasswordConfirm('')
    setError('')
    setSuccess('')
  }

  const inputCls =
    'w-full rounded-lg border border-slate-600 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none'

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">{t('team')}</h1>

      <section className="rounded-xl border border-slate-700 bg-slate-900 p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-slate-300">+ {t('newMember')}</h2>
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
          {error && <p className="text-sm text-red-400 sm:col-span-2">{error}</p>}
          {success && <p className="text-sm text-emerald-400 sm:col-span-2">{success}</p>}
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
          <div key={p.id} className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 shadow-sm">
            <div className="flex items-center gap-3">
              <Avatar name={p.full_name} size={9} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{p.full_name}</span>
                <span className="block truncate text-xs text-slate-400">@{p.username ?? '—'}</span>
              </span>
              {p.id === profile.id ? (
                <span className="rounded-full bg-indigo-950/60 px-2 py-0.5 text-xs font-medium text-indigo-300">
                  {p.role === 'admin' ? t('adminRole') : t('memberRole')}
                </span>
              ) : (
                <select
                  value={p.role}
                  onChange={(e) => changeRole(p.id, e.target.value as 'admin' | 'member')}
                  className="rounded-lg border border-slate-600 bg-slate-900 px-2 py-1 text-xs focus:border-indigo-500 focus:outline-none"
                >
                  <option value="member">{t('memberRole')}</option>
                  <option value="admin">{t('adminRole')}</option>
                </select>
              )}
              <button
                onClick={() => (editingId === p.id ? setEditingId(null) : startEdit(p.id, p.username, p.full_name))}
                className="rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-400 hover:bg-slate-800"
              >
                ✏️ {t('edit')}
              </button>
              {p.id !== profile.id && (
                <button
                  onClick={() => deleteAccount(p.id)}
                  disabled={busy}
                  title={t('confirmDeleteAccount1')}
                  className="rounded-md border border-red-900 px-2 py-1 text-xs text-red-400 hover:bg-red-950 hover:text-red-400 disabled:opacity-50"
                >
                  🗑
                </button>
              )}
            </div>

            {editingId === p.id && (
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  saveEdit(p.id)
                }}
                className="mt-3 grid gap-2 border-t border-slate-800 pt-3 sm:grid-cols-2"
              >
                <input
                  value={eFullName}
                  onChange={(e) => setEFullName(e.target.value)}
                  placeholder={t('fullName')}
                  className={inputCls}
                />
                <input
                  value={eUsername}
                  onChange={(e) => setEUsername(e.target.value)}
                  placeholder={t('username')}
                  pattern="[a-zA-Z0-9_.\-]{3,30}"
                  className={inputCls}
                />
                <input
                  type="password"
                  value={ePassword}
                  onChange={(e) => setEPassword(e.target.value)}
                  placeholder={t('newPassword')}
                  autoComplete="new-password"
                  className={inputCls}
                />
                <input
                  type="password"
                  value={ePasswordConfirm}
                  onChange={(e) => setEPasswordConfirm(e.target.value)}
                  placeholder={t('confirmPassword')}
                  autoComplete="new-password"
                  disabled={!ePassword}
                  className={inputCls}
                />
                {error && <p className="text-sm text-red-400 sm:col-span-2">{error}</p>}
                <div className="flex gap-2 sm:col-span-2">
                  <button
                    disabled={busy}
                    className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {t('save')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingId(null)}
                    className="rounded-lg px-4 py-1.5 text-sm text-slate-400 hover:bg-slate-800"
                  >
                    {t('cancel')}
                  </button>
                </div>
              </form>
            )}
          </div>
        ))}
      </section>
    </div>
  )
}
