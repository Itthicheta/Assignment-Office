-- Multi-assignee tasks (shared Done tick), single-assignee subtasks.
--  * tasks.assignee_id (uuid) → tasks.assignee_ids (uuid[])
--  * Any assignee may tick Done; assignee list edited by creator/admin
--  * Members may now assign their created tasks to anyone (approval gate
--    still applies); subtasks limited to one assignee at the DB level
--  * Sole-admin-assignee tasks keep the one-tick completion

alter table assignment_office.tasks add column assignee_ids uuid[] not null default '{}';
update assignment_office.tasks set assignee_ids = array[assignee_id] where assignee_id is not null;

-- depth check + single-assignee subtasks
create or replace function assignment_office.check_task_depth()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.parent_id is not null and exists (
    select 1 from assignment_office.tasks where id = new.parent_id and parent_id is not null
  ) then
    raise exception 'Subtasks cannot have their own subtasks';
  end if;
  if new.parent_id is not null and coalesce(array_length(new.assignee_ids, 1), 0) > 1 then
    raise exception 'Subtasks can have only one assignee';
  end if;
  return new;
end;
$$;

-- derived status: worker = checker when the sole assignee is an admin
-- (tasks) or the subtask's assignee is one of the main task's assignees
create or replace function assignment_office.derive_task_status()
returns trigger language plpgsql set search_path = '' as $$
declare
  parent_ids uuid[];
  worker_is_checker boolean := false;
begin
  if tg_op = 'INSERT' and new.parent_id is null and assignment_office.is_admin() then
    new.approved := true;
  end if;
  if not new.tick_done then
    new.tick_checked := false;
  end if;

  if new.parent_id is null then
    worker_is_checker := coalesce(array_length(new.assignee_ids, 1), 0) = 1 and exists (
      select 1 from assignment_office.profiles
      where id = new.assignee_ids[1] and role = 'admin'
    );
  else
    select assignee_ids into parent_ids from assignment_office.tasks where id = new.parent_id;
    worker_is_checker := coalesce(array_length(new.assignee_ids, 1), 0) = 1
      and new.assignee_ids[1] = any(parent_ids);
  end if;

  new.status := case
    when new.tick_done and (new.tick_checked or worker_is_checker) then 'done'
    else 'in_progress'
  end;
  return new;
end;
$$;

-- field-level enforcement for the multi-assignee model
create or replace function assignment_office.enforce_task_update()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  is_admin boolean;
  parent_ids uuid[];
begin
  if uid is null then
    return new;
  end if;

  select (role = 'admin') into is_admin from assignment_office.profiles where id = uid;
  if coalesce(is_admin, false) then
    return new;
  end if;

  if new.approved is distinct from old.approved then
    raise exception 'Only an admin can approve or unapprove a task';
  end if;

  -- subtasks
  if old.parent_id is not null then
    select assignee_ids into parent_ids from assignment_office.tasks where id = old.parent_id;
    if uid = any(parent_ids) then
      -- main task's assignees manage subtasks; Done stays with the subtask's assignee
      if new.tick_done is distinct from old.tick_done and not (uid = any(old.assignee_ids)) then
        raise exception 'Only the subtask''s assignee or an admin can tick Done';
      end if;
      return new;
    end if;
    if uid = any(old.assignee_ids) then
      if new.tick_checked is distinct from old.tick_checked then
        raise exception 'Only the main task''s assignees or an admin can give the Checked tick';
      end if;
      if new.title is distinct from old.title
         or new.priority is distinct from old.priority
         or new.due_date is distinct from old.due_date
         or new.due_time is distinct from old.due_time
         or new.assignee_ids is distinct from old.assignee_ids
         or new.project_id is distinct from old.project_id
         or new.parent_id is distinct from old.parent_id
         or new.position is distinct from old.position then
        raise exception 'Only the main task''s assignees or an admin can change these fields';
      end if;
      return new;
    end if;
    raise exception 'Only the main task''s assignees or an admin can update this subtask';
  end if;

  -- top-level: Checked is admin-only, Done belongs to the assignees
  if new.tick_checked is distinct from old.tick_checked then
    raise exception 'Only an admin can give the Checked tick on a task';
  end if;

  if old.created_by = uid then
    if new.tick_done is distinct from old.tick_done and not (uid = any(old.assignee_ids)) then
      raise exception 'Only the task''s assignees or an admin can tick Done';
    end if;
    if old.approved and new.title is distinct from old.title then
      raise exception 'Task is approved and locked — only an admin can rename it';
    end if;
    return new;
  end if;

  if uid = any(old.assignee_ids) then
    if old.tick_checked then
      raise exception 'Task already approved — ask an admin to reopen it';
    end if;
    if new.title is distinct from old.title
       or new.priority is distinct from old.priority
       or new.due_date is distinct from old.due_date
       or new.due_time is distinct from old.due_time
       or new.assignee_ids is distinct from old.assignee_ids
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

-- creation: any member creates top-level tasks (assign anyone);
-- subtasks by the main task's assignees or admin
create or replace function assignment_office.can_create_task(p_parent uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select case
    when p_parent is null then assignment_office.is_member()
    else assignment_office.is_admin() or exists (
      select 1 from assignment_office.tasks p
      where p.id = p_parent and auth.uid() = any(p.assignee_ids)
    )
  end;
$$;

alter policy "tasks insert" on assignment_office.tasks
  with check (created_by = auth.uid() and assignment_office.can_create_task(parent_id));

drop function if exists assignment_office.can_create_task(uuid, uuid);

create or replace function assignment_office.can_delete_task(p_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from assignment_office.tasks t
    left join assignment_office.tasks p on p.id = t.parent_id
    where t.id = p_id and (
      assignment_office.is_admin()
      or (t.parent_id is null and t.created_by = auth.uid() and not t.approved)
      or (t.parent_id is not null and auth.uid() = any(p.assignee_ids))
    )
  );
$$;

create or replace function assignment_office.can_upload_attachment(p_project uuid, p_task uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select case
    when p_task is null then assignment_office.is_admin()
    else assignment_office.is_admin() or exists (
      select 1 from assignment_office.tasks t
      where (t.id = p_task and auth.uid() = any(t.assignee_ids))
         or (t.parent_id = p_task and auth.uid() = any(t.assignee_ids))
    )
  end;
$$;

-- used by the delete-account edge function
create or replace function assignment_office.remove_user_assignments(target uuid)
returns void language sql security definer set search_path = '' as $$
  update assignment_office.tasks
  set assignee_ids = array_remove(assignee_ids, target)
  where target = any(assignee_ids);
$$;

alter table assignment_office.tasks drop column assignee_id cascade;
create index tasks_assignee_ids_idx on assignment_office.tasks using gin (assignee_ids);
