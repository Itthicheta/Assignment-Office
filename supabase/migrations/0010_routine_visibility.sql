-- Routines: members see only their own; admin sees all.
-- (Editing rules already exist: creator while unapproved, admin always.)

drop policy "routines readable" on assignment_office.routines;
create policy "routines readable" on assignment_office.routines
  for select to authenticated using (
    assignment_office.is_admin() or assignee_id = auth.uid() or created_by = auth.uid()
  );

drop policy "completions readable" on assignment_office.routine_completions;
create policy "completions readable" on assignment_office.routine_completions
  for select to authenticated using (
    assignment_office.is_admin() or exists (
      select 1 from assignment_office.routines r
      where r.id = routine_id and (r.assignee_id = auth.uid() or r.created_by = auth.uid())
    )
  );
