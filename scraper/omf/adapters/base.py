"""The adapter contract and the run loop every source shares.

An adapter yields work items from discover(), expands each with fetch_details() (which may return
several raw records, e.g. one auction day -> many auctions), turns each record into a row with
normalize(), and writes rows with save(). One bad item is logged and skipped; the run continues.
"""
import logging
import traceback
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from typing import Any, Iterable

from omf.db import DB

log = logging.getLogger(__name__)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class Adapter(ABC):
    name: str = "adapter"
    county_fips: str | None = None

    @abstractmethod
    def discover(self) -> Iterable[Any]:
        """List work items (auction days, search pages, ...)."""

    @abstractmethod
    def fetch_details(self, item: Any) -> list[dict]:
        """Fetch the raw records behind one work item."""

    @abstractmethod
    def normalize(self, raw: dict) -> dict | None:
        """Map one raw record to the common schema (None = skip it)."""

    @abstractmethod
    def save(self, db: DB, rows: list[dict]) -> int:
        """Write normalized rows; return how many were written."""

    def finish(self, db: DB, stats: dict) -> None:
        """Hook after a successful run (mark stale rows inactive, update counters...)."""

    def close(self) -> None:
        pass


class RunLog:
    """One scrape_runs row per adapter run, with per-item errors."""

    MAX_LOGGED_ERRORS = 50

    def __init__(self, db: DB, adapter: str, county_fips: str | None):
        self.db = db
        self.row = db.insert("scrape_runs", {"adapter": adapter, "county_fips": county_fips})
        self.found = 0
        self.upserted = 0
        self.errors: list[dict] = []
        self.stats: dict[str, Any] = {}

    def error(self, where: str, exc: BaseException) -> None:
        log.warning("%s failed: %s", where, exc)
        if len(self.errors) < self.MAX_LOGGED_ERRORS:
            self.errors.append({"item": where, "error": f"{type(exc).__name__}: {exc}"[:500],
                                "trace": traceback.format_exc(limit=3)[-800:]})
        else:
            self.stats["errors_not_logged"] = self.stats.get("errors_not_logged", 0) + 1

    def close(self, failed: bool = False) -> None:
        n_err = len(self.errors) + self.stats.get("errors_not_logged", 0)
        status = "failed" if failed else ("partial" if n_err else "ok")
        self.db.update("scrape_runs", {"id": str(self.row["id"])}, {
            "finished_at": now_iso(), "status": status, "items_found": self.found,
            "items_upserted": self.upserted, "errors": n_err, "error_log": self.errors, "stats": self.stats,
        })


def run_adapter(db: DB, adapter: Adapter) -> RunLog:
    run = RunLog(db, adapter.name, adapter.county_fips)
    failed = False
    try:
        for item in adapter.discover():
            try:
                raws = adapter.fetch_details(item)
            except Exception as e:  # noqa: BLE001 - keep going on any single-item failure
                run.error(f"fetch {item}", e)
                continue
            rows = []
            for raw in raws:
                run.found += 1
                try:
                    row = adapter.normalize(raw)
                    if row is not None:
                        rows.append(row)
                except Exception as e:  # noqa: BLE001
                    run.error(f"normalize {str(raw)[:120]}", e)
            if rows:
                try:
                    run.upserted += adapter.save(db, rows)
                except Exception as e:  # noqa: BLE001
                    run.error(f"save {item} ({len(rows)} rows)", e)
        adapter.finish(db, run.stats)
    except Exception as e:  # noqa: BLE001 - discovery itself failed
        run.error("discover", e)
        failed = True
    finally:
        adapter.close()
        run.close(failed=failed)
    log.info("%s %s: found %d, saved %d, errors %d", adapter.name, adapter.county_fips or "",
             run.found, run.upserted, len(run.errors))
    return run
