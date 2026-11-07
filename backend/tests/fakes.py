"""Поддельный HTTP-слой для тестов. Формы ответов повторяют реальные API
(Wikimedia, Last.fm, Deezer, MusicBrainz, RSS) — но цифры тестовые и в продакшн не попадают."""
from __future__ import annotations

from datetime import date, timedelta
from urllib.parse import unquote

from djpulse.http import SourceError

RSS_OK = """<?xml version="1.0"?><rss version="2.0"><channel><title>T</title>
<item><title>  Big   release </title><link>https://example.com/a</link><pubDate>{d}</pubDate></item>
<item><title>No date</title><link>https://example.com/b</link></item>
<item><title>Bad link</title><link>javascript:x</link><pubDate>{d}</pubDate></item>
</channel></rss>"""


class FakeHttp:
    def __init__(self, today: date, *, fail_hosts=(), wiki_growth=1.0):
        self.today = today
        self.fail_hosts = set(fail_hosts)
        self.calls: list[str] = []
        self.wiki_growth = wiki_growth

    # --- helpers
    def _views(self, title: str, start: str, end: str):
        s = date(int(start[:4]), int(start[4:6]), int(start[6:8]))
        e = date(int(end[:4]), int(end[4:6]), int(end[6:8]))
        base = 1000 + (sum(map(ord, title)) % 500)
        items, d, i = [], s, 0
        while d <= e:
            age = (e - d).days
            mult = 1 + (self.wiki_growth - 1) * max(0, 1 - age / 60) if "Afro" in title else 1
            items.append({"timestamp": d.strftime("%Y%m%d") + "00", "views": int(base * mult)})
            d += timedelta(days=1); i += 1
        return {"items": items}

    def get(self, url, params=None, *, retries=3, timeout=25, expect_json=True, ok_404=False):
        self.calls.append(url)
        for h in self.fail_hosts:
            if h in url:
                raise SourceError(f"{h}: недоступен (fake)")
        params = params or {}
        if "wikipedia.org/w/api.php" in url and params.get("action") == "query":
            titles = params["titles"].split("|")
            pages = [{"title": t, **({"missing": True} if t == "Nonexistent genre" else {})} for t in titles]
            return {"query": {"pages": pages}}
        if "wikidata.org" in url:
            return {"entities": {params["ids"]: {"sitelinks": {"enwiki": {"title": "Fake Artist"}}}}}
        if "metrics/pageviews/per-article" in url:
            parts = url.split("/")
            title = unquote(parts[-4])
            return self._views(title, parts[-2], parts[-1])
        if "audioscrobbler" in url:
            m = params["method"]
            if m == "tag.getinfo":
                return {"tag": {"name": params["tag"], "reach": 5000, "total": 9000}}
            if m == "tag.gettopartists":
                return {"topartists": {"artist": [
                    {"name": "Artist One", "mbid": "", "url": "https://last.fm/a1"},
                    {"name": "Artist Two", "mbid": "", "url": "https://last.fm/a2"}]}}
            if m == "tag.gettoptracks":
                return {"tracks": {"track": [{"name": "Song", "artist": {"name": "Artist One"}, "url": "https://last.fm/t"}]}}
            if m == "artist.getinfo":
                return {"artist": {"name": params.get("artist", "X"), "url": "https://last.fm/x",
                                   "stats": {"listeners": "12345", "playcount": "99999"},
                                   "tags": {"tag": [{"name": "Deep House"}]}}}
            if m == "geo.gettopartists":
                return {"topartists": {"artist": [{"name": "Artist One", "listeners": "100"}, {"name": "Pop Star", "listeners": "90"}]}}
        if "api.deezer.com/chart/106/tracks" in url:
            return {"data": [{"id": 1, "title": "Chart Song", "link": "https://deezer.com/t/1", "preview": "https://p/1.mp3",
                              "position": 1, "artist": {"id": 10, "name": "Artist One"},
                              "album": {"cover_medium": "https://c/1.jpg"}}]}
        if "api.deezer.com/chart/106/artists" in url or "api.deezer.com/genre/106/artists" in url:
            return {"data": [{"id": 10, "name": "Artist One", "picture_medium": "https://pic/10", "link": "https://deezer.com/a/10"}]}
        if "api.deezer.com/track/" in url:
            return {"release_date": "2026-05-01"}
        if "api.deezer.com/artist/" in url:
            return {"id": 10, "name": "Artist One", "nb_fan": 4321, "picture_medium": "https://pic/10", "link": "https://deezer.com/a/10"}
        if "api.deezer.com/search/artist" in url:
            return {"data": []}
        if "musicbrainz.org/ws/2/artist/" in url and "/artist/?" not in url and params.get("inc"):
            return {"id": url.rsplit("/", 1)[-1], "name": "Artist One", "country": "RU", "area": {"name": "Russia"},
                    "tags": [{"name": "deep house", "count": 5}],
                    "relations": [{"type": "wikidata", "url": {"resource": "https://www.wikidata.org/wiki/Q42"}}]}
        if url.endswith("/artist") and "musicbrainz" in url:
            q = params.get("query", "")
            if "country:RU" in q:
                return {"artists": [{"id": "mb-ru-1", "name": "Ruski DJ", "country": "RU", "score": 100}]}
            name = q.split('"')[1] if '"' in q else "Artist One"
            return {"artists": [{"id": "mb-" + name.replace(" ", ""), "name": name, "score": 100}]}
        if "release-group" in url:
            return {"release-groups": [
                {"id": "rg1", "title": "New EP", "primary-type": "EP", "first-release-date": "2026-06-20",
                 "artist-credit": [{"name": "Artist One", "joinphrase": "", "artist": {"id": "mb-ArtistOne"}}]},
                {"id": "rg2", "title": "Fuzzy", "first-release-date": "2026-06",
                 "artist-credit": [{"name": "Z", "joinphrase": "", "artist": {"id": "z"}}]}]}
        if expect_json is False:
            return RSS_OK.format(d="Mon, 29 Jun 2026 10:00:00 GMT")
        raise SourceError(f"fake: нет заглушки для {url}")
