-- A tax deed is closed when its status says so (incl. "Bidder Walked Away") or its auction date has passed.
create or replace view public.listings_feed
with (security_invoker = true) as
with base as (
  select
    'tax_deed'::text as source,
    a.id as listing_id,
    a.property_id,
    a.opening_bid as price,
    a.auction_date as event_date,
    a.status as listing_status,
    (lower(a.status) ~ '(redeem|cancel|sold|struck|withdr|bankrupt|postpon|walk)' or a.auction_date < current_date) as is_closed,
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
revoke all on public.listings_feed from anon;

-- public_stats uses the same closed rule
create or replace function public.public_stats()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'tracked_counties', (select coalesce(jsonb_agg(c.county_name order by c.county_name), '[]'::jsonb)
                           from public.counties c where c.is_active and c.last_scraped_at is not null),
    'supported_counties', (select count(*) from public.counties where auction_platform = 'realauction'),
    'upcoming_auctions', (select count(*) from public.listings_feed where source = 'tax_deed' and not is_closed
                           and event_date < current_date + 90),
    'hud_homes', (select count(*) from public.hud_listings where status = 'active'),
    'updated_at', (select max(finished_at) from public.scrape_runs where status in ('ok', 'partial'))
  );
$$;
revoke execute on function public.public_stats() from public;
grant execute on function public.public_stats() to anon, authenticated;
