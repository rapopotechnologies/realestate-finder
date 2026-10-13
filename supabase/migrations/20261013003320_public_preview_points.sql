-- Landing-page preview: where upcoming listings are, rounded to ~1 km. No addresses, owners, IDs or prices.
create or replace function public.public_preview_points()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('lng', lng, 'lat', lat, 'source', source)), '[]'::jsonb)
  from (
    select distinct round(extensions.st_x(l.location::extensions.geometry)::numeric, 2) as lng,
                    round(extensions.st_y(l.location::extensions.geometry)::numeric, 2) as lat,
                    l.source
    from public.listings_feed l
    where not l.is_closed and l.location is not null and l.event_date < current_date + 90
    limit 2000
  ) p;
$$;
revoke execute on function public.public_preview_points() from public;
grant execute on function public.public_preview_points() to anon, authenticated;
