# Remodel: room-by-room UI/UX audit

Walked 2026-10-12 on production (signed in as an admin), at 375px (phone), 768px (tablet) and 1280px (desktop).
Same scale as resume-optimizer: **P1** blocks or misleads, **P2** noticeable friction, **P3** nice to have.
No feature work in the remodel rows unless marked *(new)*; everything else changes what's already there.

## The rooms

Like resume-optimizer, fix the set of top-level rooms and put new things inside them instead of adding more.

| Room | Today | After the remodel |
|---|---|---|
| **Front door** | `/` landing, `/login` | Landing with a live preview, sign-in / sign-up |
| **Search** | `/search` map + list | Same, plus saved searches *(new)* |
| **Property** | `/property/[id]` | Same, reordered around the decision |
| **My List** | `/my-list` board | Pipeline with dates and reminders |
| **Account** | missing (sign-out icon only) | `/account`: password, email, saved searches, plan; Admin lives here for admins |

Phones get a bottom bar with the same four in-app rooms (Search, My List, Account; Property is reached from
Search), like resume-optimizer's `nav-items.ts`.

---

## Room 1: Front door

**What works:** clear headline, fast, accessible, simple sign-in.

| # | P | Finding | Fix |
|---|---|---|---|
| F1 | P1 | "Across Florida" while 5 of 67 counties are tracked. | Say what's true: "Live in Lake, Orange, Osceola, Polk and Seminole; any of 45 Florida counties starts tracking the day you search it." Count from the DB. |
| F2 | P2 | Nothing to see before signing up: no map, no example listing, no numbers. | Public preview (resume-optimizer's "try it before sign-up"): live counts ("237 tax deed auctions in the next 90 days") and a static map of pins. No owner data, no addresses past street level. |
| F3 | P2 | "Search like Zillow" names a competitor's brand in marketing copy. | "Search like you're used to: city, ZIP and county outlines…" |
| F4 | P2 | No path for new people with a password: sign-up is magic-link only, and no "forgot password". | Sign-up form (email + password, confirms by email once redirect URLs are set); "Forgot password?" link. |
| F5 | P3 | No FAQ: what's a tax deed, can I lose money, how is this different from the county site. | Short FAQ on the landing; the same answers feed the Property room's explainers (P6). |

## Room 2: Search

**What works:** the map, outlines and hover counts, autocomplete, URL-shareable searches, "Near you", fast
results, coverage badge.

| # | P | Finding | Fix |
|---|---|---|---|
| S1 | P1 | **The deal chip misleads.** 188 of 237 open tax deeds are "Great"; "Best deal" ranks a $5.2M parcel with a $5,556 opening bid first. The opening bid is the back taxes, not the price; the three Orange sales on Sep 10 went for 2.7–12× their opening bids ($42,200 on a $3,477 bid). | Until there's a sold-price model, drop "Great/Good" for tax deeds and default the sort to **Soonest auction**. Label the number "Opening bid", not price. Bring a chip back when it's based on what similar auctions actually sold for (see strategy, idea 3). |
| S2 | P1 | "Est. value" is the county's just (assessed market) value, often far from what a home would sell for. | Label it "County value" with a tooltip ("the property appraiser's just value for 2026"). |
| S3 | P1 | At 1280px the filter row runs off the right edge: the sort menu is cut off. At 768px the header search shrinks to "City, ZIP,". | Move Sort onto the results header line ("83 properties · Sort: Soonest"); collapse secondary filters into a "More filters" sheet; give the header search a minimum width and drop the logo text on tablets. |
| S4 | P2 | No date filter, though auction timing is the main thing investors plan around. | "Auction in: next 7 days / 30 days / 90 days" chips; HUD equivalent "bids due". |
| S5 | P2 | Cards don't show urgency or status: "Nov 17" but not "in 36 days", nothing about "9 of 23 still scheduled". | "Tax deed · Nov 17 (36 days)"; red-ish when ≤ 7 days. |
| S6 | P2 | Clusters are all blue, so the map hides whether an area has tax deeds or HUD homes. | Color clusters by majority source; show "12 tax deeds · 2 HUD" on hover. |
| S7 | P2 | City outlines (purple) cover the county view and compete with the pins. | Cities on from zoom 10 (not 8), thinner and lighter; ZIPs stay opt-in. |
| S8 | P2 | Phone: one card per screen (image is 60% of the card). | Compact list layout on phones (thumbnail left, facts right), or a density toggle. |
| S9 | P2 | No way to come back to a search or be told about new matches. | *(new)* "Save search" → daily email of new auctions / HUD homes (see strategy, idea 2). |
| S10 | P3 | Property type is a single select; price presets stop at $500K. | Multi-select type chips; free-entry price. |
| S11 | P3 | Results header doesn't break down the count. | "83 properties · 79 tax deeds · 4 HUD". |

## Room 3: Property

**What works:** the gallery (Street View + satellite), facts grid, timeline with countdown and status history,
official links, notes, owner panel with the Do-Not-Call notice.

| # | P | Finding | Fix |
|---|---|---|---|
| P1 | P1 | The owner panel is at the very bottom, but for a tax deed it's the reason to be here: the owner can still pay the taxes (redeem) until the sale, which is the window for a direct offer. | Order for tax deeds: price + countdown → **Owner & redemption** → facts → timeline → map → sales. Explain redemption in one line. |
| P2 | P2 | No guidance on what bidding involves (registration, deposit, payment deadline, what liens survive, quiet title). People new to tax deeds can't judge risk. | *(new)* "How this auction works" panel per platform/county, written once and linked from every tax deed page. Include a plain "This isn't legal or title advice" line. |
| P3 | P2 | Gallery with one extra photo leaves a big empty right column. | One-photo + satellite: two equal tiles; 3+ photos: today's grid. |
| P4 | P2 | Same "Est. value" label issue as S2; "price is 8% of value" invites the wrong conclusion. | "County value $119,818 · opening bid is 8% of it" plus "Similar auctions in Lake sold for X–Y%" once sold prices are tracked. |
| P5 | P3 | No share / print / directions. | Copy link, print-friendly view (for drive-bys), "Directions" to Google Maps. |
| P6 | P3 | HUD pages don't explain owner-occupant priority periods or the 203(k) / $100-down flags. | Tooltips on those facts. |

## Room 4: My List

**What works:** columns, drag and the per-card menu, notes preview, CSV export, empty state.

| # | P | Finding | Fix |
|---|---|---|---|
| L1 | P2 | Cards aren't ordered by what's due: an auction tomorrow sits under one next month. | Sort each column by auction date / bid deadline; show the countdown. |
| L2 | P2 | Outcomes don't flow back: when an auction is redeemed, canceled or sold, the card stays where it was. | Badge "Redeemed Oct 14" automatically; offer "Move to Passed". |
| L3 | P2 | *(new)* No reminders. | Email the morning before an auction / deadline on your list. |
| L4 | P3 | Export is everything at once. | Export per column. |

## Room 5: Account *(new room)*

| # | P | Finding | Fix |
|---|---|---|---|
| A1 | P1 | No way to change the password (yours was generated for you) or see which email you're signed in with; sign-out is an unlabeled icon in the header. | `/account`: email, change password, sign out, saved searches, notification settings; later, plan and billing. |
| A2 | P2 | Admin is an unlabeled pulse icon on phones. | Move Admin into the account menu (resume-optimizer does the same). |

## System-wide

| # | P | Finding | Fix |
|---|---|---|---|
| X1 | P2 | Phone header: three icon-only buttons (Admin, My List, Sign out) and a truncated search placeholder. | Bottom bar on phones (Search, My List, Account); header keeps logo + search. |
| X2 | P2 | No first-run help: words like "tax deed", "redeemed", "opening bid", "just value" go unexplained. | A small glossary used for tooltips across rooms (one source of truth). |
| X3 | P3 | Brand: "Off-Market Finder" is descriptive but generic and long for the phone header. | Decide before paid launch (see strategy). |

---

## Remodel rows (order of work)

Each row ships on its own and leaves the app better.

1. ✅ *2026-10-12* **Honest numbers (S1, S2, P4, F1).** Remove misleading chips for tax deeds, relabel values, default sort to
   soonest, truthful landing copy. Small; highest trust impact.
2. ✅ *2026-10-12* **Navigation and Account (A1, A2, X1, S3).** `/account` with change password; phone bottom bar; filter row fits.
3. **Property, reordered for the decision (P1, P3, P2).** Owner + redemption up top; "How this auction works".
4. **Search for planners (S4, S5, S6, S7, S11).** Date filter, countdowns, cluster colors, quieter outlines.
5. **Front door that shows the product (F2, F3, F4, F5).** Public preview, sign-up with password, FAQ.
6. **My List as a pipeline (L1, L2, L3).** *Partly done 2026-10-12 with CRM phase 1: columns sort by follow-up then
   date (L1); strategy, offer log, contact log, follow-up dates, Under contract / Closed stages. Still open: L2, L3.* Ordered by date, outcomes flow back, reminders.
7. **Phone density and polish (S8, S10, P5, P6, X2, L4).**
