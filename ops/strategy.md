# Off-Market Finder strategy

Written 2026-10-12, the day the app went live (5 counties, 377 tax deed auctions, 58 HUD homes, one user).
Revisit when real users arrive. Nothing here has been validated with customers yet; every idea below is a bet
to test, not a fact.

## The architect's view: what we actually built

Not "a map of auctions". A pipeline that turns scattered public records into **events about parcels**:

```
government sources ──► normalized parcel (owner, value, location, sales) ──► events ──► people who act on them
RealAuction, HUD,       FL DOR tax roll, Census geocoder, DOR parcel map     status      search, list, (alerts),
county appraisers                                                            changes     (outreach), (pros)
```

Reusable pieces, already working:

| Asset | Why it matters beyond this app |
|---|---|
| Adapter framework (`discover → fetch → normalize → save`, polite HTTP, per-run logs) | Any public list of properties becomes a source in a day or two. |
| Parcel spine: every Florida parcel ID → owner, mailing address, value, sales, map point (DOR roll + statewide parcel layer) | The expensive part of any property product, and free here. |
| Status history (`auction_status_history`) | Change over time = alerts, outcomes, and later prediction. |
| Boundaries + search RPCs | Any "show me X in this city/ZIP/county" product. |
| Per-user pipeline (My List, notes, contacts) with RLS | The start of a CRM. |
| From resume-optimizer: Stripe plans + credits, email (Resend), admin usage pages | Billing and notifications don't need to be invented. |

Weak spots to fix before growth:

- **Source risk.** RealAuction's robots.txt disallows automated access, and the brief chose Playwright to get
  around simple blocks. That's fine for a personal tool; **before charging money, get a legal read** on scraping
  their sites, or license the data (counties publish tax deed lists; some sell feeds). Same check for HUD and the
  appraiser sites. One cease-and-desist would take out the core inventory.
- **No event layer yet.** Status changes are logged but nothing *reacts* to them (no alerts, no reminders).
- **Single daily batch** on one GitHub runner, sequential by county. Fine to ~40 counties (~1 hour); beyond that,
  run counties in parallel jobs.
- **Florida-only owner data.** The DOR roll is what makes owners free. Other states need a different source per
  state (often per county), which is the real cost of going national.
- **Costs today:** Supabase free tier (34 MB of 500 MB database, 92 MB of 1 GB storage), Vercel, Google capped at
  10,000 images/month. Comfortable for hundreds of users.

## The entrepreneur's view: who pays, for what

Ranked by how close we already are and how clearly someone pays.

### 1. Florida auction intelligence: the core subscription
**Who:** part-time investors, wholesalers, landlords and flippers buying at Florida tax deed auctions and HUD.
**Job:** "Show me what's selling soon near me, what it's worth, who owns it, and help me not miss the date."
**Why us:** auction-level tracking with status history, a map that thinks in counties / cities / ZIPs, owner
records included, cheaper and narrower than national lead-list tools (PropStream, BatchLeads, DealMachine and
similar are built around lists, not auction calendars; check their current features and prices before
positioning against them).
**Needs:** remodel rows 1–4, alerts (2), the sold-price history (3), billing.

### 2. Alerts: the retention engine
Saved searches + "auction in 3 days" reminders by email (later SMS). People subscribe to *being told*, not to
searching. Cheap to build on `auction_status_history` + Resend.

### 3. Sold-price history: the moat
Closed auctions show the winning bid ("Auction Sold · $42,200 · 3rd Party Bidder"). Keep it, and in a few months we
know what tax deed properties *actually* sell for, by county, type and value band. That gives an honest
"expected sale price" and a deal score that means something, and it's data nobody gets from the county sites.
Same idea as resume-optimizer's outcome data: we see the result, competitors don't. **Start collecting now**
(one column + a parse); it compounds daily, and backfilling past months is possible from the auction calendars.

