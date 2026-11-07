"""Формирует текст дайджеста для Telegram-бота из уже посчитанных данных (HTML parse_mode)."""
from __future__ import annotations

from html import escape


def _pct(v) -> str:
    return "—" if v is None else f"{v:+.0f}%"


def build_digest(meta: dict, genres: list[dict], artists: list[dict], tracks: list[dict], insights: dict) -> dict:
    sections: dict[str, str] = {}
    ready = [g for g in genres if g["status"] != "insufficient" and g["changes"]["d7"] is not None]

    wt = insights.get("weekly_trend")
    if wt:
        sections["trend"] = f"🔥 <b>Главный тренд недели:</b> {escape(wt['text'])}"

    risers = sorted([g for g in ready if g["changes"]["d30"] is not None], key=lambda g: -g["changes"]["d30"])[:5]
    if risers:
        lines = [f"• {escape(g['name'])}: {_pct(g['changes']['d7'])} / 7д, {_pct(g['changes']['d30'])} / 30д" for g in risers]
        sections["genres"] = "📈 <b>Жанры: топ роста</b>\n" + "\n".join(lines)

    rising = sorted([a for a in artists if a.get("rising")], key=lambda a: -(a["growth_30d"] or 0))[:5]
    if rising:
        lines = [f"• {escape(a['name'])} ({escape(a['country'] or '—')}): {_pct(a['growth_30d'])} / 30д" for a in rising]
        sections["rising"] = "🚀 <b>Rising DJs</b>\n" + "\n".join(lines)

    ru = sorted([a for a in artists if a.get("country") == "RU" and a.get("rising")], key=lambda a: -(a["growth_30d"] or 0))[:3]
    if ru:
        sections["russia"] = "🇷🇺 <b>Russia Scene</b>\n" + "\n".join(
            f"• {escape(a['name'])}: {_pct(a['growth_30d'])} / 30д" for a in ru)

    movers = sorted([t for t in tracks if t.get("position_delta") and t["position_delta"] > 0],
                    key=lambda t: -t["position_delta"])[:3]
    if movers:
        sections["tracks"] = "🎧 <b>Растут в чарте Deezer</b>\n" + "\n".join(
            f"• {escape(t['artist'])} — {escape(t['title'])} (#{t['chart_position']}, ↑{t['position_delta']})" for t in movers)

    notes = insights.get("items", [])[:2]
    if notes:
        sections["insights"] = "💡 <b>Выводы</b>\n" + "\n".join(f"• {escape(i['body'])}" for i in notes)

    status_line = f"Данные на {meta['data_date']} · статус: {meta['status']}"
    if meta["status"] != "ok":
        status_line += " ⚠️ часть источников недоступна"
    return {"generated_at": meta["generated_at"], "data_date": meta["data_date"], "status": meta["status"],
            "sections": sections, "footer": escape(status_line),
            "order": ["trend", "genres", "rising", "russia", "tracks", "insights"]}
