-- Monthly cap on billable Google Maps image requests (Street View + satellite), counted per calendar month (UTC).
create table public.api_usage (
  month date not null,            -- first day of the month
  api text not null,
  requests integer not null default 0,
  primary key (month, api)
);
alter table public.api_usage enable row level security;
revoke all on public.api_usage from anon, authenticated;

-- Atomically take one request from this month's allowance. Returns false once the limit is reached.
-- Definer so signed-in users can count requests without being able to read or edit the table.
create or replace function public.use_api_quota(p_api text, p_limit integer)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  m date := date_trunc('month', now() at time zone 'utc')::date;
  used integer;
begin
  if auth.uid() is null then
    return false;
  end if;
  insert into public.api_usage (month, api, requests) values (m, p_api, 0)
  on conflict (month, api) do nothing;
  update public.api_usage set requests = requests + 1
   where month = m and api = p_api and requests < p_limit
  returning requests into used;
  return used is not null;
end;
$$;
revoke execute on function public.use_api_quota(text, integer) from public, anon;
grant execute on function public.use_api_quota(text, integer) to authenticated;
