-- Shared-project hardening: the Marketing Supabase project hosts other apps'
-- auth users. Restrict Assignment Office data to accounts that have an
-- assignment_office profile (i.e. our team), not merely any signed-in user.

create or replace function assignment_office.is_member()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from assignment_office.profiles where id = auth.uid());
$$;

alter policy "profiles readable by team" on assignment_office.profiles
  using (assignment_office.is_member());

alter policy "projects readable" on assignment_office.projects
  using (assignment_office.is_member());
alter policy "projects insert" on assignment_office.projects
  with check (created_by = auth.uid() and assignment_office.is_member());

alter policy "tasks readable" on assignment_office.tasks
  using (assignment_office.is_member());
alter policy "tasks insert" on assignment_office.tasks
  with check (created_by = auth.uid() and assignment_office.is_member());
alter policy "tasks update" on assignment_office.tasks
  using (assignment_office.is_member());

alter policy "comments readable" on assignment_office.comments
  using (assignment_office.is_member());
alter policy "comments insert" on assignment_office.comments
  with check (author_id = auth.uid() and assignment_office.is_member());

alter policy "activity readable" on assignment_office.activity
  using (assignment_office.is_member());
alter policy "activity insert" on assignment_office.activity
  with check (actor_id = auth.uid() and assignment_office.is_member());

alter policy "notifications insert" on assignment_office.notifications
  with check (actor_id = auth.uid() and assignment_office.is_member());
