"""Wikipedia: просмотры статей (Wikimedia Pageviews API) — публичный, без ключа.

Что это за показатель: «внимание аудитории» к статье о жанре/артисте. Это косвенный
показатель интереса, а не число прослушиваний. В интерфейсе он так и подписан.
Исторические данные доступны сразу (бэкфилл), поэтому графики жанров за год
строятся с первого запуска.
"""
from __future__ import annotations

from datetime import date, timedelta
from urllib.parse import quote

from ..http import Http, SourceError

API = "https://{lang}.wikipedia.org/w/api.php"
PV = "https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/{lang}.wikipedia.org/all-access/user/{title}/daily/{start}/{end}"


def resolve_titles(http: Http, candidates: list[str], lang: str = "en") -> dict[str, str | None]:
    """Приводит названия к реальным статьям с учётом редиректов. None — статьи нет."""
    out: dict[str, str | None] = {}
    for i in range(0, len(candidates), 40):
        chunk = candidates[i : i + 40]
        data = http.get(
            API.format(lang=lang),
            {"action": "query", "titles": "|".join(chunk), "redirects": 1, "format": "json", "formatversion": 2},
        )
        q = (data or {}).get("query") or {}
        norm = {n["from"]: n["to"] for n in q.get("normalized", [])}
        redir = {r["from"]: r["to"] for r in q.get("redirects", [])}
        missing = {p["title"] for p in q.get("pages", []) if p.get("missing") or p.get("invalid")}
        for c in chunk:
            t = norm.get(c, c)
            for _ in range(5):  # цепочки редиректов
                if t in redir:
                    t = redir[t]
                else:
                    break
            out[c] = None if t in missing else t
    return out


def fetch_daily_views(http: Http, title: str, start: date, end: date, lang: str = "en") -> dict[str, int]:
    """Возвращает {YYYY-MM-DD: просмотры}. Пустой словарь, если данных нет."""
    url = PV.format(
        lang=lang,
        title=quote(title.replace(" ", "_"), safe=""),
        start=start.strftime("%Y%m%d") + "00",
        end=end.strftime("%Y%m%d") + "00",
    )
    data = http.get(url, ok_404=True)
    if not data:
        return {}
    out: dict[str, int] = {}
    for item in data.get("items", []):
        ts = str(item.get("timestamp", ""))
        if len(ts) >= 8 and isinstance(item.get("views"), int):
            out[f"{ts[0:4]}-{ts[4:6]}-{ts[6:8]}"] = item["views"]
    return out


def date_window(last_known: str | None, today: date, backfill_days: int) -> tuple[date, date]:
    """Окно загрузки. Последний неполный день (сегодня) не берём.
    Если история уже есть — перекачиваем последние 7 дней (значения уточняются)."""
    end = today - timedelta(days=1)
    if last_known:
        start = max(date.fromisoformat(last_known) - timedelta(days=7), end - timedelta(days=backfill_days))
    else:
        start = end - timedelta(days=backfill_days)
    if start > end:
        raise SourceError("пустое окно дат для Wikipedia")
    return start, end
