# Design brief: "Plat, ink and seal"

Written 2026-10-12 before the visual remodel. The source of truth for how Off-Market Finder looks and reads.
Tokens live in `app/app/globals.css` and `app/tailwind.config.ts`; components follow this page.

## The idea

Everything in this app comes from **public records**: the county plat map, the tax roll, the clerk's auction
docket, the deed. The look borrows from those documents, made modern and calm:

- **Plat** — the survey map: warm paper, fine ruled lines, places drawn as outlines. Our map, our borders.
- **Ink** — the record itself: near-black text, numbers you can trust, IDs in a typewriter face.
- **Seal** — the county's stamp on a deed: a warm burnt-orange used for one thing, **tax deed auctions** (and the
  urgency of their dates). HUD, a federal program, gets **federal blue**.

What it should feel like: *a sharp investor's research desk*, not a flashy listing site. Quiet surfaces, strong
numbers, nothing shouting except a deadline.

## Principles

1. **Numbers first, labeled with their source.** Every price says what it is ("opening bid", "list price"); every
   value says whose it is ("County value"). Never a number without a label.
2. **Color means something or it isn't used.** Five meaningful colors (below). No decorative color, no ad-hoc
   Tailwind palette (`amber-500`, `violet-…`) in components.
3. **Time is the headline for auctions.** Dates and countdowns are as prominent as prices.
4. **Records look like records.** Parcel IDs, case and certificate numbers use the mono face, so they're easy to
   read aloud to a county clerk and to copy.
5. **One way to do each thing.** One card, one badge set, one section frame, one empty state; same in every room.
6. **Phone is a first-class desk.** Bottom bar, one-thumb actions, no sideways scrolling except the filter strip.

## Color tokens

HSL channels in `globals.css` (`hsl(var(--x))`), named by meaning. All text pairs pass WCAG AA (checked
2026-10-12: lowest is 5.0:1).

| Token | Hex | Means | Use for | Never for |
|---|---|---|---|---|
| `paper` (background) | #F6F3EC | the desk | page background | cards |
| `sheet` (card) | #FFFFFF | a document | cards, panels, header | page background |
| `ink` (foreground, primary) | #18211D | the record | text, primary buttons, clusters | — |
| `muted` | #5B625D | secondary text | labels, metadata | anything you must read to act |
| `line` (border) | #E3DED3 | ruled lines | borders, dividers, map hairlines | text |
| `plat` (brand) | #0B6B5A | the app / place | logo, links, focus ring, selected area outline, active nav | sources, status |
| `deed` + `deed-soft` | #A84A12 / #FBEDE3 | **tax deed** | tax deed badges and pins, auction countdown | HUD, generic warnings |
| `hud` + `hud-soft` | #2C55A0 / #E8EEF9 | **HUD home** | HUD badges and pins | links (those are `plat`) |
| `gain` + `gain-soft` | #1E7047 / #E4F2EA | good for you | accepted offer, value upside, "tracked" | decoration |
| `alert` + `alert-soft` | #B42318 / #FDECEA | act now / wrong | overdue follow-up, auction ≤ 3 days, errors, destructive | tax deeds in general |

Primary buttons are **ink** (like resume-optimizer); `plat` is for the brand mark and navigation, so the eye
learns: ink = do it, plat = go there.

## Typography

| Face | Job | Where |
|---|---|---|
| **Fraunces** (Google, variable; weights 500–600, `opsz` auto) | display: "a document title" | h1, h2, the big price on the property page, landing headline |
| **Geist Sans** | everything you read and click | body, UI, card prices (tabular numbers) |
| **IBM Plex Mono** (400/500) | record identifiers | parcel ID, case #, certificate #, HUD case #, book/page |

Scale (rem): 0.75 meta · 0.875 body-sm · 1 body · 1.25 card price · 1.5 h2 · 2 h1 · 2.5–3.5 landing.
Prices always `tabular-nums`. Headings use `text-wrap: balance`.

