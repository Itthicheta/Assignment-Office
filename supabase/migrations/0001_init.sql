-- Assignment Office — initial schema
-- Lives in the dedicated "assignment_office" schema inside the shared
-- Supabase project, fully separated from other apps' tables.
--
-- NOTE: after applying, "assignment_office" must be added to
-- Dashboard → Settings → API → "Exposed schemas" (one-time manual step).
--
-- Hierarchy: projects → tasks → subtasks (tasks with parent_id, max depth 2)
--
-- Permission model (enforced here, not just in the UI):
--   create  : any signed-in member, anywhere
--   adjust  : assignee → status (not done/cancelled) + description
--             creator/admin → everything, incl. approve review, reassign, dates
--             subtasks → looser: parent's creator/assignee may also update
--   delete  : creator or admin only; top-level deletions are logged

create schema if not exists assignment_office;

grant usage on schema assignment_office to anon, authenticated, service_role;
alter default privileges for role postgres in schema assignment_office
  grant all on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema assignment_office
  grant all on routines to anon, authenticated, service_role;
alter default privileges for role postgres in schema assignment_office
  grant all on sequences to anon, authenticated, service_role;

-- ─────────────────────────────────────────────
-- Profiles (one row per auth user)
-- ─────────────────────────────────────────────
create table assignment_office.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  role text not null default 'member' check (role in ('admin', 'member')),
  created_at timestamptz not null default now()
);

-- Auto-create a profile when a user signs up. First user becomes admin.
create or replace function assignment_office.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into assignment_office.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    case when not exists (select 1 from assignment_office.profiles) then 'admin' else 'member' end
  );
  return new;
end;
$$;

create trigger on_auth_user_created_assignment_office
  after insert on auth.users
  for each row execute function assignment_office.handle_new_user();

-- ─────────────────────────────────────────────
-- Projects
-- ─────────────────────────────────────────────
create table assignment_office.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  color text not null default '#6366f1',
  archived boolean not null default false,
  created_by uuid not null references assignment_office.profiles (id),
  created_at timestamptz not null default now()
);

-- ─────────────────────────────────────────────
-- Tasks (parent_id null = task, set = subtask)
-- ─────────────────────────────────────────────
create table assignment_office.tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references assignment_office.projects (id) on delete cascade,
  parent_id uuid references assignment_office.tasks (id) on delete cascade,
  title text not null,
  description text not null default '',
  status text not null default 'todo'
    check (status in ('todo', 'in_progress', 'in_review', 'blocked', 'done', 'cancelled')),
  priority text not null default 'normal'
    check (priority in ('urgent', 'high', 'normal', 'low')),
  assignee_id uuid references assignment_office.profiles (id) on delete set null,
  due_date date,
  created_by uuid not null references assignment_office.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index tasks_project_idx on assignment_office.tasks (project_id);
create index tasks_assignee_idx on assignment_office.tasks (assignee_id);
create index tasks_parent_idx on assignment_office.tasks (parent_id);

-- Subtasks cannot have their own subtasks (max depth = 2)
create or replace function assignment_office.check_task_depth()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.parent_id is not null and exists (
    select 1 from assignment_office.tasks where id = new.parent_id and parent_id is not null
  ) then
    raise exception 'Subtasks cannot have their own subtasks';
  end if;
  return new;
end;
$$;

create trigger task_depth_check before insert or update on assignment_office.tasks
  for each row execute function assignment_office.check_task_depth();

-- Maintain updated_at / completed_at
create or replace function assignment_office.touch_task()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  if new.status = 'done' and old.status is distinct from 'done' then
    new.completed_at := now();
  elsif new.status <> 'done' then
    new.completed_at := null;
  end if;
  return new;
end;
$$;

create trigger task_touch before update on assignment_office.tasks
  for each row execute function assignment_office.touch_task();

-- Field-level permission enforcement on updates
create or replace function assignment_office.enforce_task_update()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  is_admin boolean;
begin
  -- service-role / server-side calls bypass
  if uid is null then
    return new;
  end if;

  select (role = 'admin') into is_admin from assignment_office.profiles where id = uid;

  -- admin and the task's creator may change anything
  if coalesce(is_admin, false) or old.created_by = uid then
    return new;
  end if;

  -- subtasks are looser: the parent task's creator or assignee may also update
  if old.parent_id is not null and exists (
    select 1 from assignment_office.tasks p
    where p.id = old.parent_id and (p.created_by = uid or p.assignee_id = uid)
  ) then
    return new;
  end if;

  -- the assignee may update status + description only
  if old.assignee_id = uid then
    if new.title is distinct from old.title
       or new.priority is distinct from old.priority
       or new.due_date is distinct from old.due_date
       or new.assignee_id is distinct from old.assignee_id
       or new.project_id is distinct from old.project_id
       or new.parent_id is distinct from old.parent_id then
      raise exception 'Only the task creator or an admin can change these fields';
    end if;
    if new.status is distinct from old.status and new.status in ('done', 'cancelled') then
      raise exception 'Only the task creator or an admin can approve or cancel a task';
    end if;
    return new;
  end if;

  raise exception 'You can only update tasks you created or are assigned to';
