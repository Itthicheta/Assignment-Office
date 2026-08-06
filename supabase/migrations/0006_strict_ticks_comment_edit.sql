-- Spec v3.1 tick tightening + comment editing:
--  * Top-level tasks ALWAYS need the admin's Checked tick — the self-task
--    shortcut no longer applies to tasks (only to self-assigned subtasks).
--  * Done tick: strictly the assignee (+admin), tasks and subtasks alike.
--  * Checked tick: tasks → admin only; subtasks → main task's assignee + admin.
--  * Comment authors may edit their own comments.

-- Backfill: previously self-completed tasks keep their Done status
update assignment_office.tasks
set tick_checked = true
where parent_id is null and status = 'done' and tick_done and not tick_checked;

create or replace function assignment_office.derive_task_status()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' and new.parent_id is null and assignment_office.is_admin() then
    new.approved := true;
  end if;
  if not new.tick_done then
    new.tick_checked := false;
  end if;
  if new.parent_id is null then
    new.status := case when new.tick_done and new.tick_checked then 'done' else 'in_progress' end;
  else
    new.status := case
      when new.tick_done and (new.tick_checked or new.created_by = new.assignee_id) then 'done'
      else 'in_progress'
    end;
  end if;
  return new;
end;
$$;

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

  if new.approved is distinct from old.approved then
    raise exception 'Only an admin can approve or unapprove a task';
  end if;

  -- subtasks
  if old.parent_id is not null then
    select assignee_id into parent_assignee from assignment_office.tasks where id = old.parent_id;
    if parent_assignee = uid then
      -- main task's assignee manages subtasks, but the Done tick belongs
      -- to the subtask's assignee
      if new.tick_done is distinct from old.tick_done and old.assignee_id is distinct from uid then
        raise exception 'Only the subtask''s assignee or an admin can tick Done';
      end if;
      return new;
    end if;
    if old.assignee_id = uid then
      if new.tick_checked is distinct from old.tick_checked then
        raise exception 'Only the main task''s assignee or an admin can give the Checked tick';
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

  -- top-level: the Checked tick is admin-only, Done belongs to the assignee
  if new.tick_checked is distinct from old.tick_checked then
    raise exception 'Only an admin can give the Checked tick on a task';
  end if;

  if old.created_by = uid then
    if new.tick_done is distinct from old.tick_done and old.assignee_id is distinct from uid then
      raise exception 'Only the task''s assignee or an admin can tick Done';
    end if;
    if old.approved and new.title is distinct from old.title then
      raise exception 'Task is approved and locked — only an admin can rename it';
    end if;
    if new.assignee_id is distinct from old.assignee_id
       and new.assignee_id is not null and new.assignee_id <> uid then
      raise exception 'You can assign tasks only to yourself — an admin assigns to others';
    end if;
    return new;
  end if;

  if old.assignee_id = uid then
    if old.tick_checked then
      raise exception 'Task already approved — ask an admin to reopen it';
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

-- Comment authors can edit their own comments
create policy "comments update own" on assignment_office.comments
  for update to authenticated using (author_id = auth.uid());
