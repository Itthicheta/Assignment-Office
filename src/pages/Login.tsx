import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useI18n } from '../lib/i18n'

export default function Login() {
  const { t, lang, setLang } = useI18n()
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    // Usernames map to synthetic addresses; real emails pass through as-is.
    const id = identifier.trim().toLowerCase()
    const email = id.includes('@') ? id : `${id}@assignment.local`
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError(error.message)
    setBusy(false)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-indigo-50 to-slate-100 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-indigo-600">📋 {t('appName')}</h1>
          <p className="mt-1 text-sm text-slate-500">{t('authTagline')}</p>
        </div>
        <form onSubmit={submit} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <input
            required
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            placeholder={t('usernameOrEmail')}
            autoComplete="username"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          />
          <input
            required
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t('password')}
            autoComplete="current-password"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            disabled={busy}
            className="w-full rounded-lg bg-indigo-600 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {t('signIn')}
          </button>
          <p className="text-center text-xs text-slate-400">{t('loginHint')}</p>
        </form>
        <div className="mt-4 text-center">
          <button
            onClick={() => setLang(lang === 'th' ? 'en' : 'th')}
            className="text-xs font-semibold text-slate-400 hover:text-slate-600"
          >
            {lang === 'th' ? 'English' : 'ภาษาไทย'}
          </button>
        </div>
      </div>
    </div>
  )
}
