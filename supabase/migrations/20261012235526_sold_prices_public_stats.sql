-- What a tax deed actually sold for ("Auction Sold · $42,200 · 3rd Party Bidder"): the start of an
-- honest expected-price model, and of surplus (sale minus opening bid) data.
alter table public.auctions add column sold_amount numeric(14, 2);
alter table public.auctions add column sold_to text;            -- "3rd Party Bidder", "County", ...
alter table public.auctions add column sold_at timestamptz;
create index auctions_sold_idx on public.auctions (county_fips, sold_at) where sold_amount is not null;

-- Live, non-sensitive counts for the public landing page (no addresses, owners or prices).
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
    'upcoming_auctions', (select count(*) from public.auctions
                           where auction_date >= current_date and auction_date < current_date + 90
                             and lower(status) !~ '(redeem|cancel|sold|struck|withdr|bankrupt|postpon)'),
    'hud_homes', (select count(*) from public.hud_listings where status = 'active'),
    'updated_at', (select max(finished_at) from public.scrape_runs where status in ('ok', 'partial'))
  );
$$;
revoke execute on function public.public_stats() from public;
grant execute on function public.public_stats() to anon, authenticated;
