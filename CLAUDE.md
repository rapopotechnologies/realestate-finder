# Off-Market Finder

Florida tax deed auctions + HUD homes on a Zillow-style map. See README.md for setup, data sources and
operations.

- `app/`: Next.js 14 App Router, TypeScript, Tailwind + Radix (same stack as resume-optimizer). Deployed on
  Vercel, project `off-market-finder`, root directory `app`.
- `scraper/`: Python 3.11 + Playwright adapters (`omf/`), run daily by `.github/workflows/scrape.yml`.
- `supabase/migrations/`: Postgres + PostGIS schema, RLS, RPCs. Project ref `xpvdodiadtycfyismcpl`.

## Rooms

Three in-app rooms, same names and order in the header (desktop) and the bottom bar (phones):
Search `/search` (property pages belong to it), My List `/my-list`, Account `/account` (Admin lives here).
Defined once in `app/components/layout/nav-items.ts`. Don't add a fourth; put new things in a room.

## Design system

`ops/design-brief.md` is the source of truth for the look ("Plat, ink and seal"). Use the meaning-named tokens
(`plat`, `deed`, `hud`, `gain`, `alert`, each with `-soft`) and never ad-hoc Tailwind palette colors. h1/h2 are
Fraunces automatically; record IDs use `RecordId` (mono). One of each: `Section`, `Stat`, `EmptyState`
(`components/ui`), `SourceBadge` / `Countdown` / `RecordId` (`components/property/badges.tsx`), `PropertyCard`.

## Code style: descriptive, simple, efficient

Write every change the way a very senior engineer would; `/ponytail` applies the full checklist to existing code.

- **Descriptive:** domain names (`openAuction`, `nalMatchRate`), one job per function, comments only for *why*.
- **Simple:** fewest moving parts; reuse `lib/format.ts`, `lib/deal.ts`, `lib/search/state.ts`, `components/ui`,
  `omf/http.py`, `omf/db.py` before adding helpers; early returns; no dead code, unused options or debug output;
  match the surrounding file's idioms.
- **Efficient:** set-based SQL / RPCs over row-by-row calls, batch network requests, select only needed columns,
  no requests inside render loops; name the cost when optimizing.
- **Never trade away:** RLS and grants, server-only keys out of client code, the Google monthly cap, scraper
  politeness (1 req/s/host, retries, per-item error isolation), accessibility attributes.

## Checks before committing

- App: `cd app && npx tsc --noEmit && npm run lint && npm test` (stop `next dev` before `next build`; they share `.next`).
- Scraper: `cd scraper && .venv/bin/ruff check omf --select E,F,W --ignore E501`.

## Working notes

- Migrations: apply with the Supabase MCP `apply_migration`, then save the SQL as
  `supabase/migrations/<version>_<name>.sql` using the version `list_migrations` reports. Never edit an applied one.
  Regenerate or patch `app/lib/supabase/database.types.ts` after schema changes.
- Vercel connector (`plugin:vercel:vercel`) is bound to the team: call its tools without `teamId`/`slug`.
  The repo isn't linked to the project yet; deploy with `create_deployment` + `gitSource` (github,
  `rapopotechnologies/realestate-finder`, `main`).
- Secrets live in `app/.env.local`, `scraper/.env`, Vercel env and GitHub secrets. Never print or commit them.
- Test sign-in without email: a QA user + session cookie made with the service-role key (`auth.admin.generateLink`
  → `verifyOtp`), deleted afterwards. Activating counties is a side effect of searching: undo test activations.
