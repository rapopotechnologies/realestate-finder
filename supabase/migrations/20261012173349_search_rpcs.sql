-- Listings feed, search RPCs, boundary loading and the photos bucket.

-- ── listings_feed: tax deed + HUD rows in one shape ──────────────────────────

create view public.listings_feed
with (security_invoker = true) as
with base as (
  select
    'tax_deed'::text as source,
    a.id as listing_id,
    a.property_id,
    a.opening_bid as price,
    a.auction_date as event_date,
    a.status as listing_status,
    -- Anything but an upcoming sale: redeemed, canceled, sold, struck off, withdrawn...
    (lower(a.status) ~ '(redeem|cancel|sold|struck|withdr|bankrupt|postpon)') as is_closed,
    a.county_fips as listing_county_fips,
    a.property_address as listing_address,
    a.case_no as ref_no,
    a.auction_url as listing_url,
    a.first_seen
  from public.auctions a
  union all
  select
    'hud', h.id, h.property_id, h.list_price, h.bid_deadline::date, h.status,
    h.status <> 'active', null, null, h.hud_case_no, h.listing_url, h.first_seen
  from public.hud_listings h
)
select
  b.*,
  p.parcel_id,
  coalesce(p.county_fips, b.listing_county_fips) as county_fips,
  coalesce(p.address, b.listing_address) as address,
  p.city,
  p.zip,
  p.place_geoid,
  p.location,
  coalesce(p.location_unknown, true) or p.location is null as location_unknown,
  p.property_type,
  p.land_use,
  p.beds,
  p.baths,
  p.sqft,
  p.lot_size_sqft,
  p.year_built,
  p.market_value,
  r.value_ratio,
  case when r.value_ratio is null then null
       else greatest(0, round(100 * (1 - least(r.value_ratio, 1))))::int end as deal_score,
  case when r.value_ratio is null then null
       when r.value_ratio < 0.15 then 'great'
       when r.value_ratio < 0.40 then 'good'
       else 'fair' end as deal_tier,
  (coalesce(p.sqft, 0) > 0 or p.year_built is not null
    or coalesce(p.property_type, '') not in ('', 'vacant_land')) as has_building
from base b
left join public.properties p on p.id = b.property_id
cross join lateral (
  select case when p.market_value > 0 and b.price is not null
              then round(b.price / p.market_value, 4) end as value_ratio
) r;

-- ── search_properties ────────────────────────────────────────────────────────
-- Area = a stored boundary (layer + geoid) or any GeoJSON polygon; or a point + radius.
-- With an area AND a radius, "include nearby": everything within radius_mi of the area.
-- filters: { sources: ["tax_deed","hud"], price_min, price_max, property_types: [...],
--            beds_min, has_building: bool, hide_closed: bool (default true) }
-- sort: deal | price_asc | price_desc | date | distance | newest