## Logo

A **lot outline** (an irregular five-sided parcel, as drawn on a plat) in `plat`, with a small **seal dot** in
`deed` where a pin would sit: "this parcel". The wordmark sets **Off-Market** in Fraunces and **Finder** in Geist,
muted. The mark alone is the favicon / app icon and the phone header logo. One SVG component
(`components/layout/logo.tsx`), no raster files.

## Shape, depth, motion

- Radius: 12px cards and panels, 8px controls, full for chips and pins.
- Depth: paper → sheet is shown by a 1px `line` border; shadow only on hover, menus, dialogs and the floating map card.
- Spacing: 4px grid; card padding 16; section gap 32 (desktop) / 24 (phone).
- Motion: 150ms ease for hover/focus; map fly-to 600ms; respect `prefers-reduced-motion`.
- Icons: Lucide at 1.75 stroke, 16px inline / 20px standalone, always paired with a label except in dense controls
  that carry an `aria-label`.

## Components (one of each)

- **SourceBadge** — `deed` / `hud` soft chip with the date: "Tax deed · Nov 17", "HUD · bids Oct 21".
- **Countdown** — "in 36 days" (muted) → "in 5 days" (`deed`) → "in 2 days" / "today" (`alert`). Used on cards,
  property page, My List.
- **RecordId** — mono text with a copy button for parcel / case / certificate numbers.
- **Section** — sheet card with an h2 in Fraunces and an optional action on the right.
- **PropertyCard** — photo, source badge + countdown, price + label, County value, facts, place line, heart.
- **Stat** — big number (Fraunces) + muted label; landing and admin.
- **EmptyState** — icon, one-line title, one-line why, one action.
- **Filter chip / Toggle** — pill, ink when on.

## Rooms

**Front door.** Fraunces headline on paper, the live numbers as Stats, a **read-only preview** of real pins on the
map (no addresses or owners), "How it works" in three steps, FAQ, sign up / sign in. Sign-up with password, and
"Forgot password".

**Search.** Map left (plat style), list right; on phones a list with a Map toggle. Filter strip: Source, **When**
(7 / 30 / 90 days), Price, Type, Beds, More. Results line: count by source · coverage · Sort. Cards per the
PropertyCard spec with countdowns. Pins: `deed` and `hud` dots; clusters ink with the count; selected area
outlined in `plat` with a dashed line. Cities appear from zoom 10, very light.

**Property (a dossier).** Header band: source badge, Countdown, big price (Fraunces) + label, County value,
address with place links, Save. Then, for tax deeds: **Owner & redemption** (who owns it, "they can still pay
until the sale"), **How this auction works**, Facts (with RecordIds), Timeline, Location, Sales history. Right
rail: **Your deal**. Gallery adapts: 1 image full width; 1 + satellite as two equal tiles; 3+ as today.

**My List.** Stage columns as ruled sheets; cards compact; strategy chip; Countdown; follow-up in `alert` when
overdue.

**Account / Admin.** Sections on sheets; admin numbers as Stats.

## Map

Base: OpenFreeMap Positron (or MapTiler dataviz-light), unchanged. Our layers: counties `ink` 35%, cities `plat`
25% from zoom 10, ZIPs `hud` 25% from zoom 10 (opt-in). Selected area: `plat` 2.5px dashed + 5% fill. Pins: 7px
dots with a 2px white ring; hover/selected 10px with an ink ring. Clusters: ink circles, white Geist numbers.

## Voice

Plain, specific, calm. "Opening bid", not "price". "County value", not "estimated value". "Auction in 5 days",
not "Hurry!". No exclamation marks, no hype, no made-up numbers. Legal-adjacent text (redemption, title, TCPA)
says what we know and points to the official source.

## Accessibility (unchanged bar)

WCAG 2.1 AA; every color pair above checked; focus ring `plat` 2px; touch targets 44px on phones; axe-core clean
on every room at 375 / 768 / 1280.
