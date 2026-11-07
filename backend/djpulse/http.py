"""HTTP-клиент: идентифицирующий User-Agent, лимит частоты по хосту, ретраи."""
from __future__ import annotations

import time
from collections import defaultdict
from urllib.parse import urlparse

import requests

from .config import USER_AGENT


class SourceError(Exception):
    """Источник недоступен или вернул неожиданный ответ."""


class Http:
    # минимальный интервал между запросами к одному хосту (сек)
    MIN_INTERVAL = {
        "musicbrainz.org": 1.1,
        "ws.audioscrobbler.com": 0.25,
        "api.deezer.com": 0.12,
        "wikimedia.org": 0.02,
        "en.wikipedia.org": 0.05,
        "ru.wikipedia.org": 0.05,
        "www.wikidata.org": 0.1,
    }

    def __init__(self, session: requests.Session | None = None, sleep=time.sleep, clock=time.monotonic):
        self.session = session or requests.Session()
        self.session.headers.update({"User-Agent": USER_AGENT, "Accept": "application/json"})
        self._last: dict[str, float] = defaultdict(float)
        self._sleep = sleep
        self._clock = clock

    def _throttle(self, host: str) -> None:
        gap = self.MIN_INTERVAL.get(host, 0.1)
        wait = self._last[host] + gap - self._clock()
        if wait > 0:
            self._sleep(wait)
        self._last[host] = self._clock()

    def get(self, url: str, params: dict | None = None, *, retries: int = 3, timeout: int = 25,
            expect_json: bool = True, ok_404: bool = False):
        host = urlparse(url).netloc
        last_err: Exception | None = None
        for attempt in range(retries):
            self._throttle(host)
            try:
                resp = self.session.get(url, params=params, timeout=timeout)
            except requests.RequestException as exc:  # сеть
                last_err = exc
                self._sleep(1.5 * (attempt + 1))
                continue
            if resp.status_code == 404 and ok_404:
                return None
            if resp.status_code in (429, 500, 502, 503, 504):
                last_err = SourceError(f"HTTP {resp.status_code} от {host}")
                retry_after = resp.headers.get("Retry-After")
                delay = float(retry_after) if retry_after and retry_after.isdigit() else 2.0 * (attempt + 1)
                self._sleep(min(delay, 30))
                continue
            if resp.status_code >= 400:
                raise SourceError(f"HTTP {resp.status_code} от {host}: {resp.text[:160]}")
            if not expect_json:
                return resp.text
            try:
                return resp.json()
            except ValueError as exc:
                raise SourceError(f"{host}: ответ не JSON") from exc
        raise SourceError(f"{host}: недоступен ({last_err})")
