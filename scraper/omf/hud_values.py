"""Market values for HUD homes, so they get a deal score like tax deeds.

HUD doesn't publish a market value. We look up the tax-roll parcel under each listing's map point in the
Florida DOR statewide cadastral layer (same fields as the NAL roll) and take its just value (JV). The
parcel is accepted only when its site address has the same house number as the listing, which skips
neighbors and condo common areas (JV 0). If the point misses (HUD's coordinates are ~10 m, and condo
points land on common areas), we search 40 m around it and prefer the parcel with the same unit number.
"""
import logging
import re

from omf.db import DB
from omf.http import PoliteClient
from omf.nal import LAND_USE

log = logging.getLogger(__name__)

CADASTRAL = "https://services9.arcgis.com/Gh9awoU677aKree0/arcgis/rest/services/Florida_Statewide_Cadastral/FeatureServer/0"
FIELDS = "PARCEL_ID,CO_NO,JV,AV_SD,PHY_ADDR1,PHY_ZIPCD,DOR_UC,ASMNT_YR"

_client = PoliteClient(timeout=60)


def _number(addr: str | None) -> str | None:
    m = re.match(r"\s*(\d+)", addr or "")
    return m.group(1) if m else None


def _unit(addr: str | None) -> str | None:
    m = re.search(r"(?:APT|UNIT|#|STE)\s*([A-Z0-9-]+)\s*$", (addr or "").upper())
    return m.group(1) if m else None


def _query(params: dict) -> list[dict]:
    r = _client.get(CADASTRAL + "/query", params={"outFields": FIELDS, "returnGeometry": "false", "f": "json", **params})
    return [f["attributes"] for f in r.json().get("features", [])]


def _pick(features: list[dict], number: str | None, unit: str | None = None) -> dict | None:
    ok = [f for f in features if (f.get("JV") or 0) > 0 and number and _number(f.get("PHY_ADDR1")) == number]
    if unit:
        for f in ok:
            if re.search(rf"(?:\b|#|UNIT\s*){re.escape(unit)}\b", (f.get("PHY_ADDR1") or "").upper()[len(number or ""):]):
                return f
        # several units at one address and none matches ours: don't guess
        return ok[0] if len(ok) == 1 else None
    return ok[0] if ok else None


def value_hud_homes(db: DB, refresh: bool = False) -> dict:
    params = {"source_key": "like.hud:*", "lat": "not.is.null", "select": "id,address,zip,lat,lng"}
    if not refresh:
        params["market_value"] = "is.null"
    todo = db.select("properties", params)
    stats = {"pending": len(todo), "valued": 0, "nearby": 0, "unmatched": 0}
    for p in todo:
        number, unit = _number(p["address"]), _unit(p["address"])
        point = {"geometry": f"{p['lng']},{p['lat']}", "geometryType": "esriGeometryPoint", "inSR": "4326",
                 "spatialRel": "esriSpatialRelIntersects"}
        try:
            hit = _pick(_query(point), number, unit)
            if not hit:
                hit = _pick(_query({**point, "distance": 40, "units": "esriSRUnit_Meter"}), number, unit)
                if hit:
                    stats["nearby"] += 1
            if not hit:
                stats["unmatched"] += 1
                continue
            code = str(hit.get("DOR_UC") or "").zfill(3)
            db.update("properties", {"id": p["id"]}, {
                "market_value": hit["JV"], "assessed_value": hit.get("AV_SD"),
                "parcel_id": hit.get("PARCEL_ID"), "land_use_code": code, "land_use": LAND_USE.get(code),
            })
            stats["valued"] += 1
        except Exception as e:  # noqa: BLE001 - a missing value is fine; keep going
            stats["unmatched"] += 1
            log.warning("HUD value for %s failed: %s", p["address"], e)
    return stats