### 4. Surplus-funds leads: a separate paying niche
When a tax deed sells for more than the opening bid, the surplus belongs to the former owner (and lienholders),
who often don't know. Orange's three Sep 10 sales alone left roughly $38k, $16k and $3.5k above their bids.
"Surplus recovery" firms pay for exactly this list: sale amount, overbid, former owner and mailing address. We'd
have all of it once (3) exists. **Check Florida's rules first** (who may claim, notice periods, any limits on
finder fees); sell the data, don't do the recovery ourselves.

### 5. Foreclosure auctions: more inventory, same code
RealAuction runs the foreclosure sales on the same software (`*.realforeclose.com`, already in our county list
for the combined sites). Adding mortgage foreclosure auctions is mostly a filter change in the adapter. The
calendars we checked list far more foreclosure days than tax deed days (Brevard: 8 to 2 over three months;
Miami-Dade: 31 to 4). Same source-risk caveat as above.

### 6. "Local jobs": the property needs people
Every auction property is a job for someone local before and after the sale:

- **Property checks (gig).** Investors want eyes on a property before bidding. A "Check this property" button
  posts a $20–40 task (photos of the house, roof, occupancy signs); a local person takes it. We keep a cut.
  Vacant land and properties without Street View need this most (75 of our 377 have none).
- **Pros directory / leads.** Winning bidders need quiet-title attorneys, title companies, surveyors, locksmiths,
  cleanout crews, contractors; HUD buyers need inspectors, 203(k) contractors and FHA lenders. Sell placement or
  per-lead to pros by county.
- **Owner outreach.** Pre-auction letters to owners who can still redeem (mail through a print-and-mail API,
  charged per letter, with compliance copy). Respectful by design: "you can still keep your home" is a real
  service, too.

Start with property checks: it's the most distinctive, uses the map and the list we have, and creates local
earning opportunities, not just leads.

### 7. Data and API (later)
Title companies, lenders, funds and the surplus firms in (4) want a clean feed: auctions + outcomes + owner +
geometry, per county. Price per county per month. Only after (3) has a few months of history.

### 8. Beyond Florida (later)
Tax-deed states with similar online auctions first; tax-lien states (and Florida's own tax certificate sale) are
a different product. Each new state = boundaries (one command), auction adapter(s), and an owner-data source,
which is the hard part.

## Plans (sketch to test, not decided)

| Plan | For | Includes |
|---|---|---|
| Free | trying it | 1 county, listings without owner info, 3 saved properties |
| Investor (~$29–49/mo) | the core user | all tracked Florida counties, owner info, alerts, My List, CSV, sold-price history |
| Pro (~$99/mo) | full-time / teams | everything + skip-trace and mail credits, surplus list, API-lite exports |
| Credits | anyone | skip traces, mailed letters, property checks: pay per use (resume-optimizer's credits system) |

## What to do first

1. Remodel rows 1–2 (honest numbers, Account + navigation). Trust before growth.
2. Start sold-price collection (3) now; nothing else gets more valuable just by waiting.
3. Saved searches + reminders (2).
4. Legal read on sources (scraping), Florida surplus rules and TCPA/outreach before any paid plan.
5. Then pick the paid wedge with 5–10 real users: core subscription vs surplus leads vs property checks.

## How we'll know (once there are users)

- Weekly active searchers and saved searches per user (is it a habit?).
- Alerts opened → property pages viewed → added to My List (does it drive action?).
- Properties moved to "Offer made" (does it lead to deals?).
- For each paid idea: 5 people who say yes to a price before building the payment flow.

## Rules that don't change

- Public records only; never Zillow / Redfin / Realtor.com data or photos.
- No made-up numbers: values are labeled with their source; deal scores come from real outcomes.
- Owner contact is for lawful outreach only: Do-Not-Call and TCPA rules shown wherever contact info is.
- Never imply legal or title advice; point to the official sources.
