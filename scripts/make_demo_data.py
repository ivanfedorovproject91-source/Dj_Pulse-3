"""Генератор DEMO-данных ТОЛЬКО для разработки интерфейса.

Все артисты и цифры здесь вымышленные, в meta.json стоит demo=true, и приложение
показывает заметную плашку DEMO. В продакшн-сборку эти файлы не попадают
(их берёт только `npm run dev:demo` / `npm run build:demo`).

Запуск:  python scripts/make_demo_data.py
"""
import json
import random
import sys
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from djpulse import config  # noqa: E402
from djpulse.analytics import insights as ins  # noqa: E402
from djpulse.analytics import trends  # noqa: E402
from djpulse.digest import build_digest  # noqa: E402

OUT = ROOT / "frontend" / "public" / "demo-data"
OUT.mkdir(parents=True, exist_ok=True)
rnd = random.Random(7)
TODAY = date.today()
END = TODAY - timedelta(days=1)
NOW = TODAY.isoformat() + "T06:00:00Z"
GENRES = config.GENRES


def walk(days, base, drift, vol=0.05):
    out, v = {}, base
    for i in range(days, 0, -1):
        v = max(10, v * (1 + drift / 365 + rnd.gauss(0, vol)))
        out[(TODAY - timedelta(days=i)).isoformat()] = int(v)
    return out


profiles = {  # (база, дрейф за год) — вымышленные профили для проверки UI
    "organic-house": (900, 1.2), "afro-house": (1100, 1.6), "melodic-house": (1500, 0.5), "melodic-techno": (2600, 0.4),
    "progressive-house": (1400, 0.1), "deep-house": (3000, 0.0), "tech-house": (2400, -0.2), "indie-dance": (700, 0.7),
    "minimal-deep-tech": (800, 0.2), "house": (9000, 0.0), "techno": (8000, 0.1), "hard-techno": (1200, 1.1),
    "trance": (4200, -0.1), "drum-and-bass": (3500, 0.1), "uk-garage": (1300, 0.6), "amapiano": (1800, 1.4),
    "downtempo": (900, -0.3), "electronica": (2200, -0.4),
}
daily = {g.id: walk(400, *profiles[g.id]) for g in GENRES}
table = trends.genre_table(daily, END, config.SETTINGS.thresholds)

genres = []
for g in GENRES:
    r = table[g.id]
    lf = {(TODAY - timedelta(days=d)).isoformat(): int(50000 * (1 + (30 - d) * 0.002)) for d in (0, 30, 60)} if g.id in ("afro-house", "techno") else {}
    genres.append({
        "id": g.id, "name": g.name, "score": r["score"], "level": r["level"], "changes": r["changes"], "status": r["status"],
        "history_days": r["history_days"],
        "signals": {"lastfm_growth_30d": trends.snapshot_growth(lf, TODAY, 30) if lf else None, "lastfm_reach": max(lf.values()) if lf else None},
        "history": {"wiki": sorted((d, v) for d, v in daily[g.id].items() if d >= (TODAY - timedelta(days=365)).isoformat()),
                    "lf_reach": sorted(lf.items())},
        "wiki_article": g.wiki[0], "sources": ["Wikipedia Pageviews"] + (["Last.fm"] if lf else []), "as_of": END.isoformat(),
    })

COUNTRY_CODES = ["RU", "RU", "RU", "RU", "US", "GB", "DE", "NL", "FR", "ES", "IT", "BR", "UA", "PL", "TR", "ZA"]
SUFFIX = ["Echo", "Pulse", "Drift", "Nova", "Haze", "Orbit", "Flux", "Vale", "Neon", "Moss", "Ritual", "Signal"]
artists = []
for i in range(48):
    name = f"Demo {SUFFIX[i % len(SUFFIX)]} {i + 1:02d}"
    country = COUNTRY_CODES[i % len(COUNTRY_CODES)]
    gids = rnd.sample([g.id for g in GENRES], 2)
    pop = round(rnd.uniform(5, 99), 1)
    growth = round(rnd.gauss(8, 20), 1)
    srcs = rnd.sample(["Last.fm", "Deezer", "YouTube", "Wikipedia"], rnd.choice([1, 2, 3]))
    sig = [{"source": s, "metric": s, "d30": round(growth + rnd.gauss(0, 6), 1), "d90": round(growth * 1.8 + rnd.gauss(0, 8), 1)} for s in srcs]
    rising = None
    conf = [s for s in sig if s["d30"] >= 15]
    if growth >= 15 and conf:
        rising = {"reason": "Рост за 30 дн. по: " + ", ".join(f"{s['source']} {s['d30']:+.0f}%" for s in conf),
                  "sources": sorted({s["source"] for s in conf}), "n_signals": len(conf)}
    base = int(10 ** rnd.uniform(3.5, 6.3))
    lf_hist = sorted((d, int(v)) for d, v in
                     {(TODAY - timedelta(days=k)).isoformat(): base * (1 - growth / 100 * k / 30 * 0.6) for k in range(60, -1, -10)}.items())
    metrics = {}
    if "Last.fm" in srcs:
        metrics["lf_listeners"] = {"value": base, "as_of": END.isoformat(), "source": "Last.fm"}
    if "Deezer" in srcs:
        metrics["dz_fans"] = {"value": int(base * 0.4), "as_of": END.isoformat(), "source": "Deezer"}
    if "YouTube" in srcs:
        metrics["yt_subs"] = {"value": int(base * 0.25), "as_of": END.isoformat(), "source": "YouTube"}
    if "Wikipedia" in srcs:
        metrics["wiki_views_7d_avg"] = {"value": round(base / 400, 1), "as_of": END.isoformat(), "source": "Wikipedia"}
    artists.append({
        "id": f"demo-{i + 1:02d}", "name": name, "country": country, "country_source": "MusicBrainz", "genres": sorted(gids), "photo": None,
        "links": {"musicbrainz": "https://musicbrainz.org/"}, "metrics": metrics, "popularity": pop, "n_sources": len(srcs), "sources": srcs,
        "growth_30d": growth, "growth_90d": round(growth * 1.8, 1), "signals": sig, "rising": rising,
        "history": {"lf_listeners": lf_hist} if "Last.fm" in srcs else {},
    })

