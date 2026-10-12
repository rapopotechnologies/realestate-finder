"""Lake County Property Appraiser (lakecopropappr.com) parcel details.

Used for Lake auction parcels: as the fallback when a parcel isn't in the DOR NAL file, and for
bedrooms / bathrooms, which NAL doesn't carry. Results are cached in appraiser_cache for 7 days.

property-details.aspx?ParcelID=<id as the auction site prints it> opens the details page directly
(checked 2026-10-12: no terms page). If that ever stops working, we fall back to the brief's route:
accept the one-time terms, submit property-search.aspx with section/township/range/subdivision/block/lot,
then follow the AltKey result link.
"""
import html as htmllib
import logging
import re
from datetime import datetime, timedelta, timezone

from omf.db import DB
from omf.http import PoliteClient
from omf.nal import normalize_parcel

log = logging.getLogger(__name__)

BASE = "https://www.lakecopropappr.com"
FIPS = "12069"
CACHE_DAYS = 7

_client = PoliteClient()


def _text(html: str) -> str:
    t = re.sub(r"<script.*?</script>|<style.*?</style>", " ", html, flags=re.S | re.I)
    t = re.sub(r"<[^>]+>", " ", t)
    return re.sub(r"\s+", " ", htmllib.unescape(t)).strip()


def _after(txt: str, label: str, stop: str) -> str | None:
    m = re.search(re.escape(label) + r"\s*(.*?)\s*" + stop, txt)
    return m.group(1).strip() if m else None


def _num(s: str | None) -> float | None:
    if not s:
        return None
    s = re.sub(r"[^0-9.]", "", s)
    try:
        return float(s) if s else None
    except ValueError:
        return None


def parse(html: str) -> dict:
    txt = _text(html)
    if "Alternate Key:" not in txt:
        raise ValueError("not a property details page")
    out: dict = {
        "owner_name": _after(txt, "Name:", r"Alternate Key:"),
        "alt_key": _after(txt, "Alternate Key:", r"Mailing Address:"),
        "mailing": _after(txt, "Mailing Address:", r"Update Mailing Address"),
        "parcel_number": _after(txt, "Parcel Number:", r"Millage Group"),
        "location": _after(txt, "Property Location:", r"Property Name:"),
        "year_built": _num(_after(txt, "Year Built:", r"\s")),
        "living_area": _num(_after(txt, "Total Living Area:", r"\s")),
        "bedrooms": _num(_after(txt, "Bedrooms:", r"\s")),
        "full_baths": _num(_after(txt, "Full Bathrooms:", r"\s")),
        "half_baths": _num(_after(txt, "Half Bathrooms:", r"\s")),
    }
    # Market / assessed value from the county GENERAL FUND row of the tax estimate table
    m = re.search(r"GENERAL FUND \$([\d,]+) \$([\d,]+)", txt)
    if m:
        out["market_value"], out["assessed_value"] = _num(m.group(1)), _num(m.group(2))
    # Land use: first land data line, "SINGLE FAMILY (0100)"
    m = re.search(r"Land Data Line Land Use .*? 1 ([A-Z0-9 ,/&\-]+?) \((\d{4})\)", txt)
    if m:
        out["land_use"] = m.group(1).strip().title()
    # Sales history table
    sales = []
    tbl = re.search(r'id="cphMain_gvSalesHistory".*?</table>', html, flags=re.S)
    if tbl:
        for tr in re.findall(r"<tr[^>]*>(.*?)</tr>", tbl.group(0), flags=re.S)[1:]:
            cells = [_text(c) for c in re.findall(r"<td[^>]*>(.*?)</td>", tr, flags=re.S)]
            if len(cells) >= 6 and re.match(r"\d{2}/\d{2}/\d{4}", cells[1]):
                mm, dd, yy = cells[1].split("/")
                sales.append({"book_page": cells[0], "sale_date": f"{yy}-{mm}-{dd}", "instrument": cells[2],
                              "qualified": cells[3].lower().startswith("qualified"), "price": _num(cells[5])})
    out["sales"] = sales
    return out


def split_mailing(s: str | None) -> dict:
    """'8811 OLD CAMO RD OCEAN SPRINGS, MS 39564' -> address line / state / zip.

    The page runs street and city together, so the street + city stay as one line."""
    if not s:
        return {}
    m = re.match(r"(.*?),\s*([A-Z]{2})\s+(\d{5})", s.upper())
    if not m:
        return {"mailing_address": s}
    return {"mailing_address": m.group(1).strip(), "mailing_state": m.group(2), "mailing_zip": m.group(3)}


def lookup(db: DB, parcel_id: str, details_url: str | None = None) -> dict | None:
    key = normalize_parcel(parcel_id)
    cached = db.select("appraiser_cache", {"county_fips": f"eq.{FIPS}", "parcel_id_norm": f"eq.{key}", "select": "data,fetched_at"})
    if cached:
        fetched = datetime.fromisoformat(cached[0]["fetched_at"])
        if datetime.now(timezone.utc) - fetched < timedelta(days=CACHE_DAYS):
            return cached[0]["data"] or None
    url = details_url or f"{BASE}/property-details.aspx?ParcelID={parcel_id}"
    data: dict | None
    try:
        r = _client.get(url)
        data = parse(r.text)
        data["url"] = url
    except ValueError:
        log.info("Lake PA: no details page for %s", parcel_id)
        data = None
    db.upsert("appraiser_cache", [{"county_fips": FIPS, "parcel_id_norm": key, "data": data or {},
                                   "fetched_at": datetime.now(timezone.utc).isoformat()}],
              on_conflict="county_fips,parcel_id_norm")
    return data
