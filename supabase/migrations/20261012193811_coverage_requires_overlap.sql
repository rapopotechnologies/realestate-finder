-- A county counts only if it really overlaps the search area, not if it merely shares a border.
create or replace function public.ensure_area_coverage(
  p_area_layer text default null,
  p_area_geoid text default null,
  p_lat double precision default null,
  p_lng double precision default null,
  p_radius_mi double precision default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare
  g geometry;
  result jsonb;
begin
  if auth.uid() is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;

  if p_area_layer is not null and p_area_geoid is not null then
    select b.geom into g from boundaries b where b.layer = p_area_layer and b.geoid = p_area_geoid;
  elsif p_lat is not null and p_lng is not null then
    g := st_buffer(st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography,
                   coalesce(p_radius_mi, 25) * 1609.344)::geometry;
  end if;
  if g is null then
    return jsonb_build_object('counties', '[]'::jsonb, 'hud', 'unsupported');
  end if;
  if p_area_layer is not null and coalesce(p_radius_mi, 0) > 0 then
    g := st_buffer(g::geography, p_radius_mi * 1609.344)::geometry;
  end if;

  with hit as (
    select c.fips from counties c
    join boundaries b on b.layer = 'county' and b.geoid = c.fips
    where st_intersects(b.geom, g)
      and (
        -- searching the county itself
        (p_area_layer = 'county' and b.geoid = p_area_geoid)
        -- or a real overlap: 0.5% of the county, or a quarter square mile
        or st_area(st_intersection(b.geom, g)::geography) / 2589988.11
           > least(0.25, 0.005 * coalesce(b.area_sq_mi, 1))
      )
  ),
  activated as (
    update counties c
       set is_active = true, activated_at = now()
     where c.fips in (select fips from hit)
       and c.auction_platform = 'realauction'
       and not c.is_active
    returning c.fips
  )
  select jsonb_build_object(
    'counties', coalesce(jsonb_agg(jsonb_build_object(
      'fips', c.fips,
      'name', c.county_name,
      'state', c.state,
      'newly_activated', c.fips in (select fips from activated),
      'status', case
        when c.auction_platform <> 'realauction' then 'unsupported'
        when c.fips in (select fips from activated) then 'starting'
        when c.last_scraped_at is null then 'starting'
        else 'tracked' end
    ) order by c.county_name), '[]'::jsonb),
    'hud', case when bool_or(c.state = 'FL') then 'tracked' else 'unsupported' end
  ) into result
  from counties c
  where c.fips in (select fips from hit);

  return result;
end;
$$;
revoke execute on function public.ensure_area_coverage(text, text, double precision, double precision, double precision) from public, anon;
grant execute on function public.ensure_area_coverage(text, text, double precision, double precision, double precision) to authenticated;

-- Undo activations made by the QA run before this fix (none of these were chosen by a user)
update public.counties set is_active = false, activated_at = null
 where fips in ('12083','12127','12101','12035','12053','12107','12057','12055','12093','12081')
   and last_scraped_at is null;
