"""Thin Supabase (PostgREST) client using the service-role key. Scraper-only: never ship this key to a browser."""
import json
import logging
import time
from typing import Any, Iterable

import httpx

from omf.config import SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL, require_supabase

log = logging.getLogger(__name__)


class DB:
    def __init__(self) -> None:
        require_supabase()
        self.rest = f"{SUPABASE_URL}/rest/v1"
        self.storage = f"{SUPABASE_URL}/storage/v1"
        # New-style secret keys (sb_secret_...) go in `apikey` only; legacy service_role JWTs also as Bearer.
        self.headers = {"apikey": SUPABASE_SERVICE_ROLE_KEY}
        if not SUPABASE_SERVICE_ROLE_KEY.startswith("sb_secret_"):
            self.headers["Authorization"] = f"Bearer {SUPABASE_SERVICE_ROLE_KEY}"
        self.client = httpx.Client(timeout=300, headers=self.headers)

    def _call(self, method: str, url: str, **kwargs) -> httpx.Response:
        for attempt in range(4):
            try:
                r = self.client.request(method, url, **kwargs)
            except httpx.TransportError as e:
                if attempt == 3:
                    raise
                log.warning("supabase %s failed (%s), retrying", url, e)
                time.sleep(2 ** attempt)
                continue
            if r.status_code >= 500 and attempt < 3:
                time.sleep(2 ** attempt)
                continue
            if r.status_code >= 400:
                raise RuntimeError(f"Supabase {method} {url} -> {r.status_code}: {r.text[:500]}")
            return r
        raise RuntimeError("unreachable")

    def rpc(self, fn: str, args: dict[str, Any] | None = None) -> Any:
        r = self._call("POST", f"{self.rest}/rpc/{fn}", content=json.dumps(args or {}),
                       headers={"Content-Type": "application/json"})
        return r.json() if r.content else None

    def select(self, table: str, params: dict[str, str]) -> list[dict]:
        out: list[dict] = []
        start = 0
        while True:
            r = self._call("GET", f"{self.rest}/{table}", params=params,
                           headers={"Range-Unit": "items", "Range": f"{start}-{start + 999}"})
            rows = r.json()
            out.extend(rows)
            if len(rows) < 1000:
                return out
            start += 1000

    def upsert(self, table: str, rows: Iterable[dict], on_conflict: str, returning: bool = False,
               chunk: int = 500) -> list[dict]:
        rows = list(rows)
        # PostgREST bulk inserts need the same keys in every row; missing ones become null
        keys = sorted({k for r in rows for k in r})
        rows = [{k: r.get(k) for k in keys} for r in rows]
        out: list[dict] = []
        for i in range(0, len(rows), chunk):
            r = self._call(
                "POST", f"{self.rest}/{table}", params={"on_conflict": on_conflict},
                content=json.dumps(rows[i:i + chunk], default=str),
                headers={"Content-Type": "application/json",
                         "Prefer": "resolution=merge-duplicates," + ("return=representation" if returning else "return=minimal")},
            )
            if returning:
                out.extend(r.json())
        return out

    def update(self, table: str, match: dict[str, str], values: dict) -> None:
        self._call("PATCH", f"{self.rest}/{table}", params={k: f"eq.{v}" for k, v in match.items()},
                   content=json.dumps(values, default=str),
                   headers={"Content-Type": "application/json", "Prefer": "return=minimal"})

    def insert(self, table: str, row: dict) -> dict:
        r = self._call("POST", f"{self.rest}/{table}", content=json.dumps(row, default=str),
                       headers={"Content-Type": "application/json", "Prefer": "return=representation"})
        return r.json()[0]

    def upload(self, bucket: str, path: str, data: bytes, content_type: str) -> None:
        self._call("POST", f"{self.storage}/object/{bucket}/{path}", content=data,
                   headers={"Content-Type": content_type, "x-upsert": "true"})
