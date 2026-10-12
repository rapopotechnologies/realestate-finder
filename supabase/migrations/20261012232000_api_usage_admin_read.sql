-- Admins can see this month's Google usage on the scrape runs page
grant select on public.api_usage to authenticated;
create policy "admins read" on public.api_usage for select to authenticated using (public.is_admin());
