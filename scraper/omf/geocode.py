"""Geocode property addresses with the free US Census batch geocoder (benchmark Public_AR_Current).

Results are cached in public.geocodes by normalized address, so each address is looked up once.
Addresses the Census can't place (vacant land with no house number, new streets) get the parcel's
centroid instead: first from the Florida DOR statewide parcel-centroid layer (every county, keyed
by DOR county number + NAL parcel ID), then from the county's own ArcGIS parcel layer if we know
one. Otherwise the property is marked location_unknown: it stays in lists but isn't on the map.
"""
import csv
import io
import logging
import re

from shapely.geometry import Polygon

from omf.db import DB
from omf.http import PoliteClient
from omf.nal import normalize_parcel

log = logging.getLogger(__name__)

BATCH_URL = "https://geocoding.geo.census.gov/geocoder/locations/addressbatch"
BATCH_SIZE = 1000  # Census allows 10,000; smaller batches fail faster and retry cheaper

# Florida DOR cadastral centroids (statewide; CO_NO = DOR county number, PARCEL_ID as in NAL)
FL_CENTROIDS = ("https://services9.arcgis.com/Gh9awoU677aKree0/arcgis/rest/services/"
                "Florida_Statewide_Parcel_Centroid_Version/FeatureServer/0")

# County parcel layers (public ArcGIS REST) for centroids of parcels without a street address.
# field = the attribute holding the parcel ID; parcel IDs are compared normalized.
# "normalized": the layer stores IDs without dashes.
ARCGIS_PARCELS: dict[str, dict] = {
    "12069": {  # Lake County open data "Tax Parcels"
        "url": "https://gis.lakecountyfl.gov/lakegis/rest/services/OpenData/OpenData1/MapServer/12",
        "field": "ParcelNumber", "normalized": True,
    },
    "12095": {  # Orange County open data "Parcels"
        "url": "https://ocgis4.ocfl.net/arcgis/rest/services/AGOL_Open_Data/MapServer/56",
        "field": "PARCEL", "normalized": True,
    },
    "12105": {  # Polk County Property Appraiser "Parcels"
        "url": "https://gis.polk-county.net/server/rest/services/Map_Property_Appraiser/MapServer/1",
        "field": "PARCELID", "normalized": True,
    },
}

_client = PoliteClient(timeout=600)


def normalize_address(street: str, city: str | None, state: str | None, zip5: str | None) -> str:
    s = " ".join(x for x in (street, city or "", state or "FL", (zip5 or "")[:5]) if x)
    return re.sub(r"\s+", " ", re.sub(r"[^A-Z0-9# ]", " ", s.upper())).strip()


def _batch(rows: list[tuple[str, str, str, str, str]]) -> dict[str, dict]:
    buf = io.StringIO()
    csv.writer(buf).writerows(rows)
    r = _client.post(BATCH_URL, data={"benchmark": "Public_AR_Current"},
                     files={"addressFile": ("addresses.csv", buf.getvalue().encode(), "text/csv")})
    r.raise_for_status()
    out = {}
    for rec in csv.reader(io.StringIO(r.text)):
        if len(rec) < 3:
            continue
        rid, status = rec[0], rec[2]
        if status == "Match" and len(rec) >= 6 and "," in rec[5]:
            lng, lat = (float(x) for x in rec[5].split(","))
            out[rid] = {"lat": lat, "lng": lng, "match_quality": rec[3], "matched_address": rec[4]}
        else:
            out[rid] = {"lat": None, "lng": None, "match_quality": status or "No_Match", "matched_address": None}
    return out


def _statewide_centroid(dor_code: str | None, parcel_id: str) -> tuple[float, float] | None:
    if not dor_code or not parcel_id:
        return None
    r = _client.get(FL_CENTROIDS + "/query", params={
        "where": f"CO_NO = {int(dor_code)} AND PARCEL_ID = '{parcel_id.replace(chr(39), '')}'",
        "returnGeometry": "true", "outSR": "4326", "f": "json"})
    feats = r.json().get("features") or []
    g = feats[0].get("geometry") if feats else None
    return (g["y"], g["x"]) if g else None


