-- Admin-invite model: accounts are created by an admin with a username
-- (no real email needed). Usernames are stored on the profile; the login
-- form accepts username or email.

alter table assignment_office.profiles add column username text unique;

-- Backfill usernames for existing accounts from their email prefix
update assignment_office.profiles p
set username = split_part(u.email, '@', 1)
from auth.users u
where u.id = p.id and p.username is null;

-- Include username (from signup metadata) when creating profiles
create or replace function assignment_office.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into assignment_office.profiles (id, full_name, role, username)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    case when not exists (select 1 from assignment_office.profiles) then 'admin' else 'member' end,
    coalesce(nullif(new.raw_user_meta_data ->> 'username', ''), split_part(new.email, '@', 1))
  );
  return new;
end;
$$;
