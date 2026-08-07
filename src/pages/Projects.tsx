import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { DndContext, PointerSensor, TouchSensor, useDroppable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, rectSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useI18n } from '../lib/i18n'
import { isAdmin } from '../lib/can'
import type { Project, ProjectSection } from '../lib/types'

const PALETTE = ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#0ea5e9', '#a855f7', '#ec4899', '#14b8a6']

interface Counts {
  total: number
  done: number
}

function ProjectCard({
  project,
  counts,
  sections,
  admin,
  onMove,
}: {
  project: Project
  counts: Counts
  sections: ProjectSection[]
  admin: boolean
  onMove: (project: Project, sectionId: string) => void
}) {
  const { t } = useI18n()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: project.id,
    disabled: !admin,
  })
  const pct = counts.total === 0 ? 0 : Math.round((counts.done / counts.total) * 100)

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`relative rounded-xl border border-slate-700 bg-slate-900 p-4 shadow-sm transition hover:border-indigo-700 ${isDragging ? 'z-10 opacity-70' : ''}`}
    >
      <div className="flex items-center gap-2">
        {admin && (
          <span
            {...attributes}
            {...listeners}
            className="-ml-1 cursor-grab touch-none text-slate-600 select-none active:cursor-grabbing"
          >
            ⠿
          </span>
        )}
        <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: project.color }} />
        <Link to={`/projects/${project.id}`} className="min-w-0 flex-1 truncate font-semibold hover:text-indigo-400">
          {project.name}
        </Link>
      </div>
      {project.description && <p className="mt-1 line-clamp-2 text-xs text-slate-400">{project.description}</p>}
      <div className="mt-3">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: project.color }} />
        </div>
        <div className="mt-1 flex items-center justify-between">
          <p className="text-xs text-slate-400">
            {counts.done}/{counts.total} {t('tasksDone')} · {pct}%
          </p>
          {admin && (
            <select
              value={project.section_id ?? ''}
              onChange={(e) => onMove(project, e.target.value)}
              className="rounded-md border border-slate-700 bg-slate-900 px-1 py-0.5 text-[10px] text-slate-400 focus:outline-none"
              title={t('section')}
            >
              <option value="">{t('noSection')}</option>
              {sections.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          )}
        </div>
      </div>
    </div>
  )
}