def _arcgis_centroid(county_fips: str, parcel_id: str) -> tuple[float, float] | None:
    cfg = ARCGIS_PARCELS.get(county_fips)
    if not cfg or not parcel_id:
        return None
    pid = normalize_parcel(parcel_id) if cfg.get("normalized") else parcel_id
    r = _client.get(cfg["url"] + "/query", params={
        "where": f"{cfg['field']} = '{(pid or '').replace(chr(39), '')}'", "returnGeometry": "true",
        "geometryPrecision": "6", "outSR": "4326", "f": "json"})
    feats = r.json().get("features") or []
    rings = feats[0].get("geometry", {}).get("rings") if feats else None
    if not rings:
        return None
    pt = Polygon(rings[0], rings[1:]).representative_point()  # inside the parcel, even for odd shapes
    return (pt.y, pt.x)


def geocode_pending(db: DB, county_fips: str | None = None) -> dict:
    params = {"location": "is.null", "location_unknown": "is.false",
              "select": "id,address,city,state,zip,county_fips,parcel_id"}
    if county_fips:
        params["county_fips"] = f"eq.{county_fips}"
    todo = db.select("properties", params)
    dor_codes = {c["fips"]: c["nal_county_code"] for c in db.select("counties", {"state": "eq.FL", "select": "fips,nal_county_code"})}
    stats = {"pending": len(todo), "cached": 0, "census": 0, "arcgis": 0, "unknown": 0}
    if not todo:
        return stats

    keyed = {}
    for p in todo:
        has_number = bool(p.get("address") and re.match(r"\s*\d", p["address"]))
        keyed[p["id"]] = normalize_address(p["address"], p.get("city"), p.get("state"), p.get("zip")) if has_number else None

    keys = sorted({k for k in keyed.values() if k})
    cache = {}
    for i in range(0, len(keys), 100):
        chunk = keys[i:i + 100]
        quoted = ",".join('"' + k.replace('"', "") + '"' for k in chunk)
        for row in db.select("geocodes", {"normalized_address": f"in.({quoted})", "select": "*"}):
            cache[row["normalized_address"]] = row
    stats["cached"] = sum(1 for k in keys if k in cache)

    missing = [k for k in keys if k not in cache]
    by_key = {keyed[p["id"]]: p for p in todo if keyed[p["id"]] in missing}
    for i in range(0, len(missing), BATCH_SIZE):
        chunk = missing[i:i + BATCH_SIZE]
        rows = [(str(n), by_key[k]["address"], by_key[k].get("city") or "", by_key[k].get("state") or "FL",
                 (by_key[k].get("zip") or "")[:5]) for n, k in enumerate(chunk)]
        result = _batch(rows)
        new = []
        for n, k in enumerate(chunk):
            g = result.get(str(n), {"lat": None, "lng": None, "match_quality": "No_Match", "matched_address": None})
            new.append({"normalized_address": k, **g, "source": "census"})
            cache[k] = new[-1]
        db.upsert("geocodes", new, on_conflict="normalized_address")
        stats["census"] += sum(1 for g in new if g["lat"] is not None)

    for p in todo:
        g = cache.get(keyed[p["id"]]) if keyed[p["id"]] else None
        point = (g["lat"], g["lng"]) if g and g.get("lat") is not None else None
        if not point:
            try:
                point = _statewide_centroid(dor_codes.get(p.get("county_fips") or ""), p.get("parcel_id") or "") \
                    or _arcgis_centroid(p.get("county_fips") or "", p.get("parcel_id") or "")
                if point:
                    stats["arcgis"] += 1
                    db.upsert("geocodes", [{"normalized_address": f"PARCEL {p['county_fips']} {normalize_parcel(p['parcel_id'])}",
                                            "lat": point[0], "lng": point[1], "match_quality": "arcgis_centroid",
                                            "source": "arcgis"}], on_conflict="normalized_address")
            except Exception as e:  # noqa: BLE001
                log.warning("ArcGIS centroid for %s failed: %s", p.get("parcel_id"), e)
        if point:
            # The spatial-join trigger fills county / city / ZIP from the point
            db.update("properties", {"id": p["id"]}, {"location": f"SRID=4326;POINT({point[1]} {point[0]})"})
        else:
            stats["unknown"] += 1
            db.update("properties", {"id": p["id"]}, {"location_unknown": True})
    return stats
