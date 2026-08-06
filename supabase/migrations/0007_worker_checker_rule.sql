-- Spec v3.2: one tick when worker = checker, two ticks otherwise.
--  * Task: checker is the admin → tasks ASSIGNED TO an admin complete with
--    the single Done tick; everyone else's tasks need admin's Checked.
--  * Subtask: checker is the main task's assignee → subtasks assigned to
--    the main assignee themself complete with one tick; subtasks assigned
--    to anyone else (including an admin) need the main assignee's Checked.

create or replace function assignment_office.derive_task_status()
returns trigger language plpgsql set search_path = '' as $$
declare
  pa uuid;
  worker_is_checker boolean := false;
begin
  if tg_op = 'INSERT' and new.parent_id is null and assignment_office.is_admin() then
    new.approved := true;
  end if;
  if not new.tick_done then
    new.tick_checked := false;
  end if;

  if new.parent_id is null then
    worker_is_checker := new.assignee_id is not null and exists (
      select 1 from assignment_office.profiles
      where id = new.assignee_id and role = 'admin'
    );
  else
    select assignee_id into pa from assignment_office.tasks where id = new.parent_id;
    worker_is_checker := new.assignee_id is not null and new.assignee_id = pa;
  end if;

  new.status := case
    when new.tick_done and (new.tick_checked or worker_is_checker) then 'done'
    else 'in_progress'
  end;
  return new;
end;
$$;
