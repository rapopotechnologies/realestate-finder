"""Florida DOR NAL (Name-Address-Legal) tax roll files.

One CSV per county per year, standard layout (2026 NAL/SDF/NAP Users Guide). Files live in the
DOR data portal's SharePoint library; we list them with its REST API and prefer the Final roll,
falling back to Preliminary, for the newest year that has the county. The newest file name is
checked on every run, so a newer roll is picked up as soon as DOR posts it.

We never load a whole county: the CSV is streamed and only parcels we need are kept.
"""
import csv
import io
import logging
import re
import zipfile
from datetime import date
from pathlib import Path
from urllib.parse import quote

from omf.config import CACHE_DIR
from omf.http import PoliteClient

log = logging.getLogger(__name__)

PORTAL = "https://floridarevenue.com"
NAL_DIR = "/property/dataportal/Documents/PTO Data Portal/Tax Roll Data Files/NAL"
API = PORTAL + "/property/dataportal/_api/web/GetFolderByServerRelativeUrl('{}')/{}?$select=Name,ServerRelativeUrl,TimeLastModified"

_client = PoliteClient(timeout=900, headers={"Accept": "application/json;odata=nometadata"})

# DOR land use codes (Users Guide, field 8: DOR_UC)
LAND_USE = {
    "000": "Vacant residential", "001": "Single family", "002": "Mobile home", "003": "Multi-family (10+ units)",
    "004": "Condominium", "005": "Cooperative", "006": "Retirement home", "007": "Misc. residential",
    "008": "Multi-family (2-9 units)", "009": "Residential common area", "010": "Vacant commercial",
    "011": "Store, one story", "012": "Mixed use store/office", "013": "Department store", "014": "Supermarket",
    "015": "Regional shopping center", "016": "Community shopping center", "017": "Office, one story",
    "018": "Office, multi-story", "019": "Professional services", "020": "Airport / marina / terminal",
    "021": "Restaurant", "022": "Drive-in restaurant", "023": "Financial institution", "024": "Insurance office",
    "025": "Repair service shop", "026": "Service station", "027": "Auto sales / repair", "028": "Parking lot / mobile home park",
    "029": "Wholesale outlet", "030": "Florist / greenhouse", "031": "Drive-in theater / open stadium",
    "032": "Theater / auditorium", "033": "Nightclub / bar", "034": "Bowling / skating / arena",
    "035": "Tourist attraction", "036": "Camp", "037": "Race track", "038": "Golf course", "039": "Hotel / motel",
    "040": "Vacant industrial", "041": "Light manufacturing", "042": "Heavy industrial", "043": "Lumber yard / mill",
    "044": "Packing plant", "045": "Cannery / bottler", "046": "Food processing", "047": "Mineral processing",
    "048": "Warehouse / distribution", "049": "Open storage / junk yard", "050": "Improved agricultural",
    "051": "Cropland I", "052": "Cropland II", "053": "Cropland III", "054": "Timberland 90+", "055": "Timberland 80-89",
    "056": "Timberland 70-79", "057": "Timberland 60-69", "058": "Timberland 50-59", "059": "Timberland (unclassified)",
    "060": "Grazing land I", "061": "Grazing land II", "062": "Grazing land III", "063": "Grazing land IV",
    "064": "Grazing land V", "065": "Grazing land VI", "066": "Orchard / grove", "067": "Poultry / bees / fish",
    "068": "Dairy / feed lot", "069": "Ornamentals / misc. agricultural", "070": "Vacant institutional",
    "071": "Church", "072": "Private school / college", "073": "Private hospital", "074": "Home for the aged",
    "075": "Non-profit / charitable", "076": "Mortuary / cemetery", "077": "Club / lodge / union hall",
    "078": "Sanitarium / rest home", "079": "Cultural facility", "080": "Vacant governmental", "081": "Military",
    "082": "Forest / park / recreation", "083": "Public school", "084": "Public college", "085": "Public hospital",
    "086": "County-owned", "087": "State-owned", "088": "Federal-owned", "089": "Municipal-owned",
    "090": "Leasehold interest", "091": "Utility", "092": "Mining / petroleum land", "093": "Subsurface rights",
    "094": "Right-of-way", "095": "Rivers / lakes / submerged land", "096": "Waste land / marsh / swamp",
    "097": "Outdoor recreation / parkland", "098": "Centrally assessed", "099": "Acreage (non-agricultural)",
}
VACANT = {"000", "010", "040", "070", "080", "099"}


