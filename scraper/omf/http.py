"""Polite HTTP: one request per second per host, browser user agent, retries with backoff."""
import logging
import random
import threading
import time
from urllib.parse import urlparse

import httpx

from omf.config import USER_AGENT

log = logging.getLogger(__name__)

_last_hit: dict[str, float] = {}
_lock = threading.Lock()
MIN_INTERVAL = 1.0


def wait_for_host(url: str, min_interval: float = MIN_INTERVAL) -> None:
    host = urlparse(url).netloc.lower()
    with _lock:
        now = time.monotonic()
        ready = _last_hit.get(host, 0) + min_interval
        if ready > now:
            time.sleep(ready - now)
        _last_hit[host] = time.monotonic()


class PoliteClient:
    def __init__(self, timeout: float = 60, retries: int = 4, min_interval: float = MIN_INTERVAL, **kwargs):
        headers = {"User-Agent": USER_AGENT, **kwargs.pop("headers", {})}
        self.client = httpx.Client(timeout=timeout, headers=headers, follow_redirects=True, **kwargs)
        self.retries = retries
        self.min_interval = min_interval

    def request(self, method: str, url: str, **kwargs) -> httpx.Response:
        for attempt in range(self.retries + 1):
            wait_for_host(url, self.min_interval)
            try:
                r = self.client.request(method, url, **kwargs)
                if r.status_code in (429, 500, 502, 503, 504) and attempt < self.retries:
                    raise httpx.HTTPStatusError(f"retryable {r.status_code}", request=r.request, response=r)
                return r
            except (httpx.TransportError, httpx.HTTPStatusError) as e:
                if attempt >= self.retries:
                    raise
                delay = min(60, 2 ** attempt * 2) + random.uniform(0, 1)
                log.warning("%s %s failed (%s); retrying in %.0fs", method, url, e, delay)
                time.sleep(delay)
        raise RuntimeError("unreachable")

    def get(self, url: str, **kwargs) -> httpx.Response:
        return self.request("GET", url, **kwargs)

    def post(self, url: str, **kwargs) -> httpx.Response:
        return self.request("POST", url, **kwargs)
