-- Emails that become admins (scrape runs page) when they sign in. No API access at all.
create table public.admin_emails (
  email text primary key check (email = lower(email))
);
alter table public.admin_emails enable row level security;
revoke all on public.admin_emails from anon, authenticated;

insert into public.admin_emails (email) values ('rapopotechnologies@gmail.com');

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, is_admin)
  values (new.id, new.email, exists (select 1 from public.admin_emails a where a.email = lower(new.email)))
  on conflict (id) do nothing;
  return new;
end;
$$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- Already signed up? Promote now.
update public.profiles p set is_admin = true
  from public.admin_emails a where a.email = lower(p.email);
