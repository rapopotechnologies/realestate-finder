# Plan: what's next

Written 2026-10-12 (end of the remodel + CRM week). Picks up after the weekend. Background: `ops/remodel.md`
(rooms audit), `ops/strategy.md` (business), `ops/design-brief.md` (look).

## Where we are

Live at https://off-market-finder-nine.vercel.app: 5 counties (Lake, Orange, Osceola, Polk, Seminole), ~378 tax
deed auctions, 58 HUD homes, sold prices for ~140 past auctions. Remodel rows 1–6 done; My List is a deal pipeline
with a Today strip and calculators. One user (you).

## Before we start (you, ~20 min)

These unblock the steps below. Each one is a dashboard setting I can't change from here.

| # | Task | Where | Unblocks |
|---|---|---|---|
| U1 | Auth URL config: Site URL `https://off-market-finder-nine.vercel.app`; redirect URLs `http://localhost:3000/**`, `https://off-market-finder-nine.vercel.app/**`, `https://off-market-finder-*-rapopotechnologies-projects.vercel.app/**` | Supabase → Authentication → URL Configuration | Sign-up confirm, forgot password, email-link sign-in |
| U2 | Run **Daily scrape** once by hand and check it's green | GitHub → Actions → Daily scrape → Run workflow | Trusting the 6 AM job |
| U3 | Connect the repo to the Vercel project (auto-deploy on push) | Vercel → off-market-finder → Settings → Git | No more manual deploys |
| U4 | Resend: create an account, verify a sending domain (or use their test domain at first), add `RESEND_API_KEY` to Vercel (Production) | resend.com, Vercel env | Step 2 |
| U5 | Google Cloud daily quotas: Street View Static 330/day, Maps Static 100/day | Google Cloud → APIs → Quotas | Cost safety net (the app's 10k/month cap is already on) |
| U6 | Change the generated password in Account | the app | — |

## Step 1. Trust the numbers (1 session)

The calculators start the after-repair value at the county value, but winning bids run a median 1.1–2.4× county
value in these counties. Find out why before anything leans on it.

- Compare `properties.market_value` vs the DOR roll's just value, the latest qualified sale, and winning bids, per
  county and property type. Check that vacant land and partial parcels aren't skewing it.
- Decide the honest "value" to show (just value, last qualified sale adjusted by date, or a sold-multiple estimate),
  label it with its source, and use it as the calculator's after-repair value starting point.
- Bring back a **tax deed deal signal** based on real outcomes: expected winning bid (opening × county median) vs
  value, shown only when the county has 10+ sales.
- **Done when:** the property page and the calculator start from a value we can explain in one sentence, and a
  unit test pins the rule.

## Step 1b. Section 8 rents (1 session, needs U7)

Public HUD data, refreshed once a year by the scraper (no live calls from the app).

- Load HUD Small Area Fair Market Rents (by ZIP and bedrooms; FY rates take effect Oct 1) and county FMRs as the
  fallback outside metro areas, from the HUD USER FMR API, into a `fair_market_rents` table.
- Property page: "Section 8 rent: ~$X/mo (HUD Fair Market Rent, N-bedroom, ZIP Y)" plus the local housing authority
  with a link to its landlord page (HUD's public PHA list).
- Calculators: BRRRR and Rental prefill rent with it (labeled, editable).
- Search: "Section 8 rent ÷ price" sort and a minimum filter.
- Wording: the housing authority's payment standard (usually 90–110% of FMR) is the real cap, the unit must pass
  inspection and rent reasonableness, and a tenant isn't guaranteed. We never say "Section 8 approved".
- **Done when:** every property with a ZIP and bedroom count shows the figure, the rental calculator starts from it,
  and the sort works in Orange County.

U7 (you): free access token at huduser.gov → GitHub secret `HUD_USER_TOKEN`.

## Step 2. Reminders and alerts (1–2 sessions, needs U1 + U4)

People subscribe to being told, not to searching (strategy #2). This is the retention engine.

- **Follow-up digest:** one email at 7 AM ET listing today's and overdue follow-ups, plus your saved properties with
  an auction or bid deadline within 3 days. Sent only when there's something in it. Vercel Cron → `/api/cron/digest`
  (protected by `CRON_SECRET`), Resend for sending, `email_log` table so nobody gets the same email twice.
- **Status changes on saved properties:** "Redeemed", "Sold for $X", "Rescheduled to …", from
  `auction_status_history`, folded into the same digest.
- **Saved searches:** "Save this search" on the results line; the digest adds "3 new auctions in Orange County".
- Account room: email on/off and the digest time. One-click unsubscribe link in every email.
- **Done when:** a test user with seeded deals gets one correct digest, a second run sends nothing, and
  unsubscribe works.

## Step 3. Phone density and polish (remodel row 7, 1 session)

- S8: compact result cards on phones (thumbnail left, facts right) so 3–4 fit on a screen.
- Property page on phones: "Your deal" and "Run the numbers" directly under the header band, not at the bottom.
- X2 + P6: one glossary (`lib/glossary.ts`) for tax deed, redeemed, opening bid, county value, owner-occupant period,
  203(k); tooltips wherever those words appear.
- S10: multi-select property type chips; free-entry price.
- P5: copy link, Directions (Google Maps link), print-friendly property page for drive-bys.
- L4: export per stage.
- **Done when:** axe is clean at 375 / 768 / 1280 and the phone search shows 3+ cards per screen.

## Step 4. More inventory (1–2 sessions)

- Turn on more of the 45 RealAuction counties, Tampa Bay and South Florida first (Hillsborough, Pinellas, Pasco,
  Broward, Palm Beach, Miami-Dade). Time one full run; split the GitHub job per county group if it passes ~40 minutes.
- Start sold-price backfill for each new county (6 months) so their expected-bid estimate exists from day one.
- Fill the 22 counties marked `unknown` in `supabase/seed/counties_fl.sql` where a public list exists.
- **Done when:** 10+ counties tracked, the daily run is green, and the admin page shows each county's last scrape.

## Step 5. Get ready to charge (decision point)

Do not build billing until these are true:

- Legal read on scraping RealAuction / HUD / appraiser sites (their robots.txt and terms), Florida surplus-funds rules,
  and TCPA for owner outreach (strategy "weak spots").
- 5–10 real users have tried it; we've asked each "would you pay $29–49/month for this?".
- Then: Stripe plans from resume-optimizer (Free: 1 county, no owner info, 3 saved; Investor; Pro), gate owner info
  and alerts behind Investor.

## Later (not scheduled)

Surplus-funds lead list (strategy #4), foreclosure auctions on the same RealAuction sites (#5), "check this
property" local gigs (#6), documents and people on a deal, data API (#7).

## Order and rough size

| When | What |
|---|---|
| Monday | U1–U7 (you), Step 1, Step 1b |
| Tue–Wed | Step 2 |
| Thu | Step 3 |
| Fri | Step 4 |
| After | Step 5 decision with real users |

Each step ships on its own: checks pass, browser QA at three sizes, deploy, and a short report before the next one.
