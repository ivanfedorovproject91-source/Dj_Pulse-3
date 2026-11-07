"""YouTube Data API v3 (нужен бесплатный ключ). Квота 10 000 единиц/сутки.

Используем ТОЛЬКО дешёвые вызовы channels.list (1 единица на 50 каналов).
Дорогой search.list (100 единиц) намеренно не используется. ID каналов берём из
ссылок MusicBrainz. subscriberCount может быть скрыт владельцем — тогда его нет.
"""
from __future__ import annotations

import re

from ..http import Http, SourceError

BASE = "https://www.googleapis.com/youtube/v3/channels"


def parse_channel_ref(url: str) -> tuple[str, str] | None:
    """('id', 'UC…') или ('handle', '@name') по ссылке на канал; иначе None."""
    m = re.search(r"youtube\.com/channel/(UC[\w-]{20,})", url)
    if m:
        return "id", m.group(1)
    m = re.search(r"youtube\.com/(@[\w.\-]+)", url)
    if m:
        return "handle", m.group(1)
    return None


def _item_stats(item: dict) -> dict:
    st = item.get("statistics") or {}
    subs = None if st.get("hiddenSubscriberCount") else _int(st.get("subscriberCount"))
    return {"channel_id": item.get("id"), "subscribers": subs, "views": _int(st.get("viewCount")),
            "title": (item.get("snippet") or {}).get("title")}


def _int(v):
    try:
        return int(v)
    except (TypeError, ValueError):
        return None


def channels_by_id(http: Http, key: str, ids: list[str]) -> dict[str, dict]:
    out: dict[str, dict] = {}
    for i in range(0, len(ids), 50):
        data = http.get(BASE, {"part": "statistics,snippet", "id": ",".join(ids[i:i + 50]), "key": key}) or {}
        if "error" in data:
            raise SourceError(f"YouTube: {data['error'].get('message', 'ошибка')}")
        for item in data.get("items", []):
            out[item["id"]] = _item_stats(item)
    return out


def channel_by_handle(http: Http, key: str, handle: str) -> dict | None:
    data = http.get(BASE, {"part": "statistics,snippet", "forHandle": handle, "key": key}) or {}
    if "error" in data:
        raise SourceError(f"YouTube: {data['error'].get('message', 'ошибка')}")
    items = data.get("items") or []
    return _item_stats(items[0]) if items else None
