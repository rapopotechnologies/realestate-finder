-- Search: "When" filter (auction / bid deadline within N days) and a count per source for the results line.
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
      and (f->>'within_days' is null or l.event_date <= current_date + (f->>'within_days')::int)
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
    'by_source', coalesce((select jsonb_object_agg(source, n) from (select source, count(*) n from matched group by 1) s), '{}'::jsonb),
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

revoke execute on function public.search_properties(text, text, jsonb, double precision, double precision, double precision, jsonb, text, integer, integer) from public, anon;
grant execute on function public.search_properties(text, text, jsonb, double precision, double precision, double precision, jsonb, text, integer, integer) to authenticated;
