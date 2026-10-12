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
    return out


def _lake_details(db: DB, auction: dict) -> dict | None:
    try:
        return lake_pa.lookup(db, auction["parcel_id"], auction.get("appraiser_url"))
    except Exception as e:  # noqa: BLE001 - the fallback must never stop the run
        log.warning("Lake PA %s failed: %s", auction["parcel_id"], e)
        return None


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
    roll: dict[str, dict] = {}
    if meta:
        roll = nal.find_parcels(nal.download(meta), wanted)
        db.upsert("nal_loads", [{"county_fips": fips, "tax_year": meta["year"], "file_name": meta["name"],
                                 "rows_loaded": len(roll), "loaded_at": datetime.now(timezone.utc).isoformat()}],
                  on_conflict="county_fips,tax_year")
        stats["nal_file"] = meta["name"]
    stats["nal_matched"] = len(roll)

    # One property per parcel; owner + sales come from the DOR roll, else from the Lake appraiser
    props: dict[str, dict] = {}            # source_key -> property row
    owner_source: dict[str, tuple] = {}    # source_key -> ("nal", roll row) | ("pa", appraiser details)
    sales_by_key: dict[str, list[dict]] = {}
    for a in with_parcel:
        key = a["parcel_id_norm"]
        source_key = f"parcel:{fips}:{key}"
        if source_key in props:
            continue
        row = roll.get(key)
        if row:
            prop = nal.to_property(row, fips, a.get("appraiser_url"))
            owner_source[source_key] = ("nal", row)
            sales_by_key[source_key] = nal.to_sales(row)
        else:
            # Not in NAL (new split, different ID format...): keep what the auction site shows
            prop = {"source_key": source_key, "parcel_id": a["parcel_id"], "county_fips": fips,
                    "appraiser_url": a.get("appraiser_url"), "assessed_value": a.get("assessed_value"),
                    **_split_auction_address(a.get("property_address"))}

        pa = _lake_details(db, a) if fips == lake_pa.FIPS else None
        if pa:
            if not row:
                stats["pa_matched"] += 1
                prop.update(lake_pa.fallback_fields(pa))
                owner_source[source_key] = ("pa", pa)
                sales_by_key[source_key] = [{**s, "source": "lake_pa"} for s in pa.get("sales", [])]
            prop.update(lake_pa.room_fields(pa))
        props[source_key] = prop

    saved = db.upsert("properties", props.values(), on_conflict="source_key", returning=True)
    ids = {s["source_key"]: s["id"] for s in saved}
    stats["properties"] = len(saved)

    owners, sales = [], []
    for source_key, (kind, src) in owner_source.items():
        pid = ids.get(source_key)
        if not pid:
            continue
        owners.append(nal.to_owner(src, pid, meta["year"]) if kind == "nal"
                      else lake_pa.to_owner(src, pid, props[source_key].get("address")))
        sales.extend({"property_id": pid, **s} for s in sales_by_key.get(source_key, []))
    if owners:
        db.upsert("owners", owners, on_conflict="property_id")
    if sales:
        # The same sale can come back twice (e.g. both sales on one day); keep one per key
        unique = {(s["property_id"], s["sale_date"], s["price"]): s for s in sales}
        db.upsert("property_sales", unique.values(), on_conflict="property_id,sale_date,price")
    stats["owners"] = len(owners)
    stats["linked"] = db.rpc("link_auctions_to_properties", {"p_county_fips": fips})
    stats["nal_match_rate"] = round(stats["nal_matched"] / len(wanted), 3)
    return stats
