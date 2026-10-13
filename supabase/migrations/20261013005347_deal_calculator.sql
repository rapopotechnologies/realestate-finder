-- CRM phase 2: calculator inputs saved per deal, and what tax deeds actually sell for per county.
alter table public.saved_properties add column if not exists calc jsonb;

-- Winning bid as a multiple of the opening bid, from third-party sales in the county (the county's own
-- certificate "sales" are excluded). Null below 10 sales: too few to quote.
create or replace function public.auction_price_multiple(p_county_fips text)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select case when count(*) >= 10 then jsonb_build_object(
    'sales', count(*),
    'median', round(percentile_cont(0.5) within group (order by sold_amount / opening_bid)::numeric, 2),
    'p25', round(percentile_cont(0.25) within group (order by sold_amount / opening_bid)::numeric, 2),
    'p75', round(percentile_cont(0.75) within group (order by sold_amount / opening_bid)::numeric, 2),
    'since', min(auction_date)) end
  from auctions
  where county_fips = p_county_fips and sold_amount > 0 and opening_bid > 0
    and coalesce(sold_to, '') !~* 'county|certificate';
$$;

revoke execute on function public.auction_price_multiple(text) from public, anon;
grant execute on function public.auction_price_multiple(text) to authenticated;
