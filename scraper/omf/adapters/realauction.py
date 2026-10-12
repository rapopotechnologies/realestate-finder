"""RealAuction tax deed sites ({county}.realtaxdeed.com, or combined {county}.realforeclose.com).

Same code for every county. The sites render with JavaScript and block simple fetchers,
so this drives Chromium with Playwright, one page at a time, at least 1s apart.

Calendar:    /index.cfm?zaction=USER&zmethod=CALENDAR&selCalDate=MM/01/YYYY
             .CALBOX[dayid="MM/DD/YYYY"] with text like "Tax Deed 26 / 26 TD 11:15 AM ET"
Auction day: /index.cfm?zaction=AUCTION&Zmethod=PREVIEW&AUCTIONDATE=MM/DD/YYYY
             three lists, each paged 10 at a time: #Area_R (running), #Area_W (waiting),
             #Area_C (closed or canceled); page counts in #maxRA / #maxWA / #maxCA.
"""
import logging
import re
import time
from datetime import date

from playwright.sync_api import Page, sync_playwright

from omf.adapters.base import Adapter, now_iso
from omf.config import USER_AGENT
from omf.db import DB

log = logging.getLogger(__name__)

MIN_GAP = 1.2  # seconds between page loads / clicks on the same host

# Runs in the page: read every .AUCTION_ITEM in one list
PARSE_AREA_JS = r"""
(areaId) => {
  const area = document.getElementById(areaId);
  if (!area) return [];
  return [...area.querySelectorAll('.AUCTION_ITEM')].map(it => {
    const stat = {};
    for (const d of it.querySelectorAll('.AUCTION_STATS > div')) {
      const k = (d.className.split(' ')[0] || '').replace('ASTAT_', '');
      stat[k] = d.innerText.trim();
    }
    const fields = {}; const links = {}; let last = null; const extra = [];
    for (const tr of it.querySelectorAll('table.ad_tab tr')) {
      const lbl = (tr.querySelector('.AD_LBL')?.innerText || '').trim().replace(/:$/, '');
      const td = tr.querySelector('.AD_DTA');
      const val = (td?.innerText || '').trim();
      const a = td?.querySelector('a');
      if (lbl) { fields[lbl] = val; last = lbl; if (a) links[lbl] = a.href; }
      else if (last) { extra.push([last, val]); }
    }
    return {stat, fields, links, extra};
  });
}
"""


def _money(s: str | None) -> float | None:
    if not s:
        return None
    m = re.sub(r"[^0-9.]", "", s)
    return float(m) if m else None


