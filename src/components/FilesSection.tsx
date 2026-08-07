import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useI18n } from '../lib/i18n'
import { isAdmin } from '../lib/can'
import type { Attachment } from '../lib/types'

const fmtSize = (b: number) =>
  b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`

// File list + upload for a project (taskId null) or a single task.
// canUpload is decided by the caller (task/subtask assignees or admin for
// task files; admin only for project files) and enforced in the database.
export default function FilesSection({
  projectId,
  taskId,
  canUpload,
}: {
  projectId: string
  taskId: string | null
  canUpload: boolean
}) {
  const { session, profile, profiles } = useAuth()
  const { t } = useI18n()
  const [files, setFiles] = useState<Attachment[]>([])
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const load = async () => {
    let q = supabase.from('attachments').select('*').eq('project_id', projectId).order('created_at')
    q = taskId ? q.eq('task_id', taskId) : q.is('task_id', null)
    const { data } = await q
    setFiles((data as Attachment[]) ?? [])
  }

  useEffect(() => {
    load()
  }, [projectId, taskId])

  const upload = async (file: File) => {
    if (!session) return
    setBusy(true)
    const path = `${projectId}/${taskId ?? 'project'}/${crypto.randomUUID()}-${file.name}`
    const { error } = await supabase.storage.from('attachments').upload(path, file)
    if (error) {
      alert(error.message)
    } else {
      await supabase.from('attachments').insert({
        project_id: projectId,
        task_id: taskId,
        name: file.name,
        path,
        size: file.size,
        uploaded_by: session.user.id,
      })
      load()
    }
    setBusy(false)
  }

  const open = async (f: Attachment) => {
    const { data, error } = await supabase.storage.from('attachments').createSignedUrl(f.path, 3600)
    if (error || !data) {
      alert(error?.message ?? 'Could not open file')
      return
    }
    window.open(data.signedUrl, '_blank')
  }

  const remove = async (f: Attachment) => {
    if (!confirm(t('confirmDeleteFile'))) return
    await supabase.storage.from('attachments').remove([f.path])
    await supabase.from('attachments').delete().eq('id', f.id)
    load()
  }

  const nameOf = (uid: string) => profiles.find((p) => p.id === uid)?.full_name ?? '—'

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <h3 className="text-xs font-semibold text-slate-400">📎 {t('files')} ({files.length})</h3>
        {canUpload && (
          <button
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-50"
          >
            {busy ? t('uploading') : `+ ${t('uploadFile')}`}
          </button>
        )}
        <input
          ref={inputRef}
          type="file"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) upload(f)
            e.target.value = ''
          }}
        />
      </div>
      <div className="space-y-1">
        {files.map((f) => (
          <div key={f.id} className="flex items-center gap-2 rounded-lg border border-slate-800 px-2 py-1.5 text-sm">
            <button onClick={() => open(f)} className="min-w-0 flex-1 truncate text-left text-indigo-400 hover:underline">
              {f.name}
            </button>
            <span className="text-xs whitespace-nowrap text-slate-400">
              {fmtSize(f.size)} · {nameOf(f.uploaded_by)}
            </span>
            {(f.uploaded_by === session?.user.id || isAdmin(profile)) && (
              <button onClick={() => remove(f)} className="text-slate-600 hover:text-red-500">✕</button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
