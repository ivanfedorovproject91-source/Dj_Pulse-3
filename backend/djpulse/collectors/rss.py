"""RSS музыкальных изданий. Берём только заголовок, ссылку, дату и название издания —
текст статей не копируем (ссылка ведёт на оригинал)."""
from __future__ import annotations

import re
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime

from defusedxml import ElementTree as ET

from ..http import Http, SourceError

ATOM = "{http://www.w3.org/2005/Atom}"


def _parse_date(s: str | None) -> datetime | None:
    if not s:
        return None
    s = s.strip()
    try:
        dt = parsedate_to_datetime(s)
    except (TypeError, ValueError):
        try:
            dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
        except ValueError:
            return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def parse_feed(xml_text: str) -> list[dict]:
    try:
        root = ET.fromstring(xml_text)
    except Exception as exc:  # битый XML
        raise SourceError(f"RSS: не удалось разобрать XML ({exc})") from exc
    items = []
    for it in root.iter("item"):  # RSS 2.0
        title = (it.findtext("title") or "").strip()
        link = (it.findtext("link") or "").strip()
        dt = _parse_date(it.findtext("pubDate") or it.findtext("{http://purl.org/dc/elements/1.1/}date"))
        if title and link.startswith("http"):
            items.append({"title": title, "link": link, "published": dt})
    for it in root.iter(f"{ATOM}entry"):  # Atom
        title = (it.findtext(f"{ATOM}title") or "").strip()
        link_el = it.find(f"{ATOM}link")
        link = (link_el.get("href") if link_el is not None else "") or ""
        dt = _parse_date(it.findtext(f"{ATOM}published") or it.findtext(f"{ATOM}updated"))
        if title and link.startswith("http"):
            items.append({"title": title, "link": link, "published": dt})
    return items


def fetch_feed(http: Http, feed: dict) -> list[dict]:
    text = http.get(feed["url"], expect_json=False)
    out = []
    for it in parse_feed(text):
        if it["published"] is None:
            continue  # без даты не можем честно показать «свежесть»
        out.append({"title": re.sub(r"\s+", " ", it["title"]), "link": it["link"],
                    "source": feed["name"], "source_id": feed["id"],
                    "published": it["published"].strftime("%Y-%m-%dT%H:%M:%SZ")})
    return out
