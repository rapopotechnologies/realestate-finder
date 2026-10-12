-- Off-Market Finder core schema.
-- Reference data (counties, boundaries, properties, listings) is written only by the
-- scraper with the service-role key, which bypasses RLS. Signed-in users can read it.
-- Per-user data (profiles, saved_properties, notes, contacts) is private to its owner.

create extension if not exists postgis with schema extensions;
create extension if not exists pg_trgm with schema extensions;

-- ── Shared helpers ───────────────────────────────────────────────────────────

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Parcel IDs compare without dashes, dots or spaces ("04-19-24-0002-000-08500" = "041924000200008500")
create or replace function public.normalize_parcel_id(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(upper(regexp_replace(coalesce(p, ''), '[^A-Za-z0-9]', '', 'g')), '');
$$;

-- ── Counties (coverage registry) ─────────────────────────────────────────────

create table public.counties (
  fips text primary key check (fips ~ '^\d{5}$'),
  state text not null check (state ~ '^[A-Z]{2}$'),
  county_name text not null,
  auction_platform text not null default 'unknown'
    check (auction_platform in ('realauction', 'other', 'unknown')),
  auction_base_url text,
  nal_county_code text,
  is_active boolean not null default false,
  activated_at timestamptz,
  last_scraped_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger counties_updated_at before update on public.counties
  for each row execute function public.set_updated_at();

-- ── Census boundaries ────────────────────────────────────────────────────────

create table public.boundaries (
  id bigint generated always as identity primary key,
  layer text not null check (layer in ('state', 'county', 'place', 'zcta')),
  geoid text not null,
  name text not null,
  -- What the search box shows: "Clermont, FL", "Lake County, FL", "34715"
  label text not null,
  state text,            -- 2-letter; for ZIPs, the state the ZIP mostly falls in
  state_fips text,
  geom extensions.geometry(MultiPolygon, 4326) not null,
  geom_simplified extensions.geometry(MultiPolygon, 4326) not null,
  centroid extensions.geometry(Point, 4326) not null,
  area_sq_mi double precision,
  created_at timestamptz not null default now(),
  unique (layer, geoid)
);
create index boundaries_geom_idx on public.boundaries using gist (geom);
create index boundaries_geom_simplified_idx on public.boundaries using gist (geom_simplified);
create index boundaries_label_trgm_idx on public.boundaries using gin (lower(label) extensions.gin_trgm_ops);
create index boundaries_layer_state_idx on public.boundaries (layer, state);

-- ── Properties and owners ────────────────────────────────────────────────────

create table public.properties (
  id uuid primary key default gen_random_uuid(),
  -- Stable key from the source: "parcel:<county_fips>:<parcel_id_norm>" or "hud:<case no>"
  source_key text not null unique,
  parcel_id text,
  parcel_id_norm text generated always as (public.normalize_parcel_id(parcel_id)) stored,
  county_fips text references public.counties (fips),
  address text,
  -- city / zip come from the spatial join when the point is known, otherwise from the source
  city text,
  state text not null default 'FL',
  zip text,
  place_geoid text,
  location extensions.geography(Point, 4326),
  location_unknown boolean not null default false,
  land_use_code text,
  land_use text,
  property_type text check (property_type in
    ('single_family', 'condo', 'townhouse', 'mobile_home', 'multi_family', 'vacant_land', 'commercial', 'agricultural', 'other')),
  beds numeric(4, 1),
  baths numeric(4, 1),
  sqft integer,
  lot_size_sqft numeric,
  year_built integer,
  market_value numeric(14, 2),
  assessed_value numeric(14, 2),
  last_sale_price numeric(14, 2),
  last_sale_date date,
  homestead boolean,
  appraiser_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index properties_location_idx on public.properties using gist (location);
create index properties_county_parcel_idx on public.properties (county_fips, parcel_id_norm);
create index properties_place_idx on public.properties (place_geoid);
create index properties_zip_idx on public.properties (zip);
create trigger properties_updated_at before update on public.properties
  for each row execute function public.set_updated_at();

-- Fill county / city / ZIP from the boundaries whenever the point changes
create or replace function public.properties_spatial_join()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  pt extensions.geometry;
  hit record;
begin
  if new.location is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.location is not distinct from old.location then
    return new;
  end if;
  pt := new.location::extensions.geometry;

  select b.geoid into hit from public.boundaries b
   where b.layer = 'county' and extensions.st_intersects(b.geom, pt) limit 1;
  if found and exists (select 1 from public.counties c where c.fips = hit.geoid) then
    new.county_fips := hit.geoid;
  end if;

  select b.geoid, b.name into hit from public.boundaries b
   where b.layer = 'place' and extensions.st_intersects(b.geom, pt) limit 1;
  if found then
    new.place_geoid := hit.geoid;
    new.city := hit.name;
  else
    new.place_geoid := null;  -- unincorporated: keep the source's postal city
  end if;

  select b.geoid into hit from public.boundaries b
   where b.layer = 'zcta' and extensions.st_intersects(b.geom, pt) limit 1;
  if found then
    new.zip := hit.geoid;
  end if;

  new.location_unknown := false;
  return new;
end;
$$;
create trigger properties_spatial_join before insert or update of location on public.properties
  for each row execute function public.properties_spatial_join();

create table public.owners (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null unique references public.properties (id) on delete cascade,
  name text not null,
  mailing_address text,
  mailing_city text,
  mailing_state text,
  mailing_zip text,
  owner_type text check (owner_type in ('individual', 'llc', 'corporation', 'trust', 'estate', 'government', 'other')),
  absentee boolean,
  out_of_state boolean,
  source text not null,          -- 'fl_dor_nal:2026', 'lake_pa'
  updated_at timestamptz not null default now()
);
create trigger owners_updated_at before update on public.owners
  for each row execute function public.set_updated_at();

-- ── Listings ─────────────────────────────────────────────────────────────────

create table public.auctions (
  id uuid primary key default gen_random_uuid(),
  property_id uuid references public.properties (id) on delete set null,
  county_fips text not null references public.counties (fips),
  case_no text not null,
  certificate_no text,
  auction_date date not null,
  auction_time text,
  opening_bid numeric(14, 2),
  status text not null,          -- as shown on the site: Scheduled, Redeemed, Canceled, Sold...
  status_detail text,            -- e.g. sold amount / winner type when shown
  parcel_id text,
  parcel_id_norm text generated always as (public.normalize_parcel_id(parcel_id)) stored,
  property_address text,
  auction_url text,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (county_fips, case_no)
);
create index auctions_property_idx on public.auctions (property_id);
create index auctions_date_idx on public.auctions (auction_date);
create index auctions_parcel_idx on public.auctions (county_fips, parcel_id_norm);
create trigger auctions_updated_at before update on public.auctions
  for each row execute function public.set_updated_at();

create table public.auction_status_history (
  id bigint generated always as identity primary key,
  auction_id uuid not null references public.auctions (id) on delete cascade,
  old_status text,
  new_status text not null,
  old_auction_date date,
  new_auction_date date,
  changed_at timestamptz not null default now()
);
create index auction_status_history_auction_idx on public.auction_status_history (auction_id, changed_at);

-- Every status (or date) change is logged here, whoever writes it
create or replace function public.log_auction_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.auction_status_history (auction_id, old_status, new_status, new_auction_date)
    values (new.id, null, new.status, new.auction_date);
  elsif new.status is distinct from old.status or new.auction_date is distinct from old.auction_date then
    insert into public.auction_status_history (auction_id, old_status, new_status, old_auction_date, new_auction_date)
    values (new.id, old.status, new.status, old.auction_date, new.auction_date);
  end if;
  return new;
end;
$$;
create trigger auctions_log_status after insert or update of status, auction_date on public.auctions
  for each row execute function public.log_auction_status();

create table public.hud_listings (
  id uuid primary key default gen_random_uuid(),
  property_id uuid references public.properties (id) on delete set null,
  hud_case_no text not null unique,
  list_price numeric(14, 2),
  listing_period text,
  bid_open_date date,
  bid_deadline timestamptz,
  fha_financing text,            -- HUD's code: IN (insured), IE (insured w/ escrow), UI (uninsured)
  fha_eligible boolean,
  eligible_203k boolean,
  broker_name text,
  broker_phone text,
  listing_url text,
  status text not null default 'active' check (status in ('active', 'under_contract', 'inactive')),
  raw jsonb,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index hud_listings_property_idx on public.hud_listings (property_id);
create trigger hud_listings_updated_at before update on public.hud_listings
  for each row execute function public.set_updated_at();

create table public.photos (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties (id) on delete cascade,
  source text not null check (source in ('hud', 'streetview', 'satellite', 'placeholder')),
  source_url text,
  storage_path text,             -- ~1200px
  thumb_path text,               -- ~400px
  width integer,
  height integer,
  sort_order integer not null default 0,
  attribution text,
  created_at timestamptz not null default now(),
  unique (property_id, source, sort_order)
);

-- ── Scraper-internal tables (no client access) ───────────────────────────────

create table public.geocodes (
  normalized_address text primary key,
  lat double precision,
  lng double precision,
  match_quality text,            -- Census: Exact / Non_Exact / Tie / No_Match; or 'arcgis_centroid'
  matched_address text,
  source text not null default 'census',
  created_at timestamptz not null default now()
);

create table public.appraiser_cache (
  county_fips text not null,
  parcel_id_norm text not null,
  data jsonb not null,
  fetched_at timestamptz not null default now(),
  primary key (county_fips, parcel_id_norm)
);

create table public.nal_loads (
  county_fips text not null references public.counties (fips),
  tax_year integer not null,
  file_name text,
  rows_loaded integer,
  loaded_at timestamptz not null default now(),
  primary key (county_fips, tax_year)
);

create table public.scrape_runs (
  id bigint generated always as identity primary key,
  adapter text not null,
  county_fips text references public.counties (fips),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running' check (status in ('running', 'ok', 'partial', 'failed')),
  items_found integer not null default 0,
  items_upserted integer not null default 0,
  errors integer not null default 0,
  error_log jsonb not null default '[]'::jsonb,
  stats jsonb not null default '{}'::jsonb
);
create index scrape_runs_started_idx on public.scrape_runs (started_at desc);

-- ── Per-user data ────────────────────────────────────────────────────────────

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  last_search jsonb,
  is_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create table public.saved_properties (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  property_id uuid not null references public.properties (id) on delete cascade,
  status text not null default 'interested'
    check (status in ('interested', 'contacted', 'offer_made', 'passed')),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, property_id)
);
create trigger saved_properties_updated_at before update on public.saved_properties
  for each row execute function public.set_updated_at();

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  property_id uuid not null references public.properties (id) on delete cascade,
  body text not null check (length(body) between 1 and 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index notes_user_property_idx on public.notes (user_id, property_id, created_at desc);
create trigger notes_updated_at before update on public.notes
  for each row execute function public.set_updated_at();

-- Skip-trace results belong to whoever ran the lookup
create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  property_id uuid not null references public.properties (id) on delete cascade,
  phone text,
  email text,
  source text not null,
  retrieved_at timestamptz not null default now()
);
create index contacts_user_property_idx on public.contacts (user_id, property_id);

-- ── Row-level security ───────────────────────────────────────────────────────

alter table public.counties enable row level security;
alter table public.boundaries enable row level security;
alter table public.properties enable row level security;
alter table public.owners enable row level security;
alter table public.auctions enable row level security;
alter table public.auction_status_history enable row level security;
alter table public.hud_listings enable row level security;
alter table public.photos enable row level security;
alter table public.geocodes enable row level security;
alter table public.appraiser_cache enable row level security;
alter table public.nal_loads enable row level security;
alter table public.scrape_runs enable row level security;
alter table public.profiles enable row level security;
alter table public.saved_properties enable row level security;
alter table public.notes enable row level security;
alter table public.contacts enable row level security;

-- Signed-in users read reference data; nobody but the service role writes it
create policy "signed-in read" on public.counties for select to authenticated using (true);
create policy "signed-in read" on public.boundaries for select to authenticated using (true);
create policy "signed-in read" on public.properties for select to authenticated using (true);
create policy "signed-in read" on public.owners for select to authenticated using (true);
create policy "signed-in read" on public.auctions for select to authenticated using (true);
create policy "signed-in read" on public.auction_status_history for select to authenticated using (true);
create policy "signed-in read" on public.hud_listings for select to authenticated using (true);
create policy "signed-in read" on public.photos for select to authenticated using (true);
-- geocodes, appraiser_cache, nal_loads: RLS on with no policies = service role only

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select p.is_admin from public.profiles p where p.id = auth.uid()), false);
$$;

create policy "admins read" on public.scrape_runs for select to authenticated using (public.is_admin());

create policy "own profile read" on public.profiles for select to authenticated using (id = auth.uid());
create policy "own profile update" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
-- Users may only change last_search (never is_admin)
revoke update on public.profiles from authenticated, anon;
grant update (last_search) on public.profiles to authenticated;

create policy "own saved" on public.saved_properties for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own notes" on public.notes for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own contacts read" on public.contacts for select to authenticated using (user_id = auth.uid());
create policy "own contacts insert" on public.contacts for insert to authenticated with check (user_id = auth.uid());
create policy "own contacts delete" on public.contacts for delete to authenticated using (user_id = auth.uid());

-- Nothing is readable while signed out
revoke all on all tables in schema public from anon;
