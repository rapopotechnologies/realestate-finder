# Off-Market Finder

Find properties that don't show up on Zillow: **county tax deed auctions** (properties sold for unpaid
property taxes) and **HUD homes** (government-owned homes on hudhomestore.gov). Search by your location or
any city, ZIP, county or address; results show on a map with county / city / ZIP outlines next to a list of
cards. Each property has a detail page, tax deed properties show the owner's public contact information, and
you can save properties and track your outreach.

Florida at launch; sources are plug-in adapters so more counties, states and auction platforms can be added.

```
app/                 Next.js 14 web app (TypeScript, Tailwind, Radix UI) → Vercel
scraper/             Python 3.11 + Playwright scrapers → GitHub Actions, daily at 6:00 AM Eastern
supabase/migrations  Database schema (Postgres + PostGIS), row-level security, search functions
supabase/seed        Florida county registry
.github/workflows    scrape.yml (daily scrape), ci.yml (lint / types / tests)
```

## How it fits together

```
 county auction sites ─┐                                       ┌─ Next.js app (Vercel)
 hudhomestore.gov ─────┤  scraper (GitHub Actions, 6 AM ET)    │   signed-in users only (magic link)
 FL DOR tax roll (NAL) ┼──────── service-role key ──────────►  Supabase  ◄── anon key + user session
 Census geocoder ──────┤                                       │   Postgres + PostGIS, RLS on every table
 Lake County appraiser ┘                                       └─ Storage (HUD photos)
```

- **Everything is behind sign-in** (email + password, or an emailed magic link). Owner details are shown, so the only public pages are the landing and login
  pages. Every table has row-level security: reference data is read-only for signed-in users; saved
  properties, notes and contact lookups are private to each user.
- **The service-role key never reaches the browser.** Only the scraper (GitHub secret) uses it.
- **Coverage follows demand.** When someone searches an area, every supported county that really overlaps it
  is switched on (`counties.is_active`) and appears after the next daily run.

## Data sources