def property_type(code: str | None) -> str | None:
    if not code:
        return None
    c = code.zfill(3)
    n = int(c) if c.isdigit() else -1
    if c in VACANT:
        return "vacant_land"
    if c == "001":
        return "single_family"
    if c == "002":
        return "mobile_home"
    if c in ("004", "005"):
        return "condo"
    if c in ("003", "008"):
        return "multi_family"
    if 11 <= n <= 49:
        return "commercial"
    if 50 <= n <= 69:
        return "agricultural"
    return "other"


def normalize_parcel(p: str | None) -> str | None:
    s = re.sub(r"[^A-Za-z0-9]", "", p or "").upper()
    return s or None


# ── Locating and downloading the newest file ─────────────────────────────────

def _list(folder: str, kind: str) -> list[dict]:
    r = _client.get(API.format(quote(folder), kind))
    r.raise_for_status()
    return r.json()["value"]


def latest_file(dor_code: str) -> dict | None:
    """Newest NAL file for a DOR county number ("45" = Lake): {name, url, year, roll}."""
    years = sorted((f["Name"] for f in _list(NAL_DIR, "Folders") if re.fullmatch(r"\d{4}[FP]", f["Name"])),
                   key=lambda n: (n[:4], n[4] == "F"), reverse=True)
    for folder in years:
        for f in _list(f"{NAL_DIR}/{folder}", "Files"):
            m = re.search(r"\s(\d{2})\s", f["Name"])
            if m and m.group(1) == dor_code and f["Name"].lower().endswith(".zip"):
                return {"name": f["Name"], "url": PORTAL + quote(f["ServerRelativeUrl"]),
                        "year": int(folder[:4]), "roll": "final" if folder.endswith("F") else "preliminary"}
    return None


def download(meta: dict) -> Path:
    path = CACHE_DIR / "nal" / meta["name"]
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        for old in path.parent.glob(f"*{meta['name'].split()[1]} *NAL*.zip"):
            old.unlink()  # drop superseded rolls for this county
        log.info("downloading %s", meta["name"])
        r = _client.get(meta["url"])
        r.raise_for_status()
        path.write_bytes(r.content)
    return path


def find_parcels(zip_path: Path, wanted: set[str]) -> dict[str, dict]:
    """Stream the county CSV and return {normalized parcel id: row} for the wanted parcels."""
    found: dict[str, dict] = {}
    with zipfile.ZipFile(zip_path) as z:
        name = next(n for n in z.namelist() if n.lower().endswith(".csv"))
        with z.open(name) as fh:
            for row in csv.DictReader(io.TextIOWrapper(fh, encoding="latin-1", newline="")):
                key = normalize_parcel(row.get("PARCEL_ID"))
                if key in wanted:
                    found[key] = row
                    if len(found) == len(wanted):
                        break
    return found


# ── Mapping a NAL row to properties / owners ─────────────────────────────────

def _int(v) -> int | None:
    try:
        n = int(float(v))
        return n if n > 0 else None
    except (TypeError, ValueError):
        return None


def street_key(s: str | None) -> str:
    return re.sub(r"[^A-Z0-9]", "", (s or "").upper())


OWNER_PATTERNS = [
    ("government", r"\b(COUNTY|CITY OF|TOWN OF|STATE OF|UNITED STATES|BOARD OF|AUTHORITY|DISTRICT|TIITF|DEPT)\b"),
    ("estate", r"\b(ESTATE OF|EST OF|HEIRS|DECEASED|DEC'D|PERSONAL REP)\b|\bESTATE\b(?<!LIFE ESTATE)"),
    ("trust", r"\b(TRUST|TRUSTEE|TRUSTEES|TR|TRS|REVOCABLE|LIVING TR)\b"),
    ("llc", r"\b(LLC|L L C|LC)\b"),
    ("corporation", r"\b(INC|CORP|CORPORATION|CO|COMPANY|LTD|LP|LLP|PA|ASSOCIATION|ASSN|BANK|HOLDINGS|PROPERTIES|INVESTMENTS?|PARTNERS|CHURCH|MINISTRIES)\b"),
]


