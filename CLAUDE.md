# CLAUDE.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

Guidelines above are from [multica-ai/andrej-karpathy-skills](https://github.com/multica-ai/andrej-karpathy-skills) (MIT), derived from Andrej Karpathy's observations on LLM coding pitfalls.

---

# Project: Assignment Office

Team work-assignment platform. The user is not a coder — explain in plain
language, avoid jargon, and never assume familiarity with tooling.
UI is Thai ⇄ English switchable; keep both translations in sync.

## Stack

- React + TypeScript + Vite + Tailwind v4 + dnd-kit
- Hosted on **Cloudflare Workers** static assets (`wrangler.jsonc`,
  `not_found_handling: single-page-application`). Do NOT add a
  `public/_redirects` file — it conflicts and breaks the deploy.
- Deploys automatically on push to `claude/team-work-assignment-platform-efub20`.
  Build `npm run build`, deploy `npx wrangler deploy`.
- Backend: Supabase project **Marketing** (`qtpwrwapbefczvqdfzes`), shared with
  other apps. All tables live in the **`assignment_office`** schema, which is
  set in the client (`db: { schema: 'assignment_office' }`) and listed under
  Exposed Schemas in the dashboard.

## Domain rules (enforced in the database, not just the UI)

- Hierarchy: projects → tasks → subtasks (max depth 2).
- **Status is derived, never selected.** `tick_done` (assignee) +
  `tick_checked` (task creator/admin) → status `done`. Self-tasks
  (creator = assignee) need only `tick_done`. A DB trigger computes this;
  never write `status` directly.
- Statuses: `in_progress` | `done`. Priorities: `normal` | `urgent`.
- Creating projects and top-level tasks is **admin-only**. Members may add
  subtasks to tasks assigned to them, comment, and upload files.
- Assignees cannot approve their own work or change title/assignee/due
  date/priority/position — the `enforce_task_update` trigger rejects it.
- Accounts are created by the admin (Team page → `create-user` edge function).
  Usernames map to synthetic `<username>@assignment.local` emails.
  No public sign-up.
- Ordering: `tasks.position` is the shared project order (admin/project
  creator drags); `my_task_order` is each user's private My Tasks order.

## Working agreements

- Keep client-side permission helpers in `src/lib/can.ts` in sync with the SQL
  triggers/policies. The database is the source of truth; the UI only mirrors it.
- Every schema change needs a file in `supabase/migrations/` AND to be applied
  to the live project — they must match.
- Old rows may reference removed values (e.g. pre-v2 statuses). `t()` falls
  back to the raw key rather than throwing; keep it that way.
- Run `npm run build` before pushing — it type-checks and is the same command
  Cloudflare runs.
