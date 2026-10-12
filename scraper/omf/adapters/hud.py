"""HUD HomeStore (hudhomestore.gov), searched by state.

Watching the site in a browser (2026-10-12) showed no JSON API: the search page is rendered on
the server with every listing embedded as JSON in <input id="available_prop">, and each detail
page embeds its own JSON in <input id="prop_details">. We read those (plain HTTP is enough),
plus the listing broker block from the detail page text. Listings missing from today's search
are marked inactive.
"""
import html as htmllib
import json
import logging
import re
from datetime import datetime

from omf.adapters.base import Adapter, now_iso
from omf.db import DB
from omf.http import PoliteClient

log = logging.getLogger(__name__)

BASE = "https://www.hudhomestore.gov"
PHOTO_BASE = "https://res.cloudinary.com/yardi/image/upload/q_auto,f_auto,c_limit/hhs/"

_client = PoliteClient()


def _hidden_json(page: str, element_id: str):
    m = re.search(rf'id="{element_id}"[^>]*value="([^"]*)"', page) or \
        re.search(rf'value="([^"]*)"[^>]*id="{element_id}"', page)
    return json.loads(htmllib.unescape(m.group(1))) if m else None


def _text(page: str) -> str:
    t = re.sub(r"<script.*?</script>|<style.*?</style>", " ", page, flags=re.S | re.I)
    return re.sub(r"\s+", " ", htmllib.unescape(re.sub(r"<[^>]+>", " ", t)))


def _date(s: str | None, fmt: str = "%m/%d/%Y") -> str | None:
    if not s or s.startswith("0001"):
        return None
    for f in (fmt, "%Y-%m-%dT%H:%M:%S", "%m/%d/%Y %I:%M:%S %p"):
        try:
            return datetime.strptime(s, f).date().isoformat()
        except ValueError:
            continue
    return None


def _num(s) -> float | None:
    try:
        v = float(str(s).replace(",", ""))
        return v if v > 0 else None
    except (TypeError, ValueError):
        return None


def _baths(s) -> float | None:
    """HUD writes "2.1" for 2 full + 1 half bath; convert to the usual 2.5."""
    if s in (None, ""):
        return None
    full, _, half = str(s).partition(".")
    try:
        return int(full) + 0.5 * int(half or 0) or None
    except ValueError:
        return _num(s)


PROPERTY_TYPES = {"single family home": "single_family", "condominium": "condo", "townhouse": "townhouse",
                  "manufactured home": "mobile_home", "mobile home": "mobile_home", "duplex": "multi_family",
                  "triplex": "multi_family", "fourplex": "multi_family", "multi-family": "multi_family"}