export default function Projects() {
  const { session, profile } = useAuth()
  const { t } = useI18n()
  const [projects, setProjects] = useState<Project[]>([])
  const [sections, setSections] = useState<ProjectSection[]>([])
  const [counts, setCounts] = useState<Record<string, Counts>>({})
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [newSection, setNewSection] = useState('')
  const [showSectionForm, setShowSectionForm] = useState(false)
  const [sectionEdits, setSectionEdits] = useState<Record<string, string>>({})
  const [loaded, setLoaded] = useState(false)

  const admin = isAdmin(profile)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
  )

  const load = async () => {
    const [p, s, tsk] = await Promise.all([
      supabase.from('projects').select('*').eq('archived', false).order('position'),
      supabase.from('project_sections').select('*').order('position'),
      supabase.from('tasks').select('id, project_id, status, parent_id').is('parent_id', null),
    ])
    setProjects((p.data as Project[]) ?? [])
    setSections((s.data as ProjectSection[]) ?? [])
    const c: Record<string, Counts> = {}
    for (const row of tsk.data ?? []) {
      c[row.project_id] ??= { total: 0, done: 0 }
      c[row.project_id].total++
      if (row.status === 'done') c[row.project_id].done++
    }
    setCounts(c)
    setLoaded(true)
  }

  useEffect(() => {
    load()
  }, [])

  const createProject = async (e: FormEvent) => {
    e.preventDefault()
    if (!session || !name.trim()) return
    const color = PALETTE[projects.length % PALETTE.length]
    const { error } = await supabase.from('projects').insert({
      name: name.trim(),
      description: description.trim(),
      color,
      created_by: session.user.id,
    })
    if (error) {
      alert(error.message)
      return
    }
    setName('')
    setDescription('')
    setShowForm(false)
    load()
  }

  const createSection = async (e: FormEvent) => {
    e.preventDefault()
    if (!session || !newSection.trim()) return
    const { error } = await supabase.from('project_sections').insert({
      name: newSection.trim(),
      created_by: session.user.id,
    })
    if (error) alert(error.message)
    setNewSection('')
    setShowSectionForm(false)
    load()
  }

  const renameSection = async (section: ProjectSection) => {
    const next = (sectionEdits[section.id] ?? section.name).trim()
    if (next && next !== section.name) {
      await supabase.from('project_sections').update({ name: next }).eq('id', section.id)
      load()
    }
    setSectionEdits((s) => {
      const { [section.id]: _, ...rest } = s
      return rest
    })
  }

  const deleteSection = async (section: ProjectSection) => {
    if (!confirm(t('confirmDeleteSection'))) return
    await supabase.from('project_sections').delete().eq('id', section.id)
    load()
  }

  const moveToSection = async (project: Project, sectionId: string) => {
    await supabase.from('projects').update({ section_id: sectionId || null }).eq('id', project.id)
    load()
  }

  const groupProjects = (sectionId: string | null) =>
    projects.filter((p) => p.section_id === sectionId).sort((a, b) => a.position - b.position)

  // Single drag context across all sections: dropping on a project inserts
  // next to it (moving sections if needed); dropping on a section's empty
  // area appends to that section.
  const onDragEnd = async (e: DragEndEvent) => {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const activeP = projects.find((x) => x.id === active.id)
    if (!activeP) return

    let targetSec: string | null
    let newPos: number

    if (String(over.id).startsWith('sec:')) {
      targetSec = over.id === 'sec:none' ? null : String(over.id).slice(4)
      if (targetSec === activeP.section_id) return
      const group = groupProjects(targetSec)
      newPos = group.length ? Math.max(...group.map((p) => p.position)) + 1 : 0
    } else {
      const overP = projects.find((x) => x.id === over.id)
      if (!overP) return
      targetSec = overP.section_id
      if (targetSec === activeP.section_id) {
        const group = groupProjects(targetSec)
        const oldIndex = group.findIndex((x) => x.id === active.id)
        const newIndex = group.findIndex((x) => x.id === over.id)
        if (oldIndex < 0 || newIndex < 0) return
        const reordered = arrayMove(group, oldIndex, newIndex)
        const before = reordered[newIndex - 1]?.position
        const after = reordered[newIndex + 1]?.position
        newPos =
          before !== undefined && after !== undefined
            ? (before + after) / 2
            : before !== undefined
              ? before + 1
              : after !== undefined
                ? after - 1
                : 0
      } else {
        newPos = overP.position - 0.5
      }
    }

    setProjects((ps) => ps.map((x) => (x.id === active.id ? { ...x, position: newPos, section_id: targetSec } : x)))
    await supabase.from('projects').update({ position: newPos, section_id: targetSec }).eq('id', active.id)
  }

  const ungrouped = useMemo(() => groupProjects(null), [projects])

  if (!loaded) return <p className="text-slate-400">{t('loading')}</p>

  const SectionDrop = ({ sectionId, children }: { sectionId: string | null; children: ReactNode }) => {
    const { setNodeRef, isOver } = useDroppable({ id: `sec:${sectionId ?? 'none'}` })
    return (
      <div ref={setNodeRef} className={isOver ? 'rounded-xl ring-2 ring-indigo-800' : ''}>
        {children}
      </div>
    )
  }

  const renderGroup = (sectionId: string | null, group: Project[]) => (
    <SectionDrop sectionId={sectionId}>
      <SortableContext items={group.map((x) => x.id)} strategy={rectSortingStrategy}>
        <div className="grid min-h-14 gap-3 sm:grid-cols-2">
          {group.map((p) => (
            <ProjectCard
              key={p.id}
              project={p}
              counts={counts[p.id] ?? { total: 0, done: 0 }}
              sections={sections}
              admin={admin}
              onMove={moveToSection}
            />
          ))}
        </div>
      </SortableContext>
    </SectionDrop>
  )

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold">{t('projects')}</h1>
        {admin && (
          <div className="flex gap-2">
            <button
              onClick={() => setShowSectionForm(!showSectionForm)}
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm font-medium text-slate-300 hover:bg-slate-800"
            >
              + {t('newSection')}
            </button>
            <button
              onClick={() => setShowForm(!showForm)}
              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700"
            >
              + {t('newProject')}
            </button>
          </div>
        )}
      </div>

      {showSectionForm && (
        <form onSubmit={createSection} className="flex gap-2 rounded-xl border border-slate-700 bg-slate-900 p-3 shadow-sm">
          <input
            autoFocus
            required
            value={newSection}
            onChange={(e) => setNewSection(e.target.value)}
            placeholder={t('sectionName')}
            className="flex-1 rounded-lg border border-slate-600 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          />
          <button className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700">
            {t('create')}
          </button>
        </form>
      )}

      {showForm && (
        <form onSubmit={createProject} className="space-y-2 rounded-xl border border-slate-700 bg-slate-900 p-4 shadow-sm">
          <input
            autoFocus
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('projectName')}
            className="w-full rounded-lg border border-slate-600 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t('projectDescription')}
            rows={2}
            className="w-full rounded-lg border border-slate-600 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          />
          <div className="flex gap-2">
            <button className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700">
              {t('create')}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-lg px-4 py-1.5 text-sm text-slate-400 hover:bg-slate-800"
            >
              {t('cancel')}
            </button>
          </div>
        </form>
      )}

      {projects.length === 0 && !showForm && (
        <p className="rounded-xl border border-dashed border-slate-600 p-8 text-center text-sm text-slate-400">
          {t('noProjects')}
        </p>
      )}

      {sections.map((section) => {
        const group = groupProjects(section.id)
        return (
          <section key={section.id}>
            <div className="mb-2 flex items-center gap-2">
              {admin ? (
                <>
                  <input
                    value={sectionEdits[section.id] ?? section.name}
                    onChange={(e) => setSectionEdits((s) => ({ ...s, [section.id]: e.target.value }))}
                    onBlur={() => renameSection(section)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                    className="rounded-md border border-transparent bg-transparent text-sm font-bold text-slate-200 hover:border-slate-600 focus:border-indigo-400 focus:bg-slate-800 focus:outline-none"
                  />
                  <button onClick={() => deleteSection(section)} className="text-slate-600 hover:text-red-500">✕</button>
                </>
              ) : (
                <h2 className="text-sm font-bold text-slate-200">{section.name}</h2>
              )}
              <span className="text-xs text-slate-400">({group.length})</span>
            </div>
            {renderGroup(section.id, group)}
          </section>
        )
      })}

      {(ungrouped.length > 0 || sections.length > 0) && (
        <section>
          {sections.length > 0 && (
            <h2 className="mb-2 text-sm font-bold text-slate-400">
              {t('noSection')} <span className="text-xs font-normal text-slate-400">({ungrouped.length})</span>
            </h2>
          )}
          {renderGroup(null, ungrouped)}
        </section>
      )}
    </div>
    </DndContext>
  )
}
