"""Чистые функции расчёта трендов. Никаких обращений к сети и файлам — легко тестировать.

Определения (они же показаны в приложении на странице «Источники и методика»):

* level(t)      — среднее значение за 7 дней, заканчивающихся днём t (нужно ≥5 дней из 7).
* change_N      — процентное изменение level(сейчас) относительно level(N дней назад).
                  Если базы нет или она нулевая — None («нет данных», а не 0%).
* Trend Score   — 100 × level(сейчас) / max(level по всем отслеживаемым жанрам).
                  Это ОТНОСИТЕЛЬНАЯ величина (доля внимания среди отслеживаемых), не абсолют.
* Статус        — по порогам из Thresholds; без достаточной истории → "insufficient".
"""
from __future__ import annotations

from datetime import date, timedelta
from statistics import mean

from ..config import Thresholds

Series = dict[str, float]  # {"YYYY-MM-DD": value}


def level_at(series: Series, end: date, window: int = 7, min_points: int = 5) -> float | None:
    vals = []
    for i in range(window):
        v = series.get((end - timedelta(days=i)).isoformat())
        if v is not None:
            vals.append(v)
    return mean(vals) if len(vals) >= min_points else None


def pct_change(now: float | None, then: float | None) -> float | None:
    if now is None or then is None or then <= 0:
        return None
    return round((now - then) / then * 100.0, 1)


def changes(series: Series, end: date) -> dict[str, float | None]:
    now = level_at(series, end)
    return {
        "d7": pct_change(now, level_at(series, end - timedelta(days=7))),
        "d30": pct_change(now, level_at(series, end - timedelta(days=30))),
        "d90": pct_change(now, level_at(series, end - timedelta(days=90))),
        "y1": pct_change(now, level_at(series, end - timedelta(days=365))),
    }


def history_days(series: Series) -> int:
    if not series:
        return 0
    ds = sorted(series)
    return (date.fromisoformat(ds[-1]) - date.fromisoformat(ds[0])).days + 1


def classify(score: float | None, ch: dict[str, float | None], hist_days: int, th: Thresholds) -> str:
    """rising | stable | declining | emerging | insufficient"""
    d30, d7 = ch.get("d30"), ch.get("d7")
    if score is None or d30 is None or hist_days < th.min_history_days_for_status:
        return "insufficient"
    if score <= th.emerging_max_score and d30 >= th.emerging_30d:
        return "emerging"
    if d30 >= th.rising_30d and (d7 is None or d7 > 0):
        return "rising"
    if d30 <= th.declining_30d and (d7 is None or d7 < 0):
        return "declining"
    return "stable"


def genre_table(daily: dict[str, Series], end: date, th: Thresholds) -> dict[str, dict]:
    """daily: {genre_id: {день: просмотры}} → метрики по каждому жанру."""
    levels = {gid: level_at(s, end) for gid, s in daily.items()}
    top = max((v for v in levels.values() if v is not None), default=None)
    out = {}
    for gid, s in daily.items():
        lv = levels[gid]
        score = round(100.0 * lv / top, 1) if lv is not None and top else None
        ch = changes(s, end)
        hd = history_days(s)
        out[gid] = {
            "level": round(lv, 1) if lv is not None else None,
            "score": score,
            "changes": ch,
            "history_days": hd,
            "status": classify(score, ch, hd, th),
        }
    return out


def snapshot_growth(series: Series, today: date, days: int = 30, tolerance: int = 4) -> float | None:
    """Рост «снимочного» показателя (подписчики/слушатели) за ~days дней.
    Берём ближайшую точку к today-days в пределах ±tolerance дней; нет точки — None."""
    if not series:
        return None
    last_day = max(series)
    now = series[last_day]
    target = date.fromisoformat(last_day) - timedelta(days=days)
    best = None
    for d, v in series.items():
        gap = abs((date.fromisoformat(d) - target).days)
        if gap <= tolerance and (best is None or gap < best[0]):
            best = (gap, v)
    return pct_change(now, best[1]) if best else None


def percentile_ranks(values: dict[str, float]) -> dict[str, float]:
    """0..100: доля артистов с МЕНЬШИМ значением. Устойчиво к разнице масштабов источников."""
    if not values:
        return {}
    items = sorted(values.values())
    n = len(items)
    if n == 1:
        return {k: 100.0 for k in values}
    out = {}
    for k, v in values.items():
        below = sum(1 for x in items if x < v)
        out[k] = round(100.0 * below / (n - 1), 1)
    return out
