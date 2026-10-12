"""Photos.

HUD: copy each listing photo from HUD's CDN into Supabase Storage as a ~1200px image and a ~400px
thumbnail (JPEG), so cards and galleries load fast from our own bucket.

Tax deed properties: Google Street View. We only call the free metadata endpoint and store whether
imagery exists (and its date / pano id). The image itself is never stored, because Google's terms
don't allow caching it; the app fetches it through its own server route with the key kept server-side,
showing "Image: Google". No imagery -> a 'satellite' row, so the app shows its illustrated
placeholder with a satellite tile instead.
"""
import io
import logging

from PIL import Image

from omf.config import GOOGLE_MAPS_API_KEY
from omf.db import DB
from omf.http import PoliteClient

log = logging.getLogger(__name__)

BUCKET = "photos"
SIZES = {"full": 1200, "thumb": 400}
_client = PoliteClient(timeout=120)


def _resize(data: bytes, width: int) -> tuple[bytes, int, int]:
    img = Image.open(io.BytesIO(data))
    img = img.convert("RGB")
    if img.width > width:
        img = img.resize((width, round(img.height * width / img.width)), Image.LANCZOS)
    out = io.BytesIO()
    img.save(out, "JPEG", quality=82, optimize=True, progressive=True)
    return out.getvalue(), img.width, img.height


def copy_hud_photos(db: DB, limit: int | None = None) -> dict:
    todo = db.select("photos", {"source": "eq.hud", "storage_path": "is.null",
                                "select": "id,property_id,source_url,sort_order", "order": "property_id,sort_order"})
    if limit:
        todo = todo[:limit]
    stats = {"pending": len(todo), "copied": 0, "failed": 0}
    for p in todo:
        try:
            r = _client.get(p["source_url"])
            r.raise_for_status()
            full, w, h = _resize(r.content, SIZES["full"])
            thumb, _, _ = _resize(r.content, SIZES["thumb"])
            base = f"hud/{p['property_id']}/{p['sort_order']:02d}"
            db.upload(BUCKET, f"{base}.jpg", full, "image/jpeg")
            db.upload(BUCKET, f"{base}_t.jpg", thumb, "image/jpeg")
            db.update("photos", {"id": p["id"]}, {"storage_path": f"{base}.jpg", "thumb_path": f"{base}_t.jpg",
                                                   "width": w, "height": h})
            stats["copied"] += 1
        except Exception as e:  # noqa: BLE001 - one bad photo shouldn't stop the rest
            stats["failed"] += 1
            log.warning("HUD photo %s failed: %s", p["source_url"], e)
    return stats


def streetview_check(db: DB, county_fips: str | None = None) -> dict:
    if not GOOGLE_MAPS_API_KEY:
        log.info("GOOGLE_MAPS_API_KEY not set: skipping Street View checks")
        return {"skipped": "no GOOGLE_MAPS_API_KEY"}
    params = {"source_key": "like.parcel:*", "lat": "not.is.null", "select": "id,lat,lng"}
    if county_fips:
        params["county_fips"] = f"eq.{county_fips}"
    props = db.select("properties", params)
    have = {r["property_id"] for r in db.select("photos", {"source": "in.(streetview,satellite)", "select": "property_id"})}
    todo = [p for p in props if p["id"] not in have]
    stats = {"pending": len(todo), "streetview": 0, "satellite": 0, "failed": 0}
    for p in todo:
        try:
            lat, lng = p["lat"], p["lng"]
            r = _client.get("https://maps.googleapis.com/maps/api/streetview/metadata",
                            params={"location": f"{lat},{lng}", "radius": 60, "source": "outdoor", "key": GOOGLE_MAPS_API_KEY})
            meta = r.json()
            ok = meta.get("status") == "OK"
            db.upsert("photos", [{
                "property_id": p["id"], "source": "streetview" if ok else "satellite", "sort_order": 0,
                "attribution": "Image: Google",
                "meta": {"status": meta.get("status"), "pano_id": meta.get("pano_id"), "date": meta.get("date"),
                         "lat": lat, "lng": lng},
            }], on_conflict="property_id,source,sort_order")
            stats["streetview" if ok else "satellite"] += 1
        except Exception as e:  # noqa: BLE001
            stats["failed"] += 1
            log.warning("Street View check for %s failed: %s", p["id"], e)
    return stats
