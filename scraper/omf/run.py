"""Command-line entry point (used locally and by the daily GitHub Actions workflow).

    python -m omf.run all                          # tax deeds (active counties) + HUD + photos
    python -m omf.run taxdeeds --counties 12069    # one county: auctions -> NAL/appraiser -> geocode
    python -m omf.run taxdeeds --months-back 6     # also past auction days (backfills sold prices)
    python -m omf.run hud                          # HUD for every state with an active county
    python -m omf.run photos
    python -m omf.run activate 12069 12095         # start tracking counties
    python -m omf.run report                       # per-county numbers
"""
import argparse
import json
import logging
import sys

from omf.adapters.base import RunLog, run_adapter
from omf.adapters.hud import HudHomeStore
from omf.adapters.realauction import RealAuctionTaxDeed
from omf.db import DB
from omf.enrich import enrich_county
from omf.geocode import geocode_pending
from omf.hud_values import value_hud_homes
from omf.photos import copy_hud_photos, streetview_check

log = logging.getLogger("omf.run")


def _step(db: DB, adapter: str, county: str | None, fn, *args) -> dict:
    """Run a non-adapter step (enrich, geocode, photos) with its own scrape_runs row."""
    run = RunLog(db, adapter, county)
    try:
        stats = fn(*args) or {}
        run.stats = stats
        run.found = int(stats.get("pending", stats.get("auctions", 0)) or 0)
        run.upserted = int(stats.get("properties", stats.get("copied", stats.get("census", 0))) or 0)
        run.close()
        return stats
    except Exception as e:  # noqa: BLE001 - log and let the next county run
        run.error(adapter, e)
        run.close(failed=True)
        return {"error": str(e)}


def active_counties(db: DB, only: list[str] | None) -> list[dict]:
    params = {"auction_platform": "eq.realauction", "select": "*", "order": "fips"}
    if only:
        params["fips"] = f"in.({','.join(only)})"
    else:
        params["is_active"] = "is.true"
    return db.select("counties", params)


def taxdeeds(db: DB, only: list[str] | None, months_back: int = 0) -> None:
    for c in active_counties(db, only):
        log.info("── %s County (%s)", c["county_name"], c["fips"])
        run_adapter(db, RealAuctionTaxDeed(c, months_back=months_back))
        _step(db, "enrich", c["fips"], enrich_county, db, c)
        _step(db, "geocode", c["fips"], geocode_pending, db, c["fips"])
        _step(db, "streetview", c["fips"], streetview_check, db, c["fips"])


def hud(db: DB) -> None:
    states = sorted({c["state"] for c in db.select("counties", {"is_active": "is.true", "select": "state"})}) or ["FL"]
    run_adapter(db, HudHomeStore(states))
    _step(db, "hud_values", None, value_hud_homes, db)


def photos(db: DB) -> None:
    _step(db, "photos", None, copy_hud_photos, db)


def report(db: DB) -> list[dict]:
    out = []
    for c in db.select("counties", {"is_active": "is.true", "select": "fips,county_name", "order": "county_name"}):
        f = c["fips"]
        auctions = db.select("auctions", {"county_fips": f"eq.{f}", "select": "id,status,property_id,auction_date"})
        props = db.select("properties", {"county_fips": f"eq.{f}", "source_key": "like.parcel:*",
                                         "select": "id,location_unknown,lat,market_value"})
        owners = db.select("owners", {"property_id": f"in.({','.join(p['id'] for p in props) or '00000000-0000-0000-0000-000000000000'})",
                                      "select": "property_id,source"}) if props else []
        ph = db.select("photos", {"property_id": f"in.({','.join(p['id'] for p in props) or '00000000-0000-0000-0000-000000000000'})",
                                  "select": "property_id,source"}) if props else []
        out.append({
            "county": c["county_name"], "auctions": len(auctions),
            "upcoming": sum(1 for a in auctions if a["status"] == "Scheduled"),
            "matched_nal": sum(1 for o in owners if o["source"].startswith("fl_dor_nal")),
            "matched_appraiser": sum(1 for o in owners if o["source"] == "lake_pa"),
            "linked": sum(1 for a in auctions if a["property_id"]),
            "geocoded": sum(1 for p in props if p["lat"] is not None),
            "location_unknown": sum(1 for p in props if p["location_unknown"]),
            "with_streetview": len({x["property_id"] for x in ph if x["source"] == "streetview"}),
            "satellite_only": len({x["property_id"] for x in ph if x["source"] == "satellite"}),
        })
    return out


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    logging.getLogger("httpx").setLevel(logging.WARNING)
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("command", choices=["all", "taxdeeds", "hud", "photos", "activate", "report"])
    p.add_argument("fips", nargs="*", help="county FIPS codes (activate)")
    p.add_argument("--counties", nargs="*", help="limit tax deeds to these FIPS codes")
    p.add_argument("--months-back", type=int, default=0, help="also scrape past auction days (backfills sold prices)")
    a = p.parse_args()
    db = DB()

    if a.command == "activate":
        for f in a.fips:
            db.update("counties", {"fips": f}, {"is_active": True})
        print([c["county_name"] for c in active_counties(db, a.fips)])
    elif a.command == "taxdeeds":
        taxdeeds(db, a.counties, a.months_back)
    elif a.command == "hud":
        hud(db)
    elif a.command == "photos":
        photos(db)
    elif a.command == "all":
        taxdeeds(db, a.counties, a.months_back)
        hud(db)
        photos(db)
    if a.command in ("all", "taxdeeds", "report"):
        json.dump(report(db), sys.stdout, indent=1)
        print()


if __name__ == "__main__":
    main()
