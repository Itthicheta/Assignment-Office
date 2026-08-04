-- Spec v2 rework:
--  * Dual-tick completion: tick_done (assignee) + tick_checked (creator/admin)
--    → status is DERIVED: both ticks (or one tick on self-tasks) = done
--  * Statuses reduced to in_progress / done; priorities to normal / urgent
--  * Task & project creation become admin-only; members may add subtasks
--    to tasks assigned to them
--  * position column for the shared project-page order (drag & drop)
--  * my_task_order: personal ordering for the My Tasks page
--  * attachments + storage bucket for file uploads
--  * routines + routine_completions for recurring work with history

-- ─────────────────────────────────────────────
-- Tasks: ticks, position, reduced enums
-- ─────────────────────────────────────────────
alter table assignment_office.tasks
  add column tick_done boolean not null default false,
  add column tick_checked boolean not null default false,
  add column position double precision;

update assignment_office.tasks set
  tick_done = (status in ('done', 'in_review')),
  tick_checked = (status = 'done'),
  status = case when status = 'done' then 'done' else 'in_progress' end,
  priority = case when priority = 'urgent' then 'urgent' else 'normal' end,
  position = extract(epoch from created_at);

alter table assignment_office.tasks alter column position set not null;
alter table assignment_office.tasks alter column position set default extract(epoch from now());
alter table assignment_office.tasks alter column status set default 'in_progress';

alter table assignment_office.tasks drop constraint tasks_status_check;
alter table assignment_office.tasks add constraint tasks_status_check
  check (status in ('in_progress', 'done'));
alter table assignment_office.tasks drop constraint tasks_priority_check;
alter table assignment_office.tasks add constraint tasks_priority_check
  check (priority in ('normal', 'urgent'));

-- Status is derived from ticks; runs FIRST among before-triggers (name order).
-- Subtasks are simple checklist items: tick_done alone completes them.
-- Self-tasks (creator = assignee) complete with the single work tick.
create or replace function assignment_office.derive_task_status()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.parent_id is not null then
    new.tick_checked := false;
    new.status := case when new.tick_done then 'done' else 'in_progress' end;
  else
    if not new.tick_done then
      new.tick_checked := false;
    end if;
    new.status := case
      when new.tick_done and (new.tick_checked or new.created_by = new.assignee_id) then 'done'
      else 'in_progress'
    end;
  end if;
  return new;
end;
$$;

create trigger task_a_derive_status before insert or update on assignment_office.tasks
  for each row execute function assignment_office.derive_task_status();

-- Rewritten field-level enforcement for the tick model
create or replace function assignment_office.enforce_task_update()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  is_admin boolean;
begin
  if uid is null then
    return new;
  end if;

  select (role = 'admin') into is_admin from assignment_office.profiles where id = uid;

  if coalesce(is_admin, false) or old.created_by = uid then
    return new;
  end if;

  -- subtasks: the parent task's creator or assignee may also update
  if old.parent_id is not null and exists (
    select 1 from assignment_office.tasks p
    where p.id = old.parent_id and (p.created_by = uid or p.assignee_id = uid)
  ) then
    return new;
  end if;

  -- the assignee: work tick + description only
  if old.assignee_id = uid then
    if old.tick_checked then
      raise exception 'Task already approved — ask the creator or an admin to reopen it';
    end if;
    if new.tick_checked is distinct from old.tick_checked then
      raise exception 'Only the task creator or an admin can give the approval tick';
    end if;
    if new.title is distinct from old.title
       or new.priority is distinct from old.priority
       or new.due_date is distinct from old.due_date
       or new.assignee_id is distinct from old.assignee_id
       or new.project_id is distinct from old.project_id
       or new.parent_id is distinct from old.parent_id
       or new.position is distinct from old.position then
      raise exception 'Only the task creator or an admin can change these fields';
    end if;
    return new;
  end if;

  raise exception 'You can only update tasks you created or are assigned to';
end;
$$;

