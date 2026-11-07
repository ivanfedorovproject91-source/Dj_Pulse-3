"""MusicBrainz — открытые метаданные (CC0), без ключа, лимит 1 запрос/сек.

Даёт: страну ПРОИСХОЖДЕНИЯ артиста, теги, ссылки (Wikidata, YouTube, сайт),
новые релизы по тегам жанров. Теги — пользовательские, поэтому качество фильтра
по жанру ограничено; в интерфейсе это отмечено.
"""
from __future__ import annotations

import re

from ..http import Http

BASE = "https://musicbrainz.org/ws/2"


def _norm(s: str) -> str:
    return "".join(ch for ch in s.lower() if ch.isalnum())


def search_artist(http: Http, name: str) -> dict | None:
    data = http.get(f"{BASE}/artist", {"query": f'artist:"{name}"', "fmt": "json", "limit": 5}) or {}
    target = _norm(name)
    best = None
    for a in data.get("artists", []):
        if _norm(a.get("name", "")) == target and int(a.get("score", 0)) >= 90:
            if best is None or int(a.get("score", 0)) > int(best.get("score", 0)):
                best = a
    return best


def lookup_artist(http: Http, mbid: str) -> dict | None:
    d = http.get(f"{BASE}/artist/{mbid}", {"inc": "url-rels+tags", "fmt": "json"}, ok_404=True)
    if not d:
        return None
    links: dict[str, str] = {}
    for rel in d.get("relations", []) or []:
        url = (rel.get("url") or {}).get("resource")
        t = rel.get("type")
        if not url:
            continue
        if t == "wikidata":
            links["wikidata"] = url
        elif t == "official homepage":
            links.setdefault("website", url)
        elif t == "youtube" or "youtube.com" in url:
            links.setdefault("youtube", url)
        elif t == "soundcloud" or "soundcloud.com" in url:
            links.setdefault("soundcloud", url)
        elif "beatport.com" in url:
            links.setdefault("beatport", url)
    area = d.get("area") or {}
    tags = sorted((d.get("tags") or []), key=lambda t: -int(t.get("count", 0)))
    return {
        "mbid": d["id"],
        "name": d.get("name"),
        "country": d.get("country") or None,
        "area": area.get("name"),
        "type": d.get("type"),
        "tags": [t["name"].lower() for t in tags[:15] if t.get("name")],
        "links": links,
    }


def discover_by_country(http: Http, country: str, tag: str, limit: int) -> list[dict]:
    q = f'country:{country} AND tag:"{tag}" AND (type:person OR type:group)'
    data = http.get(f"{BASE}/artist", {"query": q, "fmt": "json", "limit": limit}) or {}
    return [
        {"mbid": a["id"], "name": a["name"], "country": a.get("country"), "score": int(a.get("score", 0))}
        for a in data.get("artists", []) if a.get("id") and a.get("name")
    ]


def recent_release_groups(http: Http, tag: str, since: str, until: str, limit: int = 25) -> list[dict]:
    q = (f'tag:"{tag}" AND firstreleasedate:[{since} TO {until}] '
         f'AND (primarytype:single OR primarytype:ep OR primarytype:album)')
    data = http.get(f"{BASE}/release-group", {"query": q, "fmt": "json", "limit": limit}) or {}
    out = []
    for r in data.get("release-groups", []):
        credits = r.get("artist-credit") or []
        artist = "".join((c.get("name", "") + c.get("joinphrase", "")) for c in credits).strip()
        date = r.get("first-release-date") or ""
        if not (r.get("id") and r.get("title") and artist and re.fullmatch(r"\d{4}-\d{2}-\d{2}", date)):
            continue  # неполная дата — не показываем «примерный» релиз
        out.append({
            "mbid": r["id"], "title": r["title"], "artist": artist, "date": date,
            "type": r.get("primary-type"),
            "artist_mbid": (credits[0].get("artist") or {}).get("id") if credits else None,
            "url": f"https://musicbrainz.org/release-group/{r['id']}",
        })
    return out


def wikidata_id(links: dict) -> str | None:
    m = re.search(r"/(Q\d+)$", links.get("wikidata", ""))
    return m.group(1) if m else None


def wikidata_sitelinks(http: Http, qid: str) -> dict[str, str]:
    d = http.get("https://www.wikidata.org/w/api.php", {
        "action": "wbgetentities", "ids": qid, "props": "sitelinks",
        "sitefilter": "enwiki|ruwiki", "format": "json"}) or {}
    sl = ((d.get("entities") or {}).get(qid) or {}).get("sitelinks") or {}
    out = {}
    if "enwiki" in sl:
        out["en"] = sl["enwiki"]["title"]
    if "ruwiki" in sl:
        out["ru"] = sl["ruwiki"]["title"]
    return out
