# Assignment Office 📋

A central work-assignment platform for a small team — the admin assigns work,
the team executes and ticks it done, the admin checks and approves. Thai ⇄
English switchable UI, built for phone and desktop.

## How work flows (spec v2)

- **Hierarchy:** Projects → Tasks → Subtasks (checklist)
- **Dual-tick completion — status is derived, never picked:**
  - `tick_done` (work tick) — the assignee ticks when the work is finished
  - `tick_checked` (approval tick) — the task creator/admin ticks after checking
  - Both ticks → task is **Done** automatically; anything else is **In Progress**
  - Self-tasks (creator = assignee) complete with the single work tick
  - Ticked-but-unchecked tasks are highlighted amber ("waiting for check")
- **Statuses:** In Progress / Done only. **Priorities:** Normal / Urgent.
- **Creation is admin-only** for projects and tasks; members can add subtasks
  to tasks assigned to them, comment, and upload files.
- **Ordering:** project pages have one shared order (dragged by admin/project
  creator); My Tasks has a private per-user order. Both drag-and-drop.
- **Files:** attachments on projects and on tasks (Supabase Storage, 20 MB/file).
- **Routines:** admin-defined recurring work per person (days of week or days
  of month) with per-day completion ticks and visible history.
- **Calendar:** month view of task due dates (dot colored by project, with
  assignee) and routine occurrences (🔁, neutral style), with show/hide
  filters and a project color legend. Tap a day for its item list (mobile).
- **Accounts:** username + password created by the admin on the Team page —
  no emails needed. First-ever account became admin. Roles: Admin / Member.
- In-app realtime notifications: assigned / commented / finished-awaiting-check
  / returned / approved.

### Permission model (enforced in the database, not just the UI)

| Action | Admin | Member |
|---|---|---|
| See projects/tasks/files/routines/calendar | ✅ | ✅ |
| Create projects & tasks | ✅ | ❌ |
| Add subtasks / comment / upload files | ✅ | ✅ (subtasks on own tasks) |
| Work tick | ✅ | own assignments |
| Approval tick | ✅ any | only tasks they created |
| Edit task fields / reassign / delete | ✅ any | only tasks they created |
| Reorder project list | ✅ | only projects they created |
| Reorder My Tasks | own list | own list |
| Create/edit routines | ✅ | tick own occurrences only |
| Team page (accounts, roles) | ✅ | ❌ |

## Architecture

- **Frontend:** React + TypeScript + Vite + Tailwind CSS + dnd-kit
  → deployed on **Cloudflare Workers** (static assets, `wrangler.jsonc`)
- **Backend:** **Supabase** — lives in the shared *Marketing* project
  (`qtpwrwapbefczvqdfzes`), isolated inside the **`assignment_office`** schema
- Storage bucket `attachments` (private, signed URLs)
- Edge function `create-user` — admin-only account creation via service role
- All rules enforced via RLS + field-level triggers
  (see `supabase/migrations/`)

## Setup

### Supabase (already applied)

Migrations in `supabase/migrations/` are applied to the Marketing project.
One-time manual steps already done: expose `assignment_office` under
Dashboard → Settings → API → "Exposed schemas"; disable public sign-ups
(Authentication → Sign In / Providers).

### Local development

```bash
cp .env.example .env   # VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY
npm install
npm run dev
```

### Deploy (Cloudflare Workers)

Pushing to the production branch auto-builds via the connected Workers app
(`assignment-office`). Build command `npm run build`, deploy command
`npx wrangler deploy`; the two `VITE_*` variables are set as build variables
in the Cloudflare project settings.

## Roadmap ideas

LINE notifications (LINE Official Account + Messaging API: morning digest +
urgent pushes), dashboard/reports, project templates, task dependencies,
password self-service.
