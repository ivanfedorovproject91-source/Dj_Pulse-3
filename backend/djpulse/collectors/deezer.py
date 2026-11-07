"""Deezer public API — без ключа (лимит ~50 запросов / 5 сек).

Даёт: чарт жанра «Electro» (id 106) с позициями, обложками и 30-сек. превью,
число фанатов артиста (nb_fan). Важно: Deezer не делит электронику на поджанры
и не даёт чарты по странам через публичный API — поэтому здесь это «Electro целиком».
"""
from __future__ import annotations

from ..http import Http

BASE = "https://api.deezer.com"
ELECTRO_GENRE_ID = 106


def _norm_name(s: str) -> str:
    return "".join(ch for ch in s.lower() if ch.isalnum())


def chart_tracks(http: Http, genre_id: int = ELECTRO_GENRE_ID, limit: int = 50) -> list[dict]:
    data = http.get(f"{BASE}/chart/{genre_id}/tracks", {"limit": limit}) or {}
    out = []
    for i, t in enumerate(data.get("data", [])):
        artist, album = t.get("artist") or {}, t.get("album") or {}
        if not t.get("id") or not t.get("title") or not artist.get("name"):
            continue
        out.append({
            "deezer_id": t["id"],
            "title": t["title"],
            "artist": artist["name"],
            "artist_deezer_id": artist.get("id"),
            "cover": album.get("cover_medium") or album.get("cover"),
            "url": t.get("link"),
            "preview": t.get("preview"),
            "position": t.get("position") or i + 1,
        })
    return out


def track_release_date(http: Http, track_id: int) -> str | None:
    d = http.get(f"{BASE}/track/{track_id}", ok_404=True) or {}
    rd = d.get("release_date")
    return rd if isinstance(rd, str) and len(rd) == 10 and rd != "0000-00-00" else None


def chart_artists(http: Http, genre_id: int = ELECTRO_GENRE_ID, limit: int = 50) -> list[dict]:
    data = http.get(f"{BASE}/chart/{genre_id}/artists", {"limit": limit}) or {}
    return [
        {"deezer_id": a["id"], "name": a["name"], "picture": a.get("picture_medium"), "url": a.get("link")}
        for a in data.get("data", []) if a.get("id") and a.get("name")
    ]


def genre_artists(http: Http, genre_id: int = ELECTRO_GENRE_ID) -> list[dict]:
    data = http.get(f"{BASE}/genre/{genre_id}/artists") or {}
    return [
        {"deezer_id": a["id"], "name": a["name"], "picture": a.get("picture_medium"), "url": a.get("link")}
        for a in data.get("data", []) if a.get("id") and a.get("name")
    ]


def artist_by_id(http: Http, deezer_id: int) -> dict | None:
    d = http.get(f"{BASE}/artist/{deezer_id}", ok_404=True)
    if not d or "error" in d:
        return None
    return {"deezer_id": d["id"], "name": d.get("name"), "fans": d.get("nb_fan"),
            "picture": d.get("picture_medium"), "url": d.get("link")}


def find_artist(http: Http, name: str) -> dict | None:
    """Поиск артиста по имени. Принимаем только точное совпадение имени (без регистра/знаков),
    иначе None — лучше пропуск, чем чужой артист с тем же именем."""
    data = http.get(f"{BASE}/search/artist", {"q": f'artist:"{name}"', "limit": 5}) or {}
    target = _norm_name(name)
    for a in data.get("data", []):
        if _norm_name(a.get("name", "")) == target:
            return {"deezer_id": a["id"], "name": a["name"], "fans": a.get("nb_fan"),
                    "picture": a.get("picture_medium"), "url": a.get("link")}
    return None
