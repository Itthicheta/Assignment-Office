# Assignment Office 📋

A central work-assignment platform for a small team — assign tasks, track progress,
review completed work, and collaborate with comments. Thai ⇄ English switchable UI.

## Features (MVP)

- **Hierarchy:** Projects → Tasks → Subtasks (checklist)
- **Task lifecycle:** To Do → In Progress → In Review → Done (+ Blocked, Cancelled)
  - The **task creator reviews** work submitted as In Review — approve to Done or send back
- Assignee, due date (overdue highlighting), priority (Urgent/High/Normal/Low)
- **My Tasks** home: overdue / due today / upcoming, plus "Waiting for my review"
- **Projects** overview with progress bars; project view grouped by status
- Comments and per-task activity log
- In-app **notifications** with realtime updates (assigned / commented / review / returned / approved)
- Thai / English UI toggle (auto-detects browser language)
- Open sign-up: share the URL, the team registers; the **first account becomes admin**

### Permission model (enforced in the database, not just the UI)

| Who | Can |
|---|---|
| Anyone | Create tasks/subtasks anywhere, comment |
| Assignee | Change status (not Done/Cancelled), edit description, tick subtasks |
| Task creator | Everything incl. reassign, due date, priority, approve/cancel, delete |
| Admin | Everything, everywhere |

Deletions are restricted to creator/admin and logged. Assignees cannot approve
their own work or move their own deadlines — by design.

## Architecture

- **Frontend:** React + TypeScript + Vite + Tailwind CSS → deployed on **Cloudflare Pages**
- **Backend:** **Supabase** (auth, Postgres, realtime) — lives in the shared *Marketing*
  Supabase project, isolated inside a dedicated **`assignment_office` schema**
- All permissions enforced via Row Level Security + a field-level trigger
  (`supabase/migrations/0001_init.sql`)

## Setup

### 1. Supabase (already applied)

The schema in `supabase/migrations/0001_init.sql` has been applied to the
Marketing project (`qtpwrwapbefczvqdfzes`). One manual step is required once:

> **Dashboard → project *Marketing* → Settings → API → "Exposed schemas" → add `assignment_office`**

Without this, the API cannot reach the schema and the app will show errors.

### 2. Local development

```bash
cp .env.example .env   # fill in the values below
npm install
npm run dev
```

`.env`:

```
VITE_SUPABASE_URL=https://qtpwrwapbefczvqdfzes.supabase.co
VITE_SUPABASE_ANON_KEY=<the project's publishable (anon) key>
```

Find the key in Dashboard → Settings → API Keys (`sb_publishable_...`).

### 3. Deploy to Cloudflare (Workers with static assets)

The repo contains `wrangler.jsonc`, which serves the Vite build (`dist/`) as a
single-page app via Cloudflare Workers static assets.

1. Cloudflare Dashboard → **Workers & Pages → Create application →
   Continue with GitHub** → select this repository
2. Build command: `npm run build` · Deploy command: `npx wrangler deploy`
3. Under **Advanced settings → Build variables**, add
   `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
   (they are baked in at build time)
4. Deploy

The classic Cloudflare **Pages** flow also works (build output `dist`,
SPA fallback provided by `public/_redirects`).

### 4. First run

1. Open the deployed URL, create the first account — it becomes **admin**
2. Share the URL with the team; they sign up themselves
3. Create the first project and start assigning

## Roadmap (agreed phases)

- **Phase 2:** Kanban board, calendar view, dashboard, attachments,
  LINE notifications (via LINE Official Account + Messaging API — daily digest
  + instant pushes for important events), recurring tasks
- **Phase 3:** project templates, reports, workload view, task dependencies