-- Creation rules: top-level tasks are admin-only; subtasks may also be
-- added by the parent task's creator or assignee.
create or replace function assignment_office.can_create_task(p_parent uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select case
    when p_parent is null then assignment_office.is_admin()
    else assignment_office.is_admin() or exists (
      select 1 from assignment_office.tasks p
      where p.id = p_parent and (p.created_by = auth.uid() or p.assignee_id = auth.uid())
    )
  end;
$$;

alter policy "tasks insert" on assignment_office.tasks
  with check (created_by = auth.uid() and assignment_office.can_create_task(parent_id));

alter policy "projects insert" on assignment_office.projects
  with check (created_by = auth.uid() and assignment_office.is_admin());

-- ─────────────────────────────────────────────
-- Personal My Tasks ordering
-- ─────────────────────────────────────────────
create table assignment_office.my_task_order (
  user_id uuid not null references assignment_office.profiles (id) on delete cascade,
  task_id uuid not null references assignment_office.tasks (id) on delete cascade,
  position double precision not null,
  primary key (user_id, task_id)
);

alter table assignment_office.my_task_order enable row level security;
create policy "own order only" on assignment_office.my_task_order
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ─────────────────────────────────────────────
-- Attachments (files on projects and tasks)
-- ─────────────────────────────────────────────
create table assignment_office.attachments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references assignment_office.projects (id) on delete cascade,
  task_id uuid references assignment_office.tasks (id) on delete cascade,
  name text not null,
  path text not null,
  size bigint not null default 0,
  uploaded_by uuid not null references assignment_office.profiles (id),
  created_at timestamptz not null default now()
);

create index attachments_project_idx on assignment_office.attachments (project_id);
create index attachments_task_idx on assignment_office.attachments (task_id);

alter table assignment_office.attachments enable row level security;
create policy "attachments readable" on assignment_office.attachments
  for select to authenticated using (assignment_office.is_member());
create policy "attachments insert" on assignment_office.attachments
  for insert to authenticated with check (uploaded_by = auth.uid() and assignment_office.is_member());
create policy "attachments delete" on assignment_office.attachments
  for delete to authenticated using (uploaded_by = auth.uid() or assignment_office.is_admin());

-- Private storage bucket (20 MB per file)
insert into storage.buckets (id, name, public, file_size_limit)
values ('attachments', 'attachments', false, 20971520)
on conflict (id) do nothing;

create policy "attachments bucket read" on storage.objects
  for select to authenticated
  using (bucket_id = 'attachments' and assignment_office.is_member());
create policy "attachments bucket insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'attachments' and assignment_office.is_member());
create policy "attachments bucket delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'attachments' and (owner = auth.uid() or assignment_office.is_admin()));

-- ─────────────────────────────────────────────
-- Routines (recurring work) + per-day completion history
-- ─────────────────────────────────────────────
create table assignment_office.routines (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  assignee_id uuid not null references assignment_office.profiles (id) on delete cascade,
  repeat_type text not null check (repeat_type in ('weekly', 'monthly')),
  weekdays int[] not null default '{}',   -- 0 = Sunday … 6 = Saturday
  monthdays int[] not null default '{}',  -- 1 … 31
  active boolean not null default true,
  created_by uuid not null references assignment_office.profiles (id),
  created_at timestamptz not null default now()
);

create table assignment_office.routine_completions (
  routine_id uuid not null references assignment_office.routines (id) on delete cascade,
  on_date date not null,
  completed_by uuid not null references assignment_office.profiles (id),
  completed_at timestamptz not null default now(),
  primary key (routine_id, on_date)
);

alter table assignment_office.routines enable row level security;
alter table assignment_office.routine_completions enable row level security;

create policy "routines readable" on assignment_office.routines
  for select to authenticated using (assignment_office.is_member());
create policy "routines admin insert" on assignment_office.routines
  for insert to authenticated with check (assignment_office.is_admin());
create policy "routines admin update" on assignment_office.routines
  for update to authenticated using (assignment_office.is_admin());
create policy "routines admin delete" on assignment_office.routines
  for delete to authenticated using (assignment_office.is_admin());

create policy "completions readable" on assignment_office.routine_completions
  for select to authenticated using (assignment_office.is_member());
create policy "completions tick own" on assignment_office.routine_completions
  for insert to authenticated with check (
    completed_by = auth.uid() and (
      assignment_office.is_admin() or exists (
        select 1 from assignment_office.routines r
        where r.id = routine_id and r.assignee_id = auth.uid()
      )
    )
  );
create policy "completions untick" on assignment_office.routine_completions
  for delete to authenticated using (completed_by = auth.uid() or assignment_office.is_admin());

grant all on all tables in schema assignment_office to anon, authenticated, service_role;
