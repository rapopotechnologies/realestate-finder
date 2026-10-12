"""Load US Census cartographic boundary files (1:500k) into public.boundaries.

    python -m omf.boundaries --state FL            # state, counties, places, ZIPs touching the state
    python -m omf.boundaries --state FL --layers county place

Works for any state: pass its 2-letter code. ZCTAs (ZIP code areas) are national, so we keep
every ZCTA that touches the state's outline.
"""
import argparse
import io
import logging
import zipfile
from pathlib import Path

import shapefile  # pyshp
from shapely.geometry import mapping, shape
from shapely.prepared import prep

from omf.config import CACHE_DIR
from omf.db import DB
from omf.http import PoliteClient

log = logging.getLogger("boundaries")

BASE = "https://www2.census.gov/geo/tiger"
YEAR = "2024"
ZCTA_YEAR = "2020"  # the only 1:500k ZCTA release

STATE_FIPS = {
    "AL": "01", "AK": "02", "AZ": "04", "AR": "05", "CA": "06", "CO": "08", "CT": "09", "DE": "10", "DC": "11",
    "FL": "12", "GA": "13", "HI": "15", "ID": "16", "IL": "17", "IN": "18", "IA": "19", "KS": "20", "KY": "21",
    "LA": "22", "ME": "23", "MD": "24", "MA": "25", "MI": "26", "MN": "27", "MS": "28", "MO": "29", "MT": "30",
    "NE": "31", "NV": "32", "NH": "33", "NJ": "34", "NM": "35", "NY": "36", "NC": "37", "ND": "38", "OH": "39",
    "OK": "40", "OR": "41", "PA": "42", "RI": "44", "SC": "45", "SD": "46", "TN": "47", "TX": "48", "UT": "49",
    "VT": "50", "VA": "51", "WA": "53", "WV": "54", "WI": "55", "WY": "56", "PR": "72",
}
FIPS_STATE = {v: k for k, v in STATE_FIPS.items()}


def download(name: str, year: str) -> Path:
    path = CACHE_DIR / "census" / f"{name}.zip"
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        url = f"{BASE}/GENZ{year}/shp/{name}.zip"
        log.info("downloading %s", url)
        r = PoliteClient(timeout=600).get(url)
        r.raise_for_status()
        path.write_bytes(r.content)
    return path


def read_shapes(zip_path: Path):
    with zipfile.ZipFile(zip_path) as z:
        stem = next(n[:-4] for n in z.namelist() if n.endswith(".shp"))
        reader = shapefile.Reader(
            shp=io.BytesIO(z.read(stem + ".shp")),
            shx=io.BytesIO(z.read(stem + ".shx")),
            dbf=io.BytesIO(z.read(stem + ".dbf")),
            encoding="utf-8",
        )
        fields = [f[0] for f in reader.fields[1:]]
        for sr in reader.iterShapeRecords():
            yield dict(zip(fields, sr.record)), shape(sr.shape.__geo_interface__)


def feature(layer, geoid, name, label, state, state_fips, geom):
    return {"layer": layer, "geoid": geoid, "name": name, "label": label, "state": state,
            "state_fips": state_fips, "geometry": mapping(geom)}


def push(db: DB, features: list[dict], batch: int = 20) -> int:
    n = 0
    for i in range(0, len(features), batch):
        n += db.rpc("upsert_boundaries", {"features": features[i:i + batch]})
    return n


def load(state: str, layers: list[str]) -> dict[str, int]:
    state = state.upper()
    sfips = STATE_FIPS[state]
    db = DB()
    counts: dict[str, int] = {}

    all_states = {rec["STATEFP"]: (rec["NAME"], geom)
                  for rec, geom in read_shapes(download(f"cb_{YEAR}_us_state_500k", YEAR))}
    if sfips not in all_states:
        raise SystemExit(f"state {state} not found")
    state_name, state_geom = all_states[sfips]
    if "state" in layers:
        counts["state"] = push(db, [feature("state", sfips, state_name, state_name, state, sfips, state_geom)])

    if "county" in layers:
        feats = [
            feature("county", rec["GEOID"], rec["NAMELSAD"], f'{rec["NAMELSAD"]}, {state}', state, sfips, geom)
            for rec, geom in read_shapes(download(f"cb_{YEAR}_us_county_500k", YEAR))
            if rec["STATEFP"] == sfips
        ]
        counts["county"] = push(db, feats)

    if "place" in layers:
        feats = [
            feature("place", rec["GEOID"], rec["NAME"], f'{rec["NAME"]}, {state}', state, sfips, geom)
            for rec, geom in read_shapes(download(f"cb_{YEAR}_{sfips}_place_500k", YEAR))
        ]
        counts["place"] = push(db, feats)

    if "zcta" in layers:
        touch = prep(state_geom.buffer(0.01))
        home = prep(state_geom)
        feats = []
        for rec, geom in read_shapes(download(f"cb_{ZCTA_YEAR}_us_zcta520_500k", ZCTA_YEAR)):
            if touch.intersects(geom):
                z = rec["ZCTA5CE20"]
                # Border ZIPs belong to whichever state holds most of them
                pt = geom.representative_point()
                zfips = sfips if home.contains(pt) else next(
                    (f for f, (_, g) in all_states.items() if g.contains(pt)), sfips)
                feats.append(feature("zcta", z, z, z, FIPS_STATE.get(zfips), zfips, geom))
        counts["zcta"] = push(db, feats)

    return counts


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--state", required=True)
    p.add_argument("--layers", nargs="+", default=["state", "county", "place", "zcta"],
                   choices=["state", "county", "place", "zcta"])
    args = p.parse_args()
    counts = load(args.state, args.layers)
    log.info("loaded %s", counts)
    DB().rpc("refresh_property_areas")


if __name__ == "__main__":
    main()
