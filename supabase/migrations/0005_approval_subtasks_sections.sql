-- Spec v3:
--  * Task creation opens to all members (assign only to self or leave
--    unassigned); admin tasks auto-approve, member tasks need the admin's
--    approval tick. Approved tasks cannot be renamed or deleted (admin can).
--  * Subtasks become full two-tick items (done + checked + assignee).
--    Subtask control belongs to the MAIN task's assignee + admin.
--  * Project sections: admin groups projects and orders them.

-- ─────────────────────────────────────────────
-- Tasks: approval flag
-- ─────────────────────────────────────────────
alter table assignment_office.tasks
  add column approved boolean not null default false;

-- Existing tasks were all admin-created → approved
update assignment_office.tasks set approved = true;

-- Existing checklist-style subtasks completed with one tick: keep them done
-- under the new two-tick rule.
update assignment_office.tasks set tick_checked = true
where parent_id is not null and tick_done;

-- Derived status now uniform for tasks and subtasks; auto-approve
-- admin-created top-level tasks on insert.
create or replace function assignment_office.derive_task_status()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' and new.parent_id is null and assignment_office.is_admin() then
    new.approved := true;
  end if;
  if not new.tick_done then
    new.tick_checked := false;
  end if;
  new.status := case
    when new.tick_done and (new.tick_checked or new.created_by = new.assignee_id) then 'done'
    else 'in_progress'
  end;
  return new;
end;
$$;

-- Field-level enforcement, spec v3
create or replace function assignment_office.enforce_task_update()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  is_admin boolean;
  parent_assignee uuid;
begin
  if uid is null then
    return new;
  end if;

  select (role = 'admin') into is_admin from assignment_office.profiles where id = uid;
  if coalesce(is_admin, false) then
    return new;
  end if;

  -- the approval flag is admin-only
  if new.approved is distinct from old.approved then
    raise exception 'Only an admin can approve or unapprove a task';
  end if;

  -- subtasks: managed by the parent task's assignee; the subtask's own
  -- assignee may tick work done + edit description
  if old.parent_id is not null then
    select assignee_id into parent_assignee from assignment_office.tasks where id = old.parent_id;
    if parent_assignee = uid then
      return new;
    end if;
    if old.assignee_id = uid then
      if new.tick_checked is distinct from old.tick_checked then
        raise exception 'Only the main task''s assignee or an admin can give the approval tick';
      end if;
      if new.title is distinct from old.title
         or new.priority is distinct from old.priority
         or new.due_date is distinct from old.due_date
         or new.assignee_id is distinct from old.assignee_id
         or new.project_id is distinct from old.project_id
         or new.parent_id is distinct from old.parent_id
         or new.position is distinct from old.position then
        raise exception 'Only the main task''s assignee or an admin can change these fields';
      end if;
      return new;
    end if;
    raise exception 'Only the main task''s assignee or an admin can update this subtask';
  end if;

  -- top-level: creator edits freely, except rename-when-approved and
  -- assigning to a third party
  if old.created_by = uid then
    if old.approved and new.title is distinct from old.title then
      raise exception 'Task is approved and locked — only an admin can rename it';
    end if;
    if new.assignee_id is distinct from old.assignee_id
       and new.assignee_id is not null and new.assignee_id <> uid then
      raise exception 'You can assign tasks only to yourself — an admin assigns to others';
    end if;
    return new;
  end if;

  -- assignee of a top-level task: work tick + description only
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

-- Creation: any member may create a top-level task for self/unassigned;
-- subtasks only by the main task's assignee or admin.
create or replace function assignment_office.can_create_task(p_parent uuid, p_assignee uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select case
    when p_parent is null then
      assignment_office.is_member()
      and (assignment_office.is_admin() or p_assignee is null or p_assignee = auth.uid())
    else
      assignment_office.is_admin() or exists (
        select 1 from assignment_office.tasks p
        where p.id = p_parent and p.assignee_id = auth.uid()
      )
  end;
$$;

alter policy "tasks insert" on assignment_office.tasks
  with check (created_by = auth.uid() and assignment_office.can_create_task(parent_id, assignee_id));

drop function if exists assignment_office.can_create_task(uuid);

-- Deletion: admin always; creator only while unapproved; subtasks by the
-- main task's assignee.
create or replace function assignment_office.can_delete_task(p_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from assignment_office.tasks t
    left join assignment_office.tasks p on p.id = t.parent_id
    where t.id = p_id and (
      assignment_office.is_admin()
      or (t.parent_id is null and t.created_by = auth.uid() and not t.approved)
      or (t.parent_id is not null and p.assignee_id = auth.uid())
    )
  );
$$;

alter policy "tasks delete" on assignment_office.tasks
  using (assignment_office.can_delete_task(id));

-- ─────────────────────────────────────────────
-- Project sections + project ordering (admin-managed)
-- ─────────────────────────────────────────────
create table assignment_office.project_sections (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  position double precision not null default extract(epoch from now()),
  created_by uuid not null references assignment_office.profiles (id),
  created_at timestamptz not null default now()
);

alter table assignment_office.projects
  add column section_id uuid references assignment_office.project_sections (id) on delete set null,
  add column position double precision;

update assignment_office.projects set position = extract(epoch from created_at);
alter table assignment_office.projects alter column position set not null;
alter table assignment_office.projects alter column position set default extract(epoch from now());

alter table assignment_office.project_sections enable row level security;
create policy "sections readable" on assignment_office.project_sections
  for select to authenticated using (assignment_office.is_member());
create policy "sections admin insert" on assignment_office.project_sections
  for insert to authenticated with check (assignment_office.is_admin());
create policy "sections admin update" on assignment_office.project_sections
  for update to authenticated using (assignment_office.is_admin());
create policy "sections admin delete" on assignment_office.project_sections
  for delete to authenticated using (assignment_office.is_admin());

grant all on all tables in schema assignment_office to anon, authenticated, service_role;