| Source | What we take | Adapter |
|---|---|---|
| RealAuction (`{county}.realtaxdeed.com`, or the combined `{county}.realforeclose.com`) | Tax deed auction days (this month + 3), every item's status, case #, certificate #, opening bid, parcel ID, address | `scraper/omf/adapters/realauction.py` (Playwright) |
| Florida DOR NAL tax roll (one CSV per county per year) | Owner, mailing address, land use, just (market) & assessed value, year built, living area, lot size, last sales, homestead | `scraper/omf/nal.py` |
| Lake County Property Appraiser | Bedrooms / bathrooms, and the fallback when a parcel isn't in NAL | `scraper/omf/adapters/lake_pa.py` |
| US Census batch geocoder | Map points for addresses | `scraper/omf/geocode.py` |
| FL DOR statewide parcel centroids (+ Lake / Orange / Polk parcel layers) | Map points for vacant land with no street number | `scraper/omf/geocode.py` |
| hudhomestore.gov | Listings by state: price, beds/baths, deadlines, FHA / 203(k), broker, photos | `scraper/omf/adapters/hud.py` |
| FL DOR statewide cadastral layer | Market value for HUD homes (parcel under the listing's point) | `scraper/omf/hud_values.py` |
| Census cartographic boundaries (1:500k) | State, county, city/town and ZIP (ZCTA) outlines | `scraper/omf/boundaries.py` |
| Google Street View (optional) | Photos for tax deed properties: metadata only is stored; images are fetched on demand and never saved (Google's terms) | `scraper/omf/photos.py`, `app/app/api/streetview` |

No data or photos come from Zillow, Redfin, Realtor.com or other listing sites. Every scraper waits at least one
second between requests to the same site, uses a normal browser user agent and retries with backoff; one bad
item is logged and skipped.

## Local setup

Requirements: Node 22+, Python 3.11.

```bash
# App
cd app
cp .env.example .env.local        # fill in the Supabase URL + anon key (see below)
npm install
npm run dev                       # http://localhost:3000

# Scraper
cd ../scraper
python3.11 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python -m playwright install chromium
cp .env.example .env              # SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (the secret key)
.venv/bin/python -m omf.run report
```

Checks: `npm run lint && npm run typecheck && npm test` in `app/`.

## Supabase setup (new project)

1. Create a project (US East is closest to Florida).
2. Apply the migrations in order: `npx supabase link --project-ref <ref>` then `npx supabase db push`
   (or paste each file from `supabase/migrations/` into the SQL editor, oldest first).
3. Load the county registry: run `supabase/seed/counties_fl.sql` in the SQL editor.
4. Load boundaries (needs the scraper `.env`): `.venv/bin/python -m omf.boundaries --state FL`
   (about 20 seconds: 67 counties, ~950 cities and towns, ~1,050 ZIPs).
5. **Authentication → URL Configuration:** set the Site URL to your production URL, and add redirect URLs for
   `http://localhost:3000/**`, your production URL `/**`, and previews
   (`https://off-market-finder-*-rapopotechnologies-projects.vercel.app/**`). Without these, magic links
   send people to the wrong place.
6. **Passwords:** people can sign in with a password once one is set. Sign-up is still by magic link (it
   confirms the email). An admin can set a password without any email from the Supabase dashboard
   (*Authentication → Users → … → Send password recovery*, or update the user with the service-role key).
7. **Admins:** emails in `public.admin_emails` become admins (the scrape runs page at `/admin`) when they sign
   in. Add one in the SQL editor: `insert into admin_emails values ('someone@example.com');`
   then `update profiles set is_admin = true where email = 'someone@example.com';` if they already signed up.

Current project: `xpvdodiadtycfyismcpl` (us-east-1).

## Environment variables

| Where | Variable | Notes |
|---|---|---|
| Vercel + `app/.env.local` | `NEXT_PUBLIC_SUPABASE_URL` | `https://<ref>.supabase.co` |
| | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon / publishable key (safe in the browser) |
| | `NEXT_PUBLIC_MAPTILER_KEY` | optional; without it the map uses OpenFreeMap |
| | `GOOGLE_MAPS_API_KEY` | optional, server only; Street View / satellite images |
| | `GOOGLE_MAPS_MONTHLY_LIMIT` | optional; monthly cap on Google image requests (default 10000) |
| | `SKIP_TRACE_PROVIDER`, `SKIP_TRACE_API_KEY` | optional, server only; "Find contact info" is off without them |
| GitHub secrets + `scraper/.env` | `SUPABASE_URL` | same URL |
| | `SUPABASE_SERVICE_ROLE_KEY` | the **secret** key (`sb_secret_…`) or legacy `service_role` key; never in the app |
| | `GOOGLE_MAPS_API_KEY` | optional; Street View availability checks |
| | `SKIP_TRACE_PROVIDER`, `SKIP_TRACE_API_KEY` | optional, reserved |

Never commit real keys; `.env`, `.env.local` and `scraper/.cache/` are git-ignored.

## GitHub Actions

**Daily scrape** (`.github/workflows/scrape.yml`): 6:00 AM New York time every day. GitHub's cron is UTC and has
no daylight saving, so it's scheduled at both 10:00 and 11:00 UTC and the run that isn't 6 AM in New York skips
itself. Add the repository secrets above under *Settings → Secrets and variables → Actions*. Run it by hand from
the Actions tab ("Daily scrape" → *Run workflow*), optionally for one step (`taxdeeds`, `hud`, `photos`) or
specific counties. A full run for five counties takes ~5 minutes plus photo copying for new HUD listings.

What a run does: for each active county, scrape auctions → match parcels to the newest DOR roll (Final, else
Preliminary; a newer roll is picked up as soon as DOR posts it) → Lake appraiser details → geocode new
properties → Street View check; then HUD for every state with an active county (listings that disappeared are
marked inactive); then copy new HUD photos into Storage. Each step writes a `scrape_runs` row (see `/admin`).

**CI** (`.github/workflows/ci.yml`): lint, type-check and tests for the app; lint for the scraper.

## Deploying (Vercel)

Project `off-market-finder` in team `rapopotechnologies-projects`, **Root Directory `app`**, framework Next.js.
Connect the GitHub repo (*Settings → Git*) so every push to `main` deploys. Set the environment variables above
for Production and Preview. Deployment Protection (Vercel Authentication) is on for preview URLs.

## Operating it

```bash
cd scraper
.venv/bin/python -m omf.run all                         # everything, like the daily job
.venv/bin/python -m omf.run taxdeeds --counties 12069   # one county (FIPS)
.venv/bin/python -m omf.run activate 12009 12011        # start tracking counties
.venv/bin/python -m omf.run report                      # auctions / matched / geocoded per county
```

Deal score: `value_ratio = price ÷ market value` (opening bid for tax deeds, list price for HUD).
"Great" < 15%, "Good" < 40%; `deal_score = 100 × (1 − ratio)`. HUD doesn't publish a market value, so
`omf/hud_values.py` takes the just value of the tax-roll parcel under each HUD listing (Florida DOR statewide
cadastral layer, matched on house number; ~88% of listings). HUD prices are usually near market value, so
they rarely earn a chip, but they show an estimated value and sort correctly.

## Adding a county

**On RealAuction** (already one of the 45 supported Florida counties): nothing to code. It switches on when
someone searches it, or run `python -m omf.run activate <fips>`. Results appear after the next daily run.

**On another platform** (`auction_platform` = `unknown` in `counties`, with a TODO in `notes`):

1. Write an adapter in `scraper/omf/adapters/` that subclasses `Adapter` (`adapters/base.py`):
   `discover()` lists work items (auction days), `fetch_details(item)` returns raw records,
   `normalize(record)` maps one to an `auctions` row (`county_fips`, `case_no`, `auction_date`,
   `opening_bid`, `status`, `parcel_id`, `property_address`, `auction_url`, …), and `save()` upserts.
   `run_adapter()` handles logging and per-item errors.
2. Add the platform value to the `counties.auction_platform` check constraint (migration), set the county's
   `auction_platform` / `auction_base_url`, and pick the adapter for that platform in `omf/run.py`.
3. Parcel matching, geocoding and photos work unchanged. If the county writes parcel IDs differently from the
   DOR roll, normalize them in the adapter. Add a parcel layer to `ARCGIS_PARCELS` in `geocode.py` only if the
   statewide centroid layer misses parcels.

## Adding a state

1. Boundaries: `python -m omf.boundaries --state GA` (any state code).
2. Counties: a seed like `supabase/seed/counties_fl.sql` for the new state (FIPS, name, platform, base URL).
   RealAuction also runs sites in other states (AZ, CO, NJ…). The adapter keeps calendar days labeled
   "Tax Deed"; for states that call them something else (Colorado: "Treasurer Deed"), add that label to the
   filter in `discover()` and the item-type check in `normalize()`, check the item fields, then mark the
   counties `realauction`.
3. Owner / property data: NAL is Florida-only. Write a loader with the same outputs as `omf/nal.py`
   (`find_parcels`, `to_property`, `to_owner`) for the state's tax roll or county appraiser exports, and
   choose it by state in `omf/enrich.py`.
4. HUD: automatic. The HUD adapter searches every state that has an active county.
5. `ensure_area_coverage` reports HUD as tracked only for Florida; widen the `bool_or(c.state = 'FL')` check
   in that function when you add a state.

## Google Maps usage cap

Street View and satellite images are fetched by the app's server route (`app/app/api/streetview`), which takes
one request from a monthly allowance (`api_usage` table, `use_api_quota()`) before each call to Google. At the
limit (`GOOGLE_MAPS_MONTHLY_LIMIT`, default 10,000 per calendar month, UTC) it stops calling Google and cards
show the placeholder until the 1st. This month's count is on `/admin`. The scraper's Street View *metadata*
checks are free and aren't counted. As a hard backstop, also set daily quotas in Google Cloud (APIs & Services
→ each API → Quotas): e.g. 330 requests/day for Street View Static API and 100/day for Maps Static API.

## Skip tracing ("Find contact info")

Off by default. To turn it on, implement `SkipTraceProvider` (`app/lib/skip-trace/types.ts`) for your vendor in
`app/lib/skip-trace/providers/`, register it in `app/lib/skip-trace/index.ts`, and set `SKIP_TRACE_PROVIDER`
and `SKIP_TRACE_API_KEY` in Vercel. Results are stored in `contacts` with their source and date, visible only to
the user who ran the lookup. The page reminds users to check the federal and Florida Do-Not-Call lists and
TCPA / Florida Telephone Solicitation Act rules before calling or texting.
