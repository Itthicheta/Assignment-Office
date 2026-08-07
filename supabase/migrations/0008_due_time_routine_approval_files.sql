-- Spec v3.3:
--  * Optional time on deadlines (tasks & subtasks)
--  * Routines: members create their own (self-assigned) → admin approves →
--    locked; admin routines auto-approved by the client
--  * File uploads restricted: task files → task assignee, its subtask
--    assignees, or admin; project-level files → admin only

alter table assignment_office.tasks add column due_time time;

alter table assignment_office.routines add column approved boolean not null default false;
update assignment_office.routines set approved = true;

drop policy "routines admin insert" on assignment_office.routines;
create policy "routines insert" on assignment_office.routines
  for insert to authenticated with check (
    assignment_office.is_admin()
    or (created_by = auth.uid() and assignee_id = auth.uid() and not approved)
  );

drop policy "routines admin update" on assignment_office.routines;
create policy "routines update" on assignment_office.routines
  for update to authenticated
  using (assignment_office.is_admin() or (created_by = auth.uid() and not approved))
  with check (assignment_office.is_admin() or (created_by = auth.uid() and not approved));

drop policy "routines admin delete" on assignment_office.routines;
create policy "routines delete" on assignment_office.routines
  for delete to authenticated
  using (assignment_office.is_admin() or (created_by = auth.uid() and not approved));

create or replace function assignment_office.can_upload_attachment(p_project uuid, p_task uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select case
    when p_task is null then assignment_office.is_admin()
    else assignment_office.is_admin() or exists (
      select 1 from assignment_office.tasks t
      where (t.id = p_task and t.assignee_id = auth.uid())
         or (t.parent_id = p_task and t.assignee_id = auth.uid())
    )
  end;
$$;

alter policy "attachments insert" on assignment_office.attachments
  with check (uploaded_by = auth.uid() and assignment_office.can_upload_attachment(project_id, task_id));
