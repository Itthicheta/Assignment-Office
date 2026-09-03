import { useEffect, useRef, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useI18n } from '../lib/i18n'
import Avatar from './Avatar'

// Header avatar → panel where anyone changes their own password:
// verify the current password, then set the new one.
export default function AccountMenu() {
  const { session, profile } = useAuth()
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [oldPw, setOldPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [busy, setBusy] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  if (!profile || !session) return null

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess(false)
    if (newPw !== confirmPw) {
      setError(t('passwordMismatch'))
      return
    }
    setBusy(true)
    // verify the current password by re-authenticating
    const { error: authErr } = await supabase.auth.signInWithPassword({
      email: session.user.email!,
      password: oldPw,
    })
    if (authErr) {
      setError(t('wrongOldPassword'))
      setBusy(false)
      return
    }
    const { error: updErr } = await supabase.auth.updateUser({ password: newPw })
    if (updErr) {
      setError(updErr.message)
    } else {
      setSuccess(true)
      setOldPw('')
      setNewPw('')
      setConfirmPw('')
    }
    setBusy(false)
  }

  const inputCls =
    'w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none'

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(!open)} title={t('changePassword')}>
        <Avatar name={profile.full_name} size={9} />
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-64 rounded-xl border border-slate-700 bg-slate-900 p-3 shadow-xl">
          <p className="mb-2 truncate text-sm font-semibold">{profile.full_name}</p>
          <p className="mb-2 text-xs font-semibold text-slate-400">{t('changePassword')}</p>
          <form onSubmit={submit} className="space-y-2">
            <input
              required
              type="password"
              value={oldPw}
              onChange={(e) => setOldPw(e.target.value)}
              placeholder={t('oldPassword')}
              autoComplete="current-password"
              className={inputCls}
            />
            <input
              required
              type="password"
              minLength={6}
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
              placeholder={t('newPassword')}
              autoComplete="new-password"
              className={inputCls}
            />
            <input
              required
              type="password"
              minLength={6}
              value={confirmPw}
              onChange={(e) => setConfirmPw(e.target.value)}
              placeholder={t('confirmPassword')}
              autoComplete="new-password"
              className={inputCls}
            />
            {error && <p className="text-xs text-red-400">{error}</p>}
            {success && <p className="text-xs text-emerald-400">{t('passwordChanged')}</p>}
            <button
              disabled={busy}
              className="w-full rounded-lg bg-indigo-600 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {t('save')}
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
