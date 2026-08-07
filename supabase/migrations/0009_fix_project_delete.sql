-- Fix: deleting a project failed because the task-deletion logger tried to
-- write an activity row referencing the project mid-cascade (already gone).
-- Skip logging when the parent project no longer exists.

create or replace function assignment_office.log_task_delete()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  if auth.uid() is not null and old.parent_id is null
     and exists (select 1 from assignment_office.projects where id = old.project_id) then
    insert into assignment_office.activity (project_id, task_id, actor_id, action, detail)
    values (old.project_id, null, auth.uid(), 'deleted', jsonb_build_object('title', old.title));
  end if;
  return old;
end;
$$;