def owner_type(name: str) -> str:
    n = (name or "").upper()
    for kind, pattern in OWNER_PATTERNS:
        if re.search(pattern, n):
            return kind
    return "individual"


def to_property(row: dict, county_fips: str, appraiser_url: str | None = None) -> dict:
    code = (row.get("DOR_UC") or "").zfill(3) or None
    yr, mo = _int(row.get("SALE_YR1")), _int(row.get("SALE_MO1"))
    homestead = (_int(row.get("EXMPT_01")) or 0) > 0 or (_int(row.get("JV_HMSTD")) or 0) > 0
    parcel = (row.get("PARCEL_ID") or "").strip()
    return {
        "source_key": f"parcel:{county_fips}:{normalize_parcel(parcel)}",
        "parcel_id": parcel,
        "county_fips": county_fips,
        "address": (row.get("PHY_ADDR1") or "").strip() or None,
        "city": (row.get("PHY_CITY") or "").strip().title() or None,
        "zip": (row.get("PHY_ZIPCD") or "").strip()[:5] or None,
        "land_use_code": code,
        "land_use": LAND_USE.get(code or ""),
        "property_type": property_type(code),
        "sqft": _int(row.get("TOT_LVG_AREA")),
        "lot_size_sqft": _int(row.get("LND_SQFOOT")),
        "year_built": _int(row.get("ACT_YR_BLT")) or _int(row.get("EFF_YR_BLT")),
        "market_value": _int(row.get("JV")),
        "assessed_value": _int(row.get("AV_SD")),
        "last_sale_price": _int(row.get("SALE_PRC1")),
        "last_sale_date": date(yr, mo if mo and 1 <= mo <= 12 else 1, 1).isoformat() if yr else None,
        "homestead": homestead,
        "appraiser_url": appraiser_url,
    }


def to_owner(row: dict, property_id: str, tax_year: int) -> dict:
    name = re.sub(r"\s{2,}", " ", (row.get("OWN_NAME") or "").strip())
    mail1 = " ".join(x for x in ((row.get("OWN_ADDR1") or "").strip(), (row.get("OWN_ADDR2") or "").strip()) if x)
    mstate = (row.get("OWN_STATE") or "").strip().upper()
    mzip = (row.get("OWN_ZIPCD") or "").strip()[:5]
    phy, pzip = row.get("PHY_ADDR1"), (row.get("PHY_ZIPCD") or "").strip()[:5]
    absentee = None
    if mail1 and phy:
        absentee = street_key(row.get("OWN_ADDR1")) != street_key(phy) or (bool(mzip and pzip) and mzip != pzip)
    elif mail1 and not phy:
        absentee = True  # vacant land with no site address: the owner lives elsewhere by definition
    return {
        "property_id": property_id,
        "name": name or "Unknown",
        "mailing_address": mail1 or None,
        "mailing_city": (row.get("OWN_CITY") or "").strip().title() or None,
        "mailing_state": mstate or None,
        "mailing_zip": mzip or None,
        "owner_type": owner_type(name),
        "absentee": absentee,
        "out_of_state": bool(mstate) and mstate not in ("FL", "FLORIDA"),
        "source": f"fl_dor_nal:{tax_year}",
    }


QUALIFIED_SALE_CODES = ("01", "02", "03", "05", "06")


def to_sales(row: dict) -> list[dict]:
    """The roll's last two sales (SALE_*1, SALE_*2) as property_sales rows, without property_id."""
    sales = []
    for i in ("1", "2"):
        yr, mo, price = _int(row.get(f"SALE_YR{i}")), _int(row.get(f"SALE_MO{i}")), _int(row.get(f"SALE_PRC{i}"))
        if yr and price:
            book_page = "/".join(x for x in (row.get(f"OR_BOOK{i}"), row.get(f"OR_PAGE{i}")) if x)
            sales.append({"sale_date": f"{yr}-{(mo or 1):02d}-01", "price": price,
                          "qualified": row.get(f"QUAL_CD{i}") in QUALIFIED_SALE_CODES,
                          "book_page": book_page or None, "source": "fl_dor_nal"})
    return sales