tracks = []
for i in range(30):
    a = artists[i % len(artists)]
    prev = None if i % 5 == 0 else max(1, i + 1 + rnd.randint(-6, 8))
    tracks.append({
        "id": f"demo-t{i + 1}", "title": f"Demo Track {i + 1:02d}", "artist": a["name"], "cover": None, "url": "https://example.com/", "preview": None,
        "source": "deezer" if i < 15 else "lastfm", "chart": "Deezer · Electro" if i < 15 else "Last.fm · тег",
        "genre": None if i < 15 else a["genres"][0], "chart_position": i + 1 if i < 15 else (i - 14),
        "previous_position": prev, "position_delta": (prev - (i + 1)) if prev and i < 15 else None,
        "release_date": (TODAY - timedelta(days=rnd.randint(2, 200))).isoformat() if i < 15 else None, "as_of": TODAY.isoformat(),
        "history": [((TODAY - timedelta(days=k)).isoformat(), max(1, i + 1 + rnd.randint(-4, 4))) for k in range(10, -1, -1)] if i < 15 else [],
    })

releases = [{"mbid": f"demo-r{i}", "title": f"Demo Release {i + 1}", "artist": artists[i]["name"], "date": (TODAY - timedelta(days=i * 2 + 1)).isoformat(),
             "type": rnd.choice(["EP", "Single", "Album"]), "artist_mbid": None, "url": "https://musicbrainz.org/", "genre": GENRES[i % len(GENRES)].id}
            for i in range(14)]
news = [{"title": f"Demo headline {i + 1}", "link": "https://example.com/", "source": rnd.choice(["Mixmag", "DJ Mag", "Resident Advisor"]),
         "source_id": "demo", "published": (TODAY - timedelta(days=i)).isoformat() + "T09:00:00Z"} for i in range(8)]

gname = {g.id: g.name for g in GENRES}
countries = []
for c in config.COUNTRIES:
    origin = sorted([a for a in artists if a["country"] == c.code], key=lambda a: -(a["popularity"] or 0))
    gc = {}
    for a in origin:
        for gid in a["genres"]:
            gc[gid] = gc.get(gid, 0) + 1
    countries.append({"code": c.code, "name_ru": c.name_ru, "name_en": c.name_en, "listeners": None,
                      "origin": {"source": "MusicBrainz (страна происхождения артиста)", "n_artists": len(origin),
                                 "n_rising": sum(1 for a in origin if a["rising"]), "top_artists": [a["id"] for a in origin[:10]],
                                 "rising_artists": [a["id"] for a in origin if a["rising"]][:10],
                                 "genres": sorted(({"genre": g, "name": gname[g], "count": n} for g, n in gc.items()), key=lambda x: -x["count"])[:8]}})

insights = ins.build_insights(genres, artists, tracks, releases, TODAY)
sources = {
    "wikipedia": {"status": "ok", "last_success": NOW, "last_attempt": NOW, "message": None},
    "lastfm": {"status": "ok", "last_success": NOW, "last_attempt": NOW, "message": None},
    "deezer": {"status": "error", "last_success": (TODAY - timedelta(days=2)).isoformat() + "T06:00:00Z", "last_attempt": NOW, "message": "DEMO: пример ошибки источника"},
    "musicbrainz": {"status": "ok", "last_success": NOW, "last_attempt": NOW, "message": None},
    "youtube": {"status": "disabled", "last_attempt": NOW, "message": "ключ YOUTUBE_API_KEY не задан — источник отключён (необязательный)"},
    "rss:mixmag": {"status": "ok", "last_success": NOW, "last_attempt": NOW, "name": "Mixmag", "message": None},
}
meta = {"schema": 1, "generated_at": NOW, "data_date": TODAY.isoformat(), "status": "partial", "demo": True,
        "errors": ["DEMO: deezer — пример ошибки"], "counts": {"genres": len(genres), "artists": len(artists), "tracks": len(tracks), "releases": len(releases), "news": len(news)},
        "history_days_max": 400}

files = {"meta": meta, "genres": {"generated_at": NOW, "items": genres}, "artists": {"generated_at": NOW, "items": artists},
         "tracks": {"generated_at": NOW, "items": tracks}, "releases": {"generated_at": NOW, "items": releases},
         "news": {"generated_at": NOW, "items": news}, "countries": {"generated_at": NOW, "items": countries},
         "insights": {"generated_at": NOW, **insights}, "sources": sources, "digest": build_digest(meta, genres, artists, tracks, insights)}
for k, v in files.items():
    (OUT / f"{k}.json").write_text(json.dumps(v, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
print("DEMO data →", OUT, {k: (OUT / f"{k}.json").stat().st_size for k in files})
