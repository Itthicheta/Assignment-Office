import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useI18n, type TKey } from '../lib/i18n'
import type { Notification } from '../lib/types'
import Avatar from './Avatar'

interface NotifRow extends Notification {
  task: { id: string; title: string; project_id: string } | null
}

export default function NotificationsBell() {
  const { session, profiles } = useAuth()
  const { t } = useI18n()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<NotifRow[]>([])
  const ref = useRef<HTMLDivElement>(null)

  const load = async () => {
    if (!session) return
    const { data } = await supabase
      .from('notifications')
      .select('*, task:tasks(id, title, project_id)')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false })
      .limit(30)
    if (data) setItems(data as NotifRow[])
  }

  useEffect(() => {
    load()
    if (!session) return
    const channel = supabase
      .channel('notifications')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'assignment_office', table: 'notifications', filter: `user_id=eq.${session.user.id}` },
        () => load(),
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [session?.user.id])

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const unread = items.filter((n) => !n.read).length

  const markAllRead = async () => {
    if (!session) return
    await supabase.from('notifications').update({ read: true }).eq('user_id', session.user.id).eq('read', false)
    load()
  }

  const openItem = async (n: NotifRow) => {
    await supabase.from('notifications').update({ read: true }).eq('id', n.id)
    setOpen(false)
    load()
    if (n.task) navigate(`/projects/${n.task.project_id}?task=${n.task.id}`)
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="relative rounded-full p-1.5 text-slate-500 hover:bg-slate-100"
        title={t('notifications')}
      >
        🔔
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-2 w-80 rounded-xl border border-slate-200 bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
            <span className="text-sm font-semibold">{t('notifications')}</span>
            {unread > 0 && (
              <button onClick={markAllRead} className="text-xs text-indigo-600 hover:underline">
                {t('markAllRead')}
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 && <p className="p-4 text-center text-sm text-slate-400">{t('noNotifications')}</p>}
            {items.map((n) => {
              const actor = profiles.find((p) => p.id === n.actor_id)
              return (
                <button
                  key={n.id}
                  onClick={() => openItem(n)}
                  className={`flex w-full items-start gap-2 px-3 py-2.5 text-left hover:bg-slate-50 ${n.read ? 'opacity-60' : ''}`}
                >
                  {actor && <Avatar name={actor.full_name} size={6} />}
                  <span className="text-xs leading-snug">
                    <b>{actor?.full_name ?? '—'}</b> {t(`notif_${n.type}` as TKey)}
                    {n.task && <span className="block text-slate-500">“{n.task.title}”</span>}
                  </span>
                  {!n.read && <span className="mt-1 ml-auto h-2 w-2 shrink-0 rounded-full bg-indigo-500" />}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
