-- Assignment Office — initial schema
-- Hierarchy: projects → tasks → subtasks (tasks with parent_id)

-- ─────────────────────────────────────────────
-- Profiles (one row per auth user)
-- ─────────────────────────────────────────────
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  role text not null default 'member' check (role in ('admin', 'member')),
  created_at timestamptz not null default now()
);

-- Auto-create a profile when a user signs up.
-- First user to sign up becomes admin.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    case when not exists (select 1 from public.profiles) then 'admin' else 'member' end
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─────────────────────────────────────────────
-- Projects
-- ─────────────────────────────────────────────
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  color text not null default '#6366f1',
  archived boolean not null default false,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

-- ─────────────────────────────────────────────
-- Tasks (parent_id null = task, set = subtask)
-- ─────────────────────────────────────────────
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  parent_id uuid references public.tasks (id) on delete cascade,
  title text not null,
  description text not null default '',
  status text not null default 'todo'
    check (status in ('todo', 'in_progress', 'in_review', 'blocked', 'done')),
  priority text not null default 'normal'
    check (priority in ('urgent', 'high', 'normal', 'low')),
  assignee_id uuid references public.profiles (id) on delete set null,
  due_date date,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index tasks_project_idx on public.tasks (project_id);
create index tasks_assignee_idx on public.tasks (assignee_id);
create index tasks_parent_idx on public.tasks (parent_id);

create or replace function public.touch_task()
returns trigger language plpgsql as $$
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

create trigger on_task_update before update on public.tasks
  for each row execute function public.touch_task();

-- ─────────────────────────────────────────────
-- Comments
-- ─────────────────────────────────────────────
create table public.comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  author_id uuid not null references public.profiles (id),
  body text not null,
  created_at timestamptz not null default now()
);

create index comments_task_idx on public.comments (task_id);

-- ─────────────────────────────────────────────
-- Activity log (who did what on a task)
-- ─────────────────────────────────────────────
create table public.activity (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  actor_id uuid not null references public.profiles (id),
  action text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index activity_task_idx on public.activity (task_id);

-- ─────────────────────────────────────────────
-- Notifications (in-app)
-- ─────────────────────────────────────────────
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  task_id uuid references public.tasks (id) on delete cascade,
  type text not null,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create index notifications_user_idx on public.notifications (user_id, read);

-- ─────────────────────────────────────────────
-- Row Level Security
-- Small-team model: every signed-in member can see all
-- projects/tasks/comments. Deletes are restricted to the
-- creator or an admin. Notifications are private.
-- ─────────────────────────────────────────────
alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.tasks enable row level security;
alter table public.comments enable row level security;
alter table public.activity enable row level security;
alter table public.notifications enable row level security;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- profiles
create policy "profiles are readable by team" on public.profiles
  for select to authenticated using (true);
create policy "users update own profile" on public.profiles
  for update to authenticated using (id = auth.uid());
create policy "admins update any profile" on public.profiles
  for update to authenticated using (public.is_admin());

-- projects
create policy "projects readable" on public.projects
  for select to authenticated using (true);
create policy "projects insert" on public.projects
  for insert to authenticated with check (created_by = auth.uid());
create policy "projects update" on public.projects
  for update to authenticated using (true);
create policy "projects delete" on public.projects
  for delete to authenticated using (created_by = auth.uid() or public.is_admin());

-- tasks
create policy "tasks readable" on public.tasks
  for select to authenticated using (true);
create policy "tasks insert" on public.tasks
  for insert to authenticated with check (created_by = auth.uid());
create policy "tasks update" on public.tasks
  for update to authenticated using (true);
create policy "tasks delete" on public.tasks
  for delete to authenticated using (created_by = auth.uid() or public.is_admin());

-- comments
create policy "comments readable" on public.comments
  for select to authenticated using (true);
create policy "comments insert" on public.comments
  for insert to authenticated with check (author_id = auth.uid());
create policy "comments delete" on public.comments
  for delete to authenticated using (author_id = auth.uid() or public.is_admin());

-- activity
create policy "activity readable" on public.activity
  for select to authenticated using (true);
create policy "activity insert" on public.activity
  for insert to authenticated with check (actor_id = auth.uid());

-- notifications
create policy "notifications read own" on public.notifications
  for select to authenticated using (user_id = auth.uid());
create policy "notifications insert" on public.notifications
  for insert to authenticated with check (actor_id = auth.uid());
create policy "notifications update own" on public.notifications
  for update to authenticated using (user_id = auth.uid());