class RealAuctionTaxDeed(Adapter):
    name = "realauction"

    def __init__(self, county: dict, months_ahead: int = 3, today: date | None = None):
        self.county = county
        self.county_fips = county["fips"]
        self.base = county["auction_base_url"].rstrip("/")
        self.months_ahead = months_ahead
        self.today = today or date.today()
        self._pw = None
        self._browser = None
        self._page: Page | None = None
        self._last = 0.0

    # ── browser plumbing ─────────────────────────────────────────────────────
    @property
    def page(self) -> Page:
        if self._page is None:
            self._pw = sync_playwright().start()
            self._browser = self._pw.chromium.launch()
            ctx = self._browser.new_context(user_agent=USER_AGENT, viewport={"width": 1280, "height": 900})
            self._page = ctx.new_page()
        return self._page

    def _pace(self) -> None:
        gap = time.monotonic() - self._last
        if gap < MIN_GAP:
            time.sleep(MIN_GAP - gap)
        self._last = time.monotonic()

    def _goto(self, url: str, settle_ms: int) -> None:
        for attempt in range(3):
            self._pace()
            try:
                self.page.goto(url, wait_until="domcontentloaded", timeout=60000)
                self.page.wait_for_timeout(settle_ms)
                return
            except Exception as e:  # noqa: BLE001
                if attempt == 2:
                    raise
                log.warning("load %s failed (%s); retrying", url, e)
                time.sleep(5 * (attempt + 1))

    def close(self) -> None:
        if self._browser:
            self._browser.close()
        if self._pw:
            self._pw.stop()

    # ── adapter steps ────────────────────────────────────────────────────────
    def discover(self):
        """Auction days with tax deed sales in the current month plus the next N."""
        y, m = self.today.year, self.today.month
        seen = set()
        for i in range(self.months_ahead + 1):
            mm, yy = (m - 1 + i) % 12 + 1, y + (m - 1 + i) // 12
            self._goto(f"{self.base}/index.cfm?zaction=USER&zmethod=CALENDAR&selCalDate={mm:02d}/01/{yy}", 2500)
            boxes = self.page.eval_on_selector_all(
                ".CALBOX[dayid]", "els => els.map(e => [e.getAttribute('dayid'), e.innerText.replace(/\\s+/g, ' ').trim()])")
            for dayid, text in boxes:
                # Combined realforeclose.com sites also list foreclosure days: keep tax deeds only
                if "tax deed" not in text.lower() or dayid in seen:
                    continue
                seen.add(dayid)
                t = re.search(r"(\d{1,2}:\d{2}\s*[AP]M(?:\s*[A-Z]{2})?)", text)
                yield {"date": dayid, "time": t.group(1) if t else None, "calendar_text": text}

    def fetch_details(self, day: dict) -> list[dict]:
        url = f"{self.base}/index.cfm?zaction=AUCTION&Zmethod=PREVIEW&AUCTIONDATE={day['date']}"
        self._goto(url, 4500)
        records = []
        for area, max_id in (("Area_R", "maxRA"), ("Area_W", "maxWA"), ("Area_C", "maxCA")):
            pages = self._max_pages(max_id)
            seen_first = None
            for p in range(pages):
                items = self.page.evaluate(PARSE_AREA_JS, area)
                if not items:
                    break
                first = items[0]["fields"].get("Case #")
                if p > 0 and first == seen_first:
                    break  # the click didn't advance; stop rather than duplicate
                seen_first = first
                for it in items:
                    it.update(area=area, auction_date=day["date"], auction_time=day.get("time"), url=url)
                    records.append(it)
                if p < pages - 1 and not self._next_page(area, first):
                    break
        return records

    def _max_pages(self, max_id: str) -> int:
        txt = self.page.evaluate(f"document.getElementById('{max_id}')?.innerText || ''")
        try:
            return max(1, int(txt.strip() or 0))
        except ValueError:
            return 1

    def _next_page(self, area: str, current_first: str | None) -> bool:
        """Click this list's Next Page arrow and wait until its first case number changes."""
        self._pace()
        clicked = self.page.evaluate("""(areaId) => {
            const head = document.getElementById(areaId)?.closest('[class^="Head_"]');
            const btn = head?.querySelector('.PageRight');
            if (!btn) return false; btn.click(); return true; }""", area)
        if not clicked:
            return False
        for _ in range(40):
            self.page.wait_for_timeout(250)
            first = self.page.evaluate(
                "(a) => document.querySelector('#' + a + ' .AUCTION_ITEM .ad_tab a')?.innerText?.trim() || "
                "document.querySelector('#' + a + ' .AUCTION_ITEM .AD_DTA')?.innerText?.trim()", area)
            if first and first != current_first:
                # The status panel fills in a moment after the items swap
                for _ in range(24):
                    if self.page.evaluate(
                            "(a) => !!document.querySelector('#' + a + ' .AUCTION_ITEM .ASTAT_MSGA')?.innerText.trim()", area):
                        break
                    self.page.wait_for_timeout(250)
                return True
        return False

    def normalize(self, raw: dict) -> dict | None:
        f, stat = raw["fields"], raw["stat"]
        if "TAX" not in f.get("Auction Type", "TAXDEED").upper():
            return None  # foreclosure item on a combined site
        case_no = f.get("Case #", "").strip()
        if not case_no:
            raise ValueError("auction item without a case number")

        label, value = stat.get("MSGA", ""), stat.get("MSGB", "")
        detail = None
        if "start" in label.lower():
            status = "Scheduled"
        elif "sold" in label.lower():
            status = "Sold"
            parts = [stat.get("MSGC", ""), stat.get("MSGD", ""), stat.get("MSG_SOLDTO_Label", ""), stat.get("MSG_SOLDTO_MSG", "")]
            detail = " ".join(p for p in parts if p) or None
        elif value or label:
            status = value or label
        else:
            # Status panel never filled in: fall back to which list the item sits in
            status = {"Area_W": "Scheduled", "Area_R": "Running", "Area_C": "Closed"}.get(raw.get("area"), "Unknown")

        street = f.get("Property Address", "").strip()
        city_line = next((v for k, v in raw.get("extra", []) if k == "Property Address" and v), "")
        address = ", ".join(x for x in (street, city_line) if x) or None
        mm, dd, yy = raw["auction_date"].split("/")
        return {
            "county_fips": self.county_fips,
            "case_no": case_no,
            "certificate_no": f.get("Certificate #") or None,
            "auction_date": f"{yy}-{mm}-{dd}",
            "auction_time": raw.get("auction_time"),
            "opening_bid": _money(f.get("Opening Bid")),
            "status": status,
            "status_detail": detail,
            "parcel_id": f.get("Parcel ID") or None,
            "property_address": address,
            "auction_url": raw["url"],
            "appraiser_url": raw.get("links", {}).get("Parcel ID"),
            "assessed_value": _money(f.get("Assessed Value")),
            "last_seen": now_iso(),
        }

    def save(self, db: DB, rows: list[dict]) -> int:
        # One auction can show on two days (rescheduled); keep the latest row per case
        by_case = {r["case_no"]: r for r in sorted(rows, key=lambda r: r["auction_date"])}
        db.upsert("auctions", by_case.values(), on_conflict="county_fips,case_no")
        return len(by_case)

    def finish(self, db: DB, stats: dict) -> None:
        db.update("counties", {"fips": self.county_fips}, {"last_scraped_at": now_iso()})
