---
name: ponytail
description: Senior-engineer code pass for Off-Market Finder. Rewrites code to be descriptive, simple and efficient without changing behavior. Use when asked to tighten, clean up, simplify or "ponytail" code, or before committing a large change.
---

# Ponytail: descriptive, simple, efficient

Review the target code the way a very senior engineer would before approving it, then make the edits.
The target is what the user names (a file, folder or feature); if they name nothing, it's the uncommitted
diff (`git diff HEAD`), or the last commit if the tree is clean.

**The contract: behavior stays identical.** Same inputs, same outputs, same database writes, same UI. If a
change would alter behavior, don't make it; list it under "Not changed" with the reason.

## What good looks like here

**Descriptive**
- Names say what a thing is in the domain: `openAuction`, `nalMatchRate`, `fitTarget`, not `data2`, `tmp`, `res`.
- A function does one thing its name promises. If you need "and" to describe it, split it.
- Comments explain *why* (a site quirk, a legal reason, a trade-off), never *what* the next line does.
  Keep the existing comment density; delete comments that restate code.
- Types tell the story: precise TS types and Python hints at module boundaries, no `any` / bare `dict` where a
  shape is known.

**Simple**
- Fewest moving parts that do the job. Inline single-use helpers; extract only when used 2+ times or when a
  name makes the call site clearer.
- Early returns over nested ifs. No flags that only one caller sets. No options nobody passes.
- Reuse what exists before writing new code: `lib/format.ts`, `lib/deal.ts`, `lib/search/state.ts`,
  `components/ui/*`, `omf/http.py` (`PoliteClient`), `omf/db.py` (`DB`), `omf/nal.py` helpers. Duplicated
  logic in two places is a finding.
- Delete dead code, unused imports, unused props, stale TODOs and leftover debug output.
- Match the surrounding code: same idioms, same file layout, same naming style. Don't introduce a new pattern
  for one call site.

**Efficient**
- Database: one set-based query or RPC over a loop of row-by-row calls; select only needed columns; filter in
  SQL, not in JS/Python; check that new filters have an index.
- Network: batch requests (`createSignedUrls`, PostgREST `in.()`, Census batch geocoder); keep the scrapers'
  one-request-per-second-per-host rule; never add a request inside a render loop.
- React: no work in render that can be memoized or moved to the server; stable keys; no effect that only
  derives state (compute it instead); avoid re-creating clients and handlers on every render when it matters.
- Don't trade clarity for micro-optimizations. Efficiency findings must name the cost (N queries, N requests,
  O(n²)), not just "faster".

## Hard rules (never "simplify" these away)

- Security: row-level security policies, `security definer` + `search_path` on functions, `revoke`/`grant`
  lines, server-only keys (`GOOGLE_MAPS_API_KEY`, the service-role key, `SKIP_TRACE_*`) staying out of client
  code, the monthly Google cap check, `safeNext` redirects, CSV formula escaping.
- Politeness: rate limiting, retries with backoff, the browser user agent, per-item error isolation in
  adapters.
- Accessibility: labels, roles, `aria-*`, focus styles, keyboard handlers, `sr-only` text.
- Migrations already applied are history: never edit one; add a new migration instead.

## Process

1. Read the target files completely before changing anything. Note how they're used (grep call sites).
2. List findings by file, each with category (descriptive / simple / efficient), the concrete problem and the fix.
   Skip anything that is a matter of taste with no real gain.
3. Apply the fixes in small, reviewable edits.
4. Verify, and report the results honestly:
   - App: `cd app && npx tsc --noEmit && npm run lint && npm test`
   - Scraper: `cd scraper && .venv/bin/ruff check omf --select E,F,W --ignore E501 && .venv/bin/python -m py_compile omf/*.py omf/adapters/*.py`
   - If UI changed, load the page and confirm it still renders and works.
5. Summarize: what changed and why (one line each), lines removed vs added, checks run and their results,
   and "Not changed" items that need a decision.
