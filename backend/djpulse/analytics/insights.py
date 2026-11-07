"""Алгоритмические выводы (без ИИ). Каждый вывод содержит период, источники,
подтверждающие показатели и текст-пояснение. Если данных недостаточно — выводов
просто нет (мы не «додумываем»)."""
from __future__ import annotations

from datetime import date


def _pct(v: float) -> str:
    return f"{v:+.0f}%"


def build_insights(genres: list[dict], artists: list[dict], tracks: list[dict],
                   releases: list[dict], today: date) -> dict:
    items: list[dict] = []
    gname = {g["id"]: g["name"] for g in genres}
    ready = [g for g in genres if g["status"] != "insufficient" and g["changes"]["d30"] is not None]

    # 1. Рост жанров
    risers = sorted([g for g in ready if g["status"] in ("rising", "emerging")], key=lambda g: -g["changes"]["d30"])
    for g in risers[:3]:
        sigs = [{"label": "Wikipedia: просмотры, 30 дн.", "value": _pct(g["changes"]["d30"])}]
        if g["changes"]["d7"] is not None:
            sigs.append({"label": "Wikipedia: просмотры, 7 дн.", "value": _pct(g["changes"]["d7"])})
        srcs = ["Wikipedia Pageviews"]
        lf = (g.get("signals") or {}).get("lastfm_growth_30d")
        if lf is not None:
            sigs.append({"label": "Last.fm: слушатели тега, 30 дн.", "value": _pct(lf)})
            if lf > 0:
                srcs.append("Last.fm")
        multi = len(srcs) > 1
        body = (f"{g['name']}: внимание к жанру выросло на {_pct(g['changes']['d30'])} за 30 дней"
                + (" по нескольким независимым источникам." if multi else " (по данным Wikipedia; второй источник пока не подтверждает или недоступен)."))
        items.append({"id": f"genre-rise-{g['id']}", "type": "genre_rise", "genre": g["id"],
                      "title": f"{g['name']} набирает популярность", "body": body,
                      "period_days": 30, "sources": srcs, "evidence": sigs})

    # 2. Падение
    for g in sorted([g for g in ready if g["status"] == "declining"], key=lambda g: g["changes"]["d30"])[:2]:
        items.append({"id": f"genre-fall-{g['id']}", "type": "genre_fall", "genre": g["id"],
                      "title": f"{g['name']}: интерес снижается",
                      "body": f"Просмотры статьи о жанре за 30 дней изменились на {_pct(g['changes']['d30'])}.",
                      "period_days": 30, "sources": ["Wikipedia Pageviews"],
                      "evidence": [{"label": "Wikipedia: просмотры, 30 дн.", "value": _pct(g["changes"]["d30"])}]})

    # 3. Жанры с несколькими растущими артистами
    by_genre: dict[str, list[dict]] = {}
    for a in artists:
        if a.get("rising"):
            for gid in a.get("genres", []):
                by_genre.setdefault(gid, []).append(a)
    for gid, arr in sorted(by_genre.items(), key=lambda kv: -len(kv[1])):
        if len(arr) >= 2 and gid in gname:
            names = ", ".join(a["name"] for a in arr[:4])
            items.append({"id": f"artists-rise-{gid}", "type": "artists_rise", "genre": gid,
                          "title": f"{gname[gid]}: несколько артистов растут",
                          "body": f"За 30 дней заметный рост показателей у {len(arr)} артистов жанра: {names}.",
                          "period_days": 30,
                          "sources": sorted({s for a in arr for s in a["rising"]["sources"]}),
                          "evidence": [{"label": a["name"], "value": a["rising"]["reason"]} for a in arr[:4]]})
            break

    # 4. Новые релизы
    cnt: dict[str, int] = {}
    for r in releases:
        cnt[r["genre"]] = cnt.get(r["genre"], 0) + 1
    if cnt:
        gid, n = max(cnt.items(), key=lambda kv: kv[1])
        items.append({"id": f"releases-{gid}", "type": "releases", "genre": gid,
                      "title": f"{gname.get(gid, gid)}: больше всего новых релизов",
                      "body": f"В MusicBrainz за последние 30 дней найдено {n} релизов с тегом жанра (теги пользовательские — выборка неполная).",
                      "period_days": 30, "sources": ["MusicBrainz"],
                      "evidence": [{"label": "Релизов за 30 дн.", "value": str(n)}]})

    # 5. Движение в чарте Deezer
    movers = [t for t in tracks if t.get("source") == "deezer" and t.get("position_delta")]
    if movers:
        t = max(movers, key=lambda t: t["position_delta"])
        if t["position_delta"] > 0:
            items.append({"id": f"chart-mover-{t['id']}", "type": "chart_mover",
                          "title": f"{t['title']} — {t['artist']} поднимается в чарте",
                          "body": f"Позиция в электронном чарте Deezer выросла на {t['position_delta']} (сейчас #{t['chart_position']}).",
                          "period_days": 1, "sources": ["Deezer"],
                          "evidence": [{"label": "Позиция", "value": f"#{t['chart_position']}"}]})

    # «Главный тренд недели»: жанр с лучшим недельным изменением среди растущих
    cand = [g for g in ready if g["status"] in ("rising", "emerging") and g["changes"]["d7"] is not None]
    weekly = None
    if cand:
        g = max(cand, key=lambda g: g["changes"]["d7"])
        weekly = {"genre": g["id"], "name": g["name"], "d7": g["changes"]["d7"], "d30": g["changes"]["d30"],
                  "score": g["score"], "sources": ["Wikipedia Pageviews"],
                  "text": f"{g['name']}: {_pct(g['changes']['d7'])} за 7 дней, {_pct(g['changes']['d30'])} за 30"}
    return {"weekly_trend": weekly, "items": items}
