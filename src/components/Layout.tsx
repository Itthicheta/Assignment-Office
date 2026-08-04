import { type ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useI18n } from '../lib/i18n'
import Avatar from './Avatar'
import NotificationsBell from './NotificationsBell'

export default function Layout({ children }: { children: ReactNode }) {
  const { profile } = useAuth()
  const { t, lang, setLang } = useI18n()

  const navCls = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
      isActive ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-100'
    }`

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-2.5">
        <span className="text-lg font-bold text-indigo-600">📋 {t('appName')}</span>
        <nav className="ml-4 hidden items-center gap-1 sm:flex">
          <NavLink to="/" end className={navCls}>{t('myTasks')}</NavLink>
          <NavLink to="/projects" className={navCls}>{t('projects')}</NavLink>
          {profile?.role === 'admin' && <NavLink to="/team" className={navCls}>{t('team')}</NavLink>}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <button
            onClick={() => setLang(lang === 'th' ? 'en' : 'th')}
            className="rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-50"
            title="Switch language / เปลี่ยนภาษา"
          >
            {lang === 'th' ? 'EN' : 'ไทย'}
          </button>
          <NotificationsBell />
          {profile && <Avatar name={profile.full_name} size={9} />}
          <button
            onClick={() => supabase.auth.signOut()}
            className="text-xs text-slate-400 hover:text-slate-600"
          >
            {t('signOut')}
          </button>
        </div>
      </header>

      {/* mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-20 flex border-t border-slate-200 bg-white sm:hidden">
        <NavLink to="/" end className={({ isActive }) => `flex-1 py-3 text-center text-sm font-medium ${isActive ? 'text-indigo-600' : 'text-slate-500'}`}>
          {t('myTasks')}
        </NavLink>
        <NavLink to="/projects" className={({ isActive }) => `flex-1 py-3 text-center text-sm font-medium ${isActive ? 'text-indigo-600' : 'text-slate-500'}`}>
          {t('projects')}
        </NavLink>
        {profile?.role === 'admin' && (
          <NavLink to="/team" className={({ isActive }) => `flex-1 py-3 text-center text-sm font-medium ${isActive ? 'text-indigo-600' : 'text-slate-500'}`}>
            {t('team')}
          </NavLink>
        )}
      </nav>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 pb-20 sm:pb-6">{children}</main>
    </div>
  )
}