class HudHomeStore(Adapter):
    name = "hud"

    def __init__(self, states: list[str]):
        self.states = states
        self.started = now_iso()
        self.seen: set[str] = set()

    def discover(self):
        yield from self.states

    def fetch_details(self, state: str) -> list[dict]:
        page = _client.get(f"{BASE}/searchresult?citystate={state}").text
        listings = _hidden_json(page, "available_prop") or []
        log.info("HUD %s: %d listings in search", state, len(listings))
        out = []
        for item in listings:
            case = item.get("propertyCaseNumber")
            if not case or item.get("propertyState", state) != state:
                continue
            detail, broker = {}, {}
            try:
                dpage = _client.get(f"{BASE}/propertydetails?caseNumber={case}").text
                d = _hidden_json(dpage, "prop_details")
                detail = (d[0] if isinstance(d, list) and d else d) or {}
                broker = self._broker(_text(dpage))
            except Exception as e:  # noqa: BLE001 - list data alone is still worth keeping
                log.warning("HUD detail %s failed: %s", case, e)
            out.append({"search": item, "detail": detail, "broker": broker})
        return out

    @staticmethod
    def _broker(text: str) -> dict:
        m = re.search(r"More info on Listing Broker (.+?) Listing Broker's Email id (.*?) ?Listing Broker's Phone number (\(?\d{3}\)?[ \-.]?\d{3}[ \-.]\d{4})"
                      r"(?: phone)? ([A-Z0-9&.,' \-]+?) \d", text)
        if not m:
            return {}
        return {"name": m.group(1).strip().title(), "phone": m.group(3), "company": m.group(4).strip().title()}

    def normalize(self, raw: dict) -> dict | None:
        s, d, b = raw["search"], raw["detail"], raw["broker"]
        case = s["propertyCaseNumber"]
        lat, lng = _num(s.get("latitude")), s.get("longitude")
        try:
            lng = float(lng)
        except (TypeError, ValueError):
            lng = None
        fha = s.get("fhaFinancing") or d.get("FHAFinancing")
        status_txt = (d.get("ListingStatus") or s.get("propertyStatusDesc") or "").lower()
        photos = [p.strip().strip('"') for p in (s.get("galleryImages") or "").split(",") if p.strip().strip('"')]
        broker_name = " · ".join(x for x in (b.get("name"), b.get("company")) if x) or None
        period_deadline = d.get("PeriodDeadline") or s.get("periodDeadlineDate")
        deadline = None
        if period_deadline and not period_deadline.startswith("0001"):
            try:  # HUD deadlines are 11:59:59 PM Central
                dt = datetime.strptime(period_deadline[:19], "%Y-%m-%dT%H:%M:%S") if "T" in period_deadline \
                    else datetime.strptime(period_deadline, "%m/%d/%Y").replace(hour=23, minute=59, second=59)
                deadline = dt.strftime("%Y-%m-%dT%H:%M:%S") + "-05:00"
            except ValueError:
                deadline = None
        return {
            "property": {
                "source_key": f"hud:{case}",
                "address": s.get("propertyAddress"),
                "city": s.get("propertyCity"),
                "state": s.get("propertyState") or "FL",
                "zip": (s.get("propertyZip") or "")[:5] or None,
                "location": f"SRID=4326;POINT({lng} {lat})" if lat and lng else None,
                "property_type": PROPERTY_TYPES.get((s.get("propertyType") or "").lower(), "other"),
                "land_use": s.get("propertyType"),
                "beds": _num(s.get("bedrooms")),
                "baths": _baths(s.get("bathrooms") or s.get("bathroomsdecimal")),
                "sqft": int(_num(s.get("squareFootage")) or 0) or None,
                "lot_size_sqft": _num(d.get("LotSize")),
                "year_built": int(_num(s.get("yearBuilt")) or 0) or None,
            },
            "listing": {
                "hud_case_no": case,
                "list_price": _num(s.get("listPrice") or d.get("ListPrice")),
                "listing_period": s.get("listingPeriod") or d.get("ListingPeriod"),
                "bid_open_date": _date(s.get("bidOpenDate")),
                "bid_deadline": deadline,
                "fha_financing": fha,
                "fha_eligible": bool(fha) and fha.upper().startswith(("IN", "IE")),
                "eligible_203k": (str(d.get("Eligible203K", "")).lower() == "yes") if d else None,
                "broker_name": broker_name,
                "broker_phone": b.get("phone"),
                "listing_url": f"{BASE}/propertydetails?caseNumber={case}",
                "status": "under_contract" if ("contract" in status_txt or "pending" in status_txt) else "active",
                "raw": {"search": s, "detail": {k: v for k, v in d.items() if not isinstance(v, (dict, list))}},
                "last_seen": now_iso(),
            },
            "photos": [PHOTO_BASE + p for p in photos],
        }

    def save(self, db: DB, rows: list[dict]) -> int:
        props = [r["property"] for r in rows]
        keys = sorted({k for p in props for k in p})
        saved = db.upsert("properties", [{k: p.get(k) for k in keys} for p in props], on_conflict="source_key", returning=True)
        ids = {s["source_key"]: s["id"] for s in saved}
        listings, photos = [], []
        for r in rows:
            pid = ids.get(r["property"]["source_key"])
            listings.append({**r["listing"], "property_id": pid})
            self.seen.add(r["listing"]["hud_case_no"])
            for i, url in enumerate(r["photos"]):
                photos.append({"property_id": pid, "source": "hud", "source_url": url, "sort_order": i,
                               "attribution": "Photo: HUD HomeStore"})
        db.upsert("hud_listings", listings, on_conflict="hud_case_no")
        if photos:
            # Only metadata here; the photos step copies and resizes them into Storage
            db.upsert("photos", photos, on_conflict="property_id,source,sort_order")
        return len(listings)

    def finish(self, db: DB, stats: dict) -> None:
        if not self.seen:
            return  # never deactivate everything because one search came back empty
        active = db.select("hud_listings", {"status": "neq.inactive", "select": "hud_case_no,property_id,raw"})
        gone = [a["hud_case_no"] for a in active
                if a["hud_case_no"] not in self.seen
                and ((a.get("raw") or {}).get("search") or {}).get("propertyState") in self.states]
        for case in gone:
            db.update("hud_listings", {"hud_case_no": case}, {"status": "inactive"})
        stats["marked_inactive"] = len(gone)
        stats["states"] = self.states