create or replace function public.search_properties(
  p_area_layer text default null,
  p_area_geoid text default null,
  p_area_geojson jsonb default null,
  p_lat double precision default null,
  p_lng double precision default null,
  p_radius_mi double precision default null,
  p_filters jsonb default '{}'::jsonb,
  p_sort text default 'deal',
  p_page integer default 1,
  p_page_size integer default 24
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public, extensions
as $$
declare
  g geometry;
  pt geography;
  radius_m double precision := coalesce(p_radius_mi, 0) * 1609.344;
  f jsonb := coalesce(p_filters, '{}'::jsonb);
  srcs text[] := case when jsonb_typeof(f->'sources') = 'array'
                      then array(select jsonb_array_elements_text(f->'sources')) end;
  types text[] := case when jsonb_typeof(f->'property_types') = 'array'
                       then array(select jsonb_array_elements_text(f->'property_types')) end;
  hide_closed boolean := coalesce((f->>'hide_closed')::boolean, true);
  size integer := least(greatest(coalesce(p_page_size, 24), 1), 100);
  off integer := (greatest(coalesce(p_page, 1), 1) - 1) * least(greatest(coalesce(p_page_size, 24), 1), 100);
  result jsonb;
begin
  if p_area_layer is not null and p_area_geoid is not null then
    select b.geom into g from boundaries b where b.layer = p_area_layer and b.geoid = p_area_geoid;
    if g is null then
      raise exception 'Unknown area %:%', p_area_layer, p_area_geoid using errcode = 'P0002';
    end if;
  elsif p_area_geojson is not null then
    g := st_setsrid(st_geomfromgeojson(p_area_geojson::text), 4326);
  elsif p_lat is not null and p_lng is not null then
    pt := st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography;
    if radius_m <= 0 then radius_m := 25 * 1609.344; end if;
  else
    raise exception 'Pass an area (layer + geoid, or GeoJSON) or a point' using errcode = '22023';
  end if;

  with matched as (
    select l.*,
      case when l.location is null then null
           when pt is not null then st_distance(l.location, pt) / 1609.344
           when radius_m > 0 then st_distance(l.location, g::geography) / 1609.344
      end as distance_mi
    from listings_feed l
    where
      (
        (pt is not null and st_dwithin(l.location, pt, radius_m))
        or (g is not null and radius_m > 0 and st_dwithin(l.location, g::geography, radius_m))
        or (g is not null and radius_m = 0 and st_covers(g, l.location::geometry))
        -- No point (vacant land, unmatched parcel): still list it when searching its county
        or (l.location is null and p_area_layer = 'county' and l.county_fips = p_area_geoid)
      )
      and (srcs is null or l.source = any (srcs))
      and (not hide_closed or not l.is_closed)
      and (f->>'price_min' is null or l.price >= (f->>'price_min')::numeric)
      and (f->>'price_max' is null or l.price <= (f->>'price_max')::numeric)
      and (types is null or l.property_type = any (types))
      and (f->>'beds_min' is null or l.beds >= (f->>'beds_min')::numeric)
      and (f->>'has_building' is null or l.has_building = (f->>'has_building')::boolean)
  ),
  ranked as (
    select m.*, row_number() over (order by
      case when p_sort = 'deal' then m.deal_score end desc nulls last,
      case when p_sort = 'price_asc' then m.price end asc nulls last,
      case when p_sort = 'price_desc' then m.price end desc nulls last,
      case when p_sort = 'distance' then m.distance_mi end asc nulls last,
      case when p_sort = 'newest' then m.first_seen end desc nulls last,
      m.event_date asc nulls last,
      m.listing_id) as ord
    from matched m
  ),
  page as (
    select r.* from ranked r where r.ord > off and r.ord <= off + size
  )
  select jsonb_build_object(
    'total', (select count(*) from matched),
    'page', greatest(coalesce(p_page, 1), 1),
    'page_size', size,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'listing_id', pg.listing_id,
        'source', pg.source,
        'property_id', pg.property_id,
        'price', pg.price,
        'event_date', pg.event_date,
        'listing_status', pg.listing_status,
        'is_closed', pg.is_closed,
        'address', pg.address,
        'city', pg.city,
        'zip', pg.zip,
        'county_fips', pg.county_fips,
        'county_name', c.county_name,
        'property_type', pg.property_type,
        'beds', pg.beds,
        'baths', pg.baths,
        'sqft', pg.sqft,
        'lot_size_sqft', pg.lot_size_sqft,
        'year_built', pg.year_built,
        'market_value', pg.market_value,
        'value_ratio', pg.value_ratio,
        'deal_score', pg.deal_score,
        'deal_tier', pg.deal_tier,
        'has_building', pg.has_building,
        'lat', st_y(pg.location::geometry),
        'lng', st_x(pg.location::geometry),
        'distance_mi', round(pg.distance_mi::numeric, 1),
        'thumb_path', ph.thumb_path,
        'photo_source', ph.source,
        'saved_status', sp.status
      ) order by pg.ord)
      from page pg
      left join counties c on c.fips = pg.county_fips
      left join lateral (
        select x.thumb_path, x.source from photos x
         where x.property_id = pg.property_id
         order by x.sort_order limit 1
      ) ph on true
      left join saved_properties sp on sp.property_id = pg.property_id and sp.user_id = auth.uid()
    ), '[]'::jsonb),
    -- Every mapped result (not just this page) for pins and clusters
    'points', coalesce((
      select jsonb_agg(jsonb_build_object(
        'listing_id', m.listing_id,
        'property_id', m.property_id,
        'source', m.source,
        'price', m.price,
        'deal_tier', m.deal_tier,
        'lat', st_y(m.location::geometry),
        'lng', st_x(m.location::geometry)
      ))
      from (select * from matched where location is not null limit 5000) m
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

-- ── suggest_places: search-box autocomplete ──────────────────────────────────

create or replace function public.suggest_places(q text)
returns table (
  layer text,
  geoid text,
  label text,
  state text,
  lat double precision,
  lng double precision,
  bbox double precision[]
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  with term as (select lower(trim(q)) as t)
  select b.layer, b.geoid, b.label, b.state,
         st_y(b.centroid), st_x(b.centroid),
         array[st_xmin(b.geom_simplified), st_ymin(b.geom_simplified),
               st_xmax(b.geom_simplified), st_ymax(b.geom_simplified)]
  from boundaries b, term
  where length(term.t) >= 2
    and (
      -- ZIP codes: prefix match only
      (term.t ~ '^\d+$' and b.layer = 'zcta' and b.geoid like term.t || '%')
      or (term.t !~ '^\d+$' and b.layer <> 'zcta' and (
            lower(b.label) like term.t || '%'
         or lower(b.label) like '% ' || term.t || '%'
         or lower(b.label) % term.t))
    )
  order by
    (lower(b.label) like term.t || '%') desc,
    similarity(lower(b.label), term.t) desc,
    case b.layer when 'place' then 1 when 'county' then 2 when 'zcta' then 3 else 4 end,
    b.area_sq_mi desc nulls last
  limit 10;
$$;

-- ── boundaries_in_view: outlines for what's on screen ────────────────────────

create or replace function public.boundaries_in_view(
  p_min_lng double precision,
  p_min_lat double precision,
  p_max_lng double precision,
  p_max_lat double precision,
  p_zoom integer,
  p_layer text
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public, extensions
as $$
declare
  env geometry := st_makeenvelope(p_min_lng, p_min_lat, p_max_lng, p_max_lat, 4326);
  -- Finer layers only once zoomed in far enough to read them
  min_zoom integer := case p_layer when 'county' then 0 when 'place' then 8 when 'zcta' then 9 else 0 end;
  tolerance double precision := case when p_zoom < 7 then 0.01 when p_zoom < 9 then 0.003 else 0 end;
  result jsonb;
begin
  if p_layer not in ('state', 'county', 'place', 'zcta') then
    raise exception 'Unknown layer %', p_layer using errcode = '22023';
  end if;
  if p_zoom < min_zoom then
    return jsonb_build_object('type', 'FeatureCollection', 'features', '[]'::jsonb, 'min_zoom', min_zoom);
  end if;

  with shapes as (
    select b.layer, b.geoid, b.name, b.label,
           case when tolerance > 0 then st_simplifypreservetopology(b.geom_simplified, tolerance)
                else b.geom_simplified end as g
    from boundaries b
    where b.layer = p_layer and b.geom_simplified && env
    limit 600
  ),
  counts as (
    select case p_layer when 'county' then l.county_fips
                        when 'place' then l.place_geoid
                        when 'zcta' then l.zip end as geoid,
           count(*) as n
    from listings_feed l
    where not l.is_closed
    group by 1
  )
  select jsonb_build_object(
    'type', 'FeatureCollection',
    'min_zoom', min_zoom,
    'features', coalesce(jsonb_agg(jsonb_build_object(
      'type', 'Feature',
      'id', s.geoid,
      'geometry', st_asgeojson(s.g, 5)::jsonb,
      'properties', jsonb_build_object(
        'layer', s.layer, 'geoid', s.geoid, 'name', s.name, 'label', s.label,
        'count', coalesce(c.n, 0))
    )), '[]'::jsonb)
  ) into result
  from shapes s left join counts c on c.geoid = s.geoid;

  return result;
end;
$$;

-- ── Coverage: which counties overlap an area, and start tracking them ────────
-- Writes counties.is_active, so it runs as definer, but it can only switch on
-- counties whose platform is supported; it never switches anything off.

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
    -- HUD is scraped per state; Florida is always on
    'hud', case when bool_or(c.state = 'FL') then 'tracked' else 'unsupported' end
  ) into result
  from counties c
  where c.fips in (select fips from hit);

  return result;
end;
$$;

-- "Data updated X hours ago" without exposing scrape_runs to everyone
create or replace function public.data_updated_at()
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select max(r.finished_at) from public.scrape_runs r where r.status in ('ok', 'partial');
$$;

-- ── Boundary loading (service role only) ─────────────────────────────────────
-- features: [{ layer, geoid, name, label, state, state_fips, geometry: <GeoJSON> }]

create or replace function public.upsert_boundaries(features jsonb)
returns integer
language plpgsql
security invoker
set search_path = public, extensions
as $$
declare
  n integer;
begin
  with input as (
    select
      f->>'layer' as layer, f->>'geoid' as geoid, f->>'name' as name, f->>'label' as label,
      f->>'state' as state, f->>'state_fips' as state_fips,
      st_multi(st_makevalid(st_setsrid(st_geomfromgeojson((f->'geometry')::text), 4326))) as g
    from jsonb_array_elements(features) f
  ),
  polys as (
    -- make_valid can return a GeometryCollection; keep the polygons
    select i.*, st_multi(st_collectionextract(i.g, 3)) as geom from input i
  )
  insert into boundaries (layer, geoid, name, label, state, state_fips, geom, geom_simplified, centroid, area_sq_mi)
  select p.layer, p.geoid, p.name, p.label, p.state, p.state_fips,
         p.geom,
         coalesce(st_multi(st_collectionextract(st_makevalid(st_simplifypreservetopology(p.geom, 0.0005)), 3)), p.geom),
         st_pointonsurface(p.geom),
         st_area(p.geom::geography) / 2589988.11
  from polys p
  where not st_isempty(p.geom)
  on conflict (layer, geoid) do update set
    name = excluded.name, label = excluded.label, state = excluded.state, state_fips = excluded.state_fips,
    geom = excluded.geom, geom_simplified = excluded.geom_simplified,
    centroid = excluded.centroid, area_sq_mi = excluded.area_sq_mi;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Re-run the county / city / ZIP join for every property (after loading boundaries)
create or replace function public.refresh_property_areas()
returns integer
language plpgsql
security invoker
set search_path = public, extensions
as $$
declare
  n integer;
begin
  -- The trigger only fires when a point changes, so join directly here
  update properties p set
    county_fips = coalesce((select b.geoid from boundaries b where b.layer = 'county' and st_intersects(b.geom, p.location::geometry)
                             and exists (select 1 from counties c where c.fips = b.geoid) limit 1), p.county_fips),
    place_geoid = (select b.geoid from boundaries b where b.layer = 'place' and st_intersects(b.geom, p.location::geometry) limit 1),
    city = coalesce((select b.name from boundaries b where b.layer = 'place' and st_intersects(b.geom, p.location::geometry) limit 1), p.city),
    zip = coalesce((select b.geoid from boundaries b where b.layer = 'zcta' and st_intersects(b.geom, p.location::geometry) limit 1), p.zip)
  where p.location is not null;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- ── Function permissions ─────────────────────────────────────────────────────

revoke execute on function public.search_properties(text, text, jsonb, double precision, double precision, double precision, jsonb, text, integer, integer) from public, anon;
revoke execute on function public.suggest_places(text) from public, anon;
revoke execute on function public.boundaries_in_view(double precision, double precision, double precision, double precision, integer, text) from public, anon;
revoke execute on function public.ensure_area_coverage(text, text, double precision, double precision, double precision) from public, anon;
revoke execute on function public.data_updated_at() from public, anon;
grant execute on function public.search_properties(text, text, jsonb, double precision, double precision, double precision, jsonb, text, integer, integer) to authenticated;
grant execute on function public.suggest_places(text) to authenticated;
grant execute on function public.boundaries_in_view(double precision, double precision, double precision, double precision, integer, text) to authenticated;
grant execute on function public.ensure_area_coverage(text, text, double precision, double precision, double precision) to authenticated;
grant execute on function public.data_updated_at() to authenticated;

revoke execute on function public.upsert_boundaries(jsonb) from public, anon, authenticated;
revoke execute on function public.refresh_property_areas() from public, anon, authenticated;
grant execute on function public.upsert_boundaries(jsonb) to service_role;
grant execute on function public.refresh_property_areas() to service_role;

revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

revoke all on public.listings_feed from anon;

-- ── Photos bucket (private; the app shows them via signed URLs) ──────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "signed-in read photos" on storage.objects for select to authenticated
  using (bucket_id = 'photos');
