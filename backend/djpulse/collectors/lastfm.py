"""Last.fm API (нужен бесплатный ключ, некоммерческое использование).

Берём: reach/taggings тега-жанра, топ артистов и треков по тегу, listeners/playcount
артиста, топы стран (география СЛУШАТЕЛЕЙ — не путать со страной происхождения).
Требование Last.fm: подпись «Powered by Last.fm / AudioScrobbler» — она есть в интерфейсе.
"""
from __future__ import annotations

from ..http import Http, SourceError

BASE = "https://ws.audioscrobbler.com/2.0/"


class LastFm:
    def __init__(self, http: Http, api_key: str):
        self.http = http
        self.key = api_key

    def _call(self, method: str, **params):
        data = self.http.get(BASE, {"method": method, "api_key": self.key, "format": "json", **params})
        if isinstance(data, dict) and "error" in data:
            raise SourceError(f"Last.fm {method}: ошибка {data.get('error')} — {data.get('message')}")
        return data

    @staticmethod
    def _int(v) -> int | None:
        try:
            return int(v)
        except (TypeError, ValueError):
            return None

    def tag_info(self, tag: str) -> dict:
        d = self._call("tag.getinfo", tag=tag).get("tag", {})
        # В разных версиях ответа поле называется total или taggings.
        return {"reach": self._int(d.get("reach")), "taggings": self._int(d.get("total", d.get("taggings")))}

    def tag_top_artists(self, tag: str, limit: int) -> list[dict]:
        items = self._call("tag.gettopartists", tag=tag, limit=limit).get("topartists", {}).get("artist", [])
        return [
            {"name": a["name"], "mbid": a.get("mbid") or None, "url": a.get("url"), "rank": i + 1}
            for i, a in enumerate(items) if a.get("name")
        ]

    def tag_top_tracks(self, tag: str, limit: int) -> list[dict]:
        items = self._call("tag.gettoptracks", tag=tag, limit=limit).get("tracks", {}).get("track", [])
        out = []
        for i, t in enumerate(items):
            artist = t.get("artist") or {}
            if not t.get("name") or not artist.get("name"):
                continue
            out.append({"title": t["name"], "artist": artist["name"], "url": t.get("url"), "rank": i + 1})
        return out

    def artist_info(self, name: str, mbid: str | None = None) -> dict | None:
        params = {"mbid": mbid} if mbid else {"artist": name, "autocorrect": 1}
        try:
            d = self._call("artist.getinfo", **params).get("artist")
        except SourceError as exc:
            if "ошибка 6" in str(exc):  # artist not found
                return None
            raise
        if not d:
            return None
        stats = d.get("stats") or {}
        tags = [t["name"].lower() for t in (d.get("tags") or {}).get("tag", []) if t.get("name")]
        return {
            "name": d.get("name", name),
            "url": d.get("url"),
            "listeners": self._int(stats.get("listeners")),
            "playcount": self._int(stats.get("playcount")),
            "tags": tags,
        }

    def geo_top_artists(self, country: str, limit: int) -> list[dict]:
        items = self._call("geo.gettopartists", country=country, limit=limit).get("topartists", {}).get("artist", [])
        return [
            {"name": a["name"], "mbid": a.get("mbid") or None, "listeners": self._int(a.get("listeners")), "rank": i + 1}
            for i, a in enumerate(items) if a.get("name")
        ]

    def geo_top_tracks(self, country: str, limit: int) -> list[dict]:
        items = self._call("geo.gettoptracks", country=country, limit=limit).get("tracks", {}).get("track", [])
        out = []
        for i, t in enumerate(items):
            artist = t.get("artist") or {}
            if t.get("name") and artist.get("name"):
                out.append({"title": t["name"], "artist": artist["name"], "listeners": self._int(t.get("listeners")),
                            "url": t.get("url"), "rank": i + 1})
        return out
