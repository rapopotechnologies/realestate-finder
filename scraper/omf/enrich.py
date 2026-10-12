"""Turn scraped auctions into properties with owners, values and sales.

For each county: collect the auctions' parcel IDs, look them up in the newest DOR NAL file
(normalized parcel ID: no dashes/spaces), create/refresh properties + owners + sales, then
point each auction at its property. Lake parcels also go through the county appraiser site
(fallback when NAL has no match, plus bedrooms/bathrooms).
"""
import logging
import re
from datetime import datetime, timezone

from omf import nal
from omf.adapters import lake_pa
from omf.db import DB

log = logging.getLogger(__name__)


def _split_auction_address(addr: str | None) -> dict:
    """'503 CANOPY LN, LADY LAKE, FL- 32159' -> address / city / zip."""
    if not addr:
        return {}
    parts = [p.strip() for p in addr.split(",")]
    out = {"address": parts[0] or None}
    if len(parts) >= 2:
        out["city"] = parts[1].title() or None
    m = re.search(r"(\d{5})\s*$", addr)
    if m:
        out["zip"] = m.group(1)
    # A street line without a house number ("ROYAL PALM DR") can't be geocoded to a point
    if out.get("address") and not re.match(r"\d", out["address"]):
        out["address"] = out["address"]
    return out


def enrich_county(db: DB, county: dict) -> dict:
    fips = county["fips"]
    auctions = db.select("auctions", {"county_fips": f"eq.{fips}",
                                      "select": "id,parcel_id,parcel_id_norm,property_address,appraiser_url,assessed_value"})
    with_parcel = [a for a in auctions if a.get("parcel_id_norm")]
    wanted = {a["parcel_id_norm"] for a in with_parcel}
    stats = {"auctions": len(auctions), "with_parcel": len(with_parcel), "nal_matched": 0, "pa_matched": 0}
    if not wanted:
        return stats

    meta = nal.latest_file(county["nal_county_code"])
    found: dict[str, dict] = {}
    if meta:
        found = nal.find_parcels(nal.download(meta), wanted)
        db.upsert("nal_loads", [{"county_fips": fips, "tax_year": meta["year"], "file_name": meta["name"],
                                 "rows_loaded": len(found), "loaded_at": datetime.now(timezone.utc).isoformat()}],
                  on_conflict="county_fips,tax_year")
        stats["nal_file"] = meta["name"]
    stats["nal_matched"] = len(found)

    props, owners_by_key, sales_by_key = [], {}, {}
    seen = set()
    for a in with_parcel:
        key = a["parcel_id_norm"]
        if key in seen:
            continue
        seen.add(key)
        row = found.get(key)
        if row:
            p = nal.to_property(row, fips, a.get("appraiser_url"))
            owners_by_key[p["source_key"]] = ("nal", row)
            sales = []
            for i in ("1", "2"):
                yr, mo, price = nal._int(row.get(f"SALE_YR{i}")), nal._int(row.get(f"SALE_MO{i}")), nal._int(row.get(f"SALE_PRC{i}"))
                if yr and price:
                    sales.append({"sale_date": f"{yr}-{(mo or 1):02d}-01", "price": price,
                                  "qualified": row.get(f"QUAL_CD{i}") in ("01", "02", "03", "05", "06"),
                                  "book_page": "/".join(x for x in (row.get(f"OR_BOOK{i}"), row.get(f"OR_PAGE{i}")) if x) or None,
                                  "source": "fl_dor_nal"})
            sales_by_key[p["source_key"]] = sales
        else:
            # Not in NAL (new split, different ID format...): keep what the auction site shows
            p = {"source_key": f"parcel:{fips}:{key}", "parcel_id": a["parcel_id"], "county_fips": fips,
                 "appraiser_url": a.get("appraiser_url"), "assessed_value": a.get("assessed_value"),
                 **_split_auction_address(a.get("property_address"))}

        if fips == lake_pa.FIPS:
            try:
                pa = lake_pa.lookup(db, a["parcel_id"], a.get("appraiser_url"))
            except Exception as e:  # noqa: BLE001 - the fallback must never stop the run
                log.warning("Lake PA %s failed: %s", a["parcel_id"], e)
                pa = None
            if pa:
                if not row:
                    stats["pa_matched"] += 1
                    p.update({k: v for k, v in {
                        "market_value": pa.get("market_value"), "assessed_value": pa.get("assessed_value"),
                        "year_built": int(pa["year_built"]) if pa.get("year_built") else None,
                        "sqft": int(pa["living_area"]) if pa.get("living_area") else None,
                        "land_use": pa.get("land_use"),
                    }.items() if v})
                    owners_by_key[p["source_key"]] = ("pa", pa)
                    sales_by_key[p["source_key"]] = [{**s, "source": "lake_pa"} for s in pa.get("sales", [])]
                if pa.get("bedrooms"):
                    p["beds"] = pa["bedrooms"]
                baths = (pa.get("full_baths") or 0) + 0.5 * (pa.get("half_baths") or 0)
                if baths:
                    p["baths"] = baths
                if pa.get("url"):
                    p["appraiser_url"] = pa["url"]
        props.append(p)

    # PostgREST bulk upserts need the same keys in every row
    keys = sorted({k for p in props for k in p})
    saved = db.upsert("properties", [{k: p.get(k) for k in keys} for p in props],
                      on_conflict="source_key", returning=True)
    ids = {s["source_key"]: s["id"] for s in saved}
    stats["properties"] = len(saved)

    owners, sales = [], []
    for skey, (kind, src) in owners_by_key.items():
        pid = ids.get(skey)
        if not pid:
            continue
        if kind == "nal":
            owners.append(nal.to_owner(src, pid, meta["year"]))
        else:
            mail = lake_pa.split_mailing(src.get("mailing"))
            prop = next(p for p in props if p["source_key"] == skey)
            mstate = mail.get("mailing_state")
            owners.append({"property_id": pid, "name": src.get("owner_name") or "Unknown",
                           "mailing_address": mail.get("mailing_address"), "mailing_city": None,
                           "mailing_state": mstate, "mailing_zip": mail.get("mailing_zip"),
                           "owner_type": nal.owner_type(src.get("owner_name") or ""),
                           "absentee": bool(prop.get("address")) and nal._street_key(prop.get("address")) not in nal._street_key(mail.get("mailing_address")),
                           "out_of_state": bool(mstate) and mstate != "FL", "source": "lake_pa"})
        for s in sales_by_key.get(skey, []):
            sales.append({"property_id": pid, **s})
    if owners:
        okeys = sorted({k for o in owners for k in o})
        db.upsert("owners", [{k: o.get(k) for k in okeys} for o in owners], on_conflict="property_id")
    if sales:
        skeys = ["property_id", "sale_date", "price", "instrument", "qualified", "book_page", "source"]
        uniq = {(s["property_id"], s["sale_date"], s["price"]): {k: s.get(k) for k in skeys} for s in sales}
        db.upsert("property_sales", uniq.values(), on_conflict="property_id,sale_date,price")
    stats["owners"] = len(owners)
    stats["linked"] = db.rpc("link_auctions_to_properties", {"p_county_fips": fips})
    stats["nal_match_rate"] = round(stats["nal_matched"] / len(wanted), 3)
    return stats