end;
$$;

create trigger task_enforce_update before update on assignment_office.tasks
  for each row execute function assignment_office.enforce_task_update();

-- ─────────────────────────────────────────────
-- Comments
-- ─────────────────────────────────────────────
create table assignment_office.comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references assignment_office.tasks (id) on delete cascade,
  author_id uuid not null references assignment_office.profiles (id),
  body text not null,
  created_at timestamptz not null default now()
);

create index comments_task_idx on assignment_office.comments (task_id);

-- ─────────────────────────────────────────────
-- Activity log
-- task_id is nullable + set-null so that deletion log
-- entries survive the deletion of the task itself.
-- ─────────────────────────────────────────────
create table assignment_office.activity (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references assignment_office.projects (id) on delete cascade,
  task_id uuid references assignment_office.tasks (id) on delete set null,
  actor_id uuid not null references assignment_office.profiles (id),
  action text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index activity_task_idx on assignment_office.activity (task_id);
create index activity_project_idx on assignment_office.activity (project_id);

-- Log top-level task deletions at project level
create or replace function assignment_office.log_task_delete()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  if auth.uid() is not null and old.parent_id is null then
    insert into assignment_office.activity (project_id, task_id, actor_id, action, detail)
    values (old.project_id, null, auth.uid(), 'deleted', jsonb_build_object('title', old.title));
  end if;
  return old;
end;
$$;

create trigger task_log_delete before delete on assignment_office.tasks
  for each row execute function assignment_office.log_task_delete();

-- ─────────────────────────────────────────────
-- Notifications (in-app)
-- ─────────────────────────────────────────────
create table assignment_office.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references assignment_office.profiles (id) on delete cascade,
  actor_id uuid references assignment_office.profiles (id) on delete set null,
  task_id uuid references assignment_office.tasks (id) on delete cascade,
  type text not null,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create index notifications_user_idx on assignment_office.notifications (user_id, read);

-- Realtime for the notification bell
alter publication supabase_realtime add table assignment_office.notifications;

-- Grants for the tables created above (default privileges cover future ones)
grant all on all tables in schema assignment_office to anon, authenticated, service_role;
grant all on all routines in schema assignment_office to anon, authenticated, service_role;
grant all on all sequences in schema assignment_office to anon, authenticated, service_role;

-- ─────────────────────────────────────────────
-- Row Level Security
-- Small-team model: every signed-in member can see all
-- projects/tasks/comments (agreed: full transparency).
-- Update rules are enforced by the trigger above.
-- ─────────────────────────────────────────────
alter table assignment_office.profiles enable row level security;
alter table assignment_office.projects enable row level security;
alter table assignment_office.tasks enable row level security;
alter table assignment_office.comments enable row level security;
alter table assignment_office.activity enable row level security;
alter table assignment_office.notifications enable row level security;

create or replace function assignment_office.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from assignment_office.profiles where id = auth.uid() and role = 'admin');
$$;

-- profiles
create policy "profiles readable by team" on assignment_office.profiles
  for select to authenticated using (true);
create policy "profiles update own" on assignment_office.profiles
  for update to authenticated using (id = auth.uid());
create policy "profiles update by admin" on assignment_office.profiles
  for update to authenticated using (assignment_office.is_admin());

-- projects
create policy "projects readable" on assignment_office.projects
  for select to authenticated using (true);
create policy "projects insert" on assignment_office.projects
  for insert to authenticated with check (created_by = auth.uid());
create policy "projects update" on assignment_office.projects
  for update to authenticated using (created_by = auth.uid() or assignment_office.is_admin());
create policy "projects delete" on assignment_office.projects
  for delete to authenticated using (created_by = auth.uid() or assignment_office.is_admin());

-- tasks (update details enforced by trigger)
create policy "tasks readable" on assignment_office.tasks
  for select to authenticated using (true);
create policy "tasks insert" on assignment_office.tasks
  for insert to authenticated with check (created_by = auth.uid());
create policy "tasks update" on assignment_office.tasks
  for update to authenticated using (true);
create policy "tasks delete" on assignment_office.tasks
  for delete to authenticated using (created_by = auth.uid() or assignment_office.is_admin());

-- comments
create policy "comments readable" on assignment_office.comments
  for select to authenticated using (true);
create policy "comments insert" on assignment_office.comments
  for insert to authenticated with check (author_id = auth.uid());
create policy "comments delete" on assignment_office.comments
  for delete to authenticated using (author_id = auth.uid() or assignment_office.is_admin());

-- activity
create policy "activity readable" on assignment_office.activity
  for select to authenticated using (true);
create policy "activity insert" on assignment_office.activity
  for insert to authenticated with check (actor_id = auth.uid());

-- notifications
create policy "notifications read own" on assignment_office.notifications
  for select to authenticated using (user_id = auth.uid());
create policy "notifications insert" on assignment_office.notifications
  for insert to authenticated with check (actor_id = auth.uid());
create policy "notifications update own" on assignment_office.notifications
  for update to authenticated using (user_id = auth.uid());
