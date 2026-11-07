"""Оркестратор сбора данных DJ PULSE.

Принципы:
* сбой одного источника не останавливает остальные (каждый шаг в try/except);
* при сбое предыдущие данные остаются, а в meta.json виден last_success источника;
* ни одного «придуманного» числа: нет данных → поле None → в интерфейсе «нет данных»;
* история накапливается в data/history/history.json (ежедневные точки).
"""
from __future__ import annotations

import re
import unicodedata
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from . import config
from .analytics import insights as insights_mod
from .analytics import trends
from .collectors import deezer, lastfm, musicbrainz, rss, wikipedia, youtube
from .digest import build_digest
from .http import Http, SourceError
from .store import History, SourceState, iso, read_json, utcnow, write_json

SCHEMA_VERSION = 1


def slugify(name: str) -> str:
    s = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s or "artist-" + format(abs(hash(name)) % 10**8, "08d")


def norm(s: str) -> str:
    return "".join(ch for ch in s.lower() if ch.isalnum())


def prev_value(series: dict, today: date, max_age: int = 3):
    """Последнее значение строго до today, не старше max_age дней."""
    best = None
    for d, v in series.items():
        dd = date.fromisoformat(d)
        if dd < today and (today - dd).days <= max_age and (best is None or dd > best[0]):
            best = (dd, v)
    return best[1] if best else None


class Pipeline:
    def __init__(self, env: dict, http: Http | None = None, today: date | None = None,
                 public_dir: Path | None = None, data_dir: Path | None = None):
        self.env = env
        self.http = http or Http()
        self.today = today or utcnow().date()
        self.public = public_dir or config.PUBLIC_DIR
        data = data_dir or config.DATA_DIR
        self.cache_dir = data / "cache"
        self.settings = config.SETTINGS
        self.genres = config.load_genres()
        self.hist = History(data / "history" / "history.json", self.settings.history_keep_days)
        self.state = SourceState(self.public / "sources.json")
        self.errors: list[str] = []
        self.lf = lastfm.LastFm(self.http, env["LASTFM_API_KEY"]) if env.get("LASTFM_API_KEY") else None
        self.yt_key = env.get("YOUTUBE_API_KEY")

    # ---------- утилиты ----------
    def _guard(self, sid: str, fn, *a, **kw):
        try:
            res = fn(*a, **kw)
            return res
        except SourceError as exc:
            self.state.fail(sid, str(exc)); self.errors.append(f"{sid}: {exc}")
        except Exception as exc:  # не даём одному источнику уронить остальные
            self.state.fail(sid, f"{type(exc).__name__}: {exc}"); self.errors.append(f"{sid}: {exc}")
        return None

    def _cache(self, name: str) -> dict:
        return read_json(self.cache_dir / name, {})

    def _save_cache(self, name: str, obj: dict) -> None:
        write_json(self.cache_dir / name, obj)

    # ---------- 1. Wikipedia: жанры ----------
    def step_wikipedia_genres(self) -> None:
        titles_cache = self._cache("wiki_titles.json")
        failures = 0
        resolved: dict[str, str] = {}
        def work():
            nonlocal failures
            need = sorted({c for g in self.genres for c in g.wiki if c not in titles_cache})
            if need:
                titles_cache.update(wikipedia.resolve_titles(self.http, need))
                self._save_cache("wiki_titles.json", titles_cache)
            for g in self.genres:
                title = next((titles_cache[c] for c in g.wiki if titles_cache.get(c)), None)
                if not title:
                    self.errors.append(f"wikipedia: нет статьи для жанра {g.name}"); failures += 1
                    continue
                resolved[g.id] = title
                ent = f"genre:{g.id}"
                start, end = wikipedia.date_window(self.hist.last_day(ent, "wiki"), self.today,
                                                   self.settings.wiki_backfill_days)
                try:
                    self.hist.put_many(ent, "wiki", wikipedia.fetch_daily_views(self.http, title, start, end))
                except SourceError as exc:
                    failures += 1; self.errors.append(f"wikipedia {g.name}: {exc}")
        self._guard("wikipedia", work)
        if resolved and failures == 0:
            self.state.ok("wikipedia", extra={"genres_loaded": len(resolved)})
        elif resolved:
            self.state.ok("wikipedia", f"частично: ошибок {failures} из {len(self.genres)}",
                          extra={"genres_loaded": len(resolved), "partial": True})
        self.wiki_genre_titles = resolved

    # ---------- 2. Last.fm: жанры, артисты, треки ----------
    def step_lastfm_genres(self) -> None:
        self.lf_tag_artists: dict[str, list[dict]] = {}
        self.lf_tag_tracks: dict[str, list[dict]] = {}
        if not self.lf:
            self.state.disabled("lastfm", "ключ LASTFM_API_KEY не задан — источник отключён")
            return
        done = 0
        def work():
            nonlocal done
            for g in self.genres:
                try:
                    info = self.lf.tag_info(g.lastfm_tag)
                    ent = f"genre:{g.id}"
                    self.hist.put(ent, "lf_reach", self.today.isoformat(), info["reach"])
                    self.hist.put(ent, "lf_taggings", self.today.isoformat(), info["taggings"])
                    self.lf_tag_artists[g.id] = self.lf.tag_top_artists(g.lastfm_tag, self.settings.top_artists_per_tag)
                    self.lf_tag_tracks[g.id] = self.lf.tag_top_tracks(g.lastfm_tag, self.settings.tracks_per_tag)
                    done += 1
                except SourceError as exc:
                    self.errors.append(f"lastfm {g.name}: {exc}")
        self._guard("lastfm", work)
        if done:
            self.state.ok("lastfm", None if done == len(self.genres) else f"частично: {done}/{len(self.genres)} жанров",
                          extra={"genres_loaded": done})

    # ---------- 3. Deezer ----------
    def step_deezer_chart(self) -> None:
        self.dz_tracks: list[dict] = []
        self.dz_artists: list[dict] = []
        def work():
            self.dz_tracks = deezer.chart_tracks(self.http)
            try:
                self.dz_artists = deezer.chart_artists(self.http) + deezer.genre_artists(self.http)
            except SourceError as exc:
                self.errors.append(f"deezer artists: {exc}")
            rel = self._cache("dz_release.json")
            for t in self.dz_tracks:
                key = str(t["deezer_id"])
                if key not in rel:
                    try:
                        rel[key] = deezer.track_release_date(self.http, t["deezer_id"]) or ""
                    except SourceError:
                        continue
                t["release_date"] = rel.get(key) or None
            self._save_cache("dz_release.json", rel)
        self._guard("deezer", work)
        if self.dz_tracks:
            self.state.ok("deezer", extra={"tracks": len(self.dz_tracks)})

    # ---------- 4. Реестр артистов ----------
    def build_candidates(self) -> dict[str, dict]:
        cands: dict[str, dict] = {}
        def add(name, **kw):
            k = norm(name)
            if not k:
                return
            c = cands.setdefault(k, {"name": name, "score": 0, "lf_genres": set(), "mbid": None, "deezer_id": None})
            c["score"] += kw.pop("w", 1)
            if kw.get("genre"):
                c["lf_genres"].add(kw["genre"])
            for f in ("mbid", "deezer_id"):
                if kw.get(f) and not c[f]:
                    c[f] = kw[f]
        for gid, arr in getattr(self, "lf_tag_artists", {}).items():
            for a in arr:
                add(a["name"], genre=gid, mbid=a.get("mbid"), w=max(1, 6 - a["rank"] // 5))
        for a in getattr(self, "dz_artists", []):
            add(a["name"], deezer_id=a["deezer_id"], w=2)
        for t in getattr(self, "dz_tracks", []):
            add(t["artist"], deezer_id=t.get("artist_deezer_id"), w=2)
        for k, c in read_json(self.cache_dir / "ru_discovered.json", {}).items():
            add(c["name"], mbid=c.get("mbid"), w=3)
        return cands

    def step_discover_ru(self) -> None:
        """Поиск российских артистов в MusicBrainz по стране RU и тегам жанров."""
        cache = self._cache("ru_discovered.json")
        def work():
            for g in self.genres[:9]:  # самые «клубные» жанры, чтобы уложиться в 1 запрос/сек
                found = musicbrainz.discover_by_country(self.http, "RU", g.mb_tag, 10)
                for a in found:
                    if a["score"] >= 70:
                        cache.setdefault(norm(a["name"]), {"name": a["name"], "mbid": a["mbid"]})
            self._save_cache("ru_discovered.json", cache)
        self._guard("musicbrainz", work)

    def step_artists(self) -> list[dict]:
        cands = self.build_candidates()
        top = sorted(cands.values(), key=lambda c: -c["score"])[: self.settings.max_registry_artists]
        mb_cache = self._cache("mb_artists.json")
        dz_cache = self._cache("dz_artists.json")
        wiki_cache = self._cache("wiki_artist_titles.json")
        budget = 60  # новых MB-запросов за один запуск; кэш накапливается между запусками
        mb_fail = 0
        artists: list[dict] = []
        for c in top:
            key = norm(c["name"])
            mb = mb_cache.get(key)
            if mb is None and budget > 0:
                try:
                    hit = musicbrainz.lookup_artist(self.http, c["mbid"]) if c["mbid"] else None
                    if not hit:
                        s = musicbrainz.search_artist(self.http, c["name"])
                        hit = musicbrainz.lookup_artist(self.http, s["id"]) if s else None
                    mb_cache[key] = hit or {"missing": True, "checked": self.today.isoformat()}
                    mb = mb_cache[key]
                    budget -= 1
                except SourceError:
                    mb_fail += 1
                    if mb_fail >= 5:
                        budget = 0
            if mb and mb.get("missing"):
                mb = None
            artists.append({"cand": c, "mb": mb})
        self._save_cache("mb_artists.json", mb_cache)
        if mb_cache:
            self.state.ok("musicbrainz", None if not mb_fail else f"частично: {mb_fail} ошибок",
                          extra={"artists_cached": len(mb_cache)})

        out = []
        for item in artists:
            c, mb = item["cand"], item["mb"]
            name = (mb or {}).get("name") or c["name"]
            aid = slugify(name)
            a = {"id": aid, "name": name, "country": (mb or {}).get("country"), "country_source": "MusicBrainz" if mb and mb.get("country") else None,
                 "mbid": (mb or {}).get("mbid") or c["mbid"], "links": dict((mb or {}).get("links") or {}),
                 "tags": list((mb or {}).get("tags") or []), "_lf_genres": set(c["lf_genres"]), "deezer_id": c["deezer_id"],
                 "photo": None, "metrics": {}, "sources": []}
            out.append(a)
        # Два имени-кандидата могут оказаться одним артистом в MusicBrainz — объединяем по mbid.
        by_mbid: dict[str, dict] = {}
        merged: list[dict] = []
        for a in out:
            if a["mbid"] and a["mbid"] in by_mbid:
                first = by_mbid[a["mbid"]]
                first["_lf_genres"] |= a["_lf_genres"]
                first["deezer_id"] = first["deezer_id"] or a["deezer_id"]
                continue
            if a["mbid"]:
                by_mbid[a["mbid"]] = a
            merged.append(a)
        out = merged
        # дубликаты id
        seen: dict[str, int] = {}
        for a in out:
            seen[a["id"]] = seen.get(a["id"], 0) + 1
            if seen[a["id"]] > 1:
                a["id"] = f"{a['id']}-{seen[a['id']]}"
        self._dz_cache, self._wiki_cache = dz_cache, wiki_cache
        return out

    # ---------- 5. Метрики артистов ----------
    def step_artist_metrics(self, artists: list[dict]) -> None:
        day = self.today.isoformat()
        # Last.fm
        if self.lf:
            ok = 0
            def lf_all():
                nonlocal ok
                for a in artists:
                    try:
                        info = self.lf.artist_info(a["name"], a["mbid"])
                    except SourceError as exc:
                        self.errors.append(f"lastfm artist {a['name']}: {exc}"); continue
                    if not info:
                        continue
                    ent = f"artist:{a['id']}"
                    self.hist.put(ent, "lf_listeners", day, info["listeners"])
                    self.hist.put(ent, "lf_playcount", day, info["playcount"])
                    a["links"].setdefault("lastfm", info["url"])
                    a["tags"] = list(dict.fromkeys(a["tags"] + info["tags"]))
                    ok += 1
            self._guard("lastfm_artists", lf_all)
            self.state.data.pop("lastfm_artists", None)  # отдельной строкой не показываем
            if ok:
                self.state.ok("lastfm", extra={"artists_loaded": ok, "genres_loaded": self.state.data.get("lastfm", {}).get("genres_loaded")})
        # Deezer (фанаты)
        dzc = self._dz_cache
        ok = 0
        def dz_all():
            nonlocal ok
            for a in artists:
                key = norm(a["name"])
                info = None
                try:
                    if a["deezer_id"]:
                        info = deezer.artist_by_id(self.http, a["deezer_id"])
                    elif key in dzc:
                        if dzc[key]:
                            info = deezer.artist_by_id(self.http, dzc[key])
                    else:
                        found = deezer.find_artist(self.http, a["name"])
                        dzc[key] = found["deezer_id"] if found else 0
                        info = deezer.artist_by_id(self.http, found["deezer_id"]) if found else None
                except SourceError:
                    continue
                if info:
                    a["deezer_id"] = info["deezer_id"]
                    a["photo"] = info.get("picture")
                    a["links"].setdefault("deezer", info.get("url"))
                    self.hist.put(f"artist:{a['id']}", "dz_fans", day, info.get("fans"))
                    ok += 1
        self._guard("deezer_artists", dz_all)
        self.state.data.pop("deezer_artists", None)
        self._save_cache("dz_artists.json", dzc)
        if ok:
            self.state.ok("deezer", extra={"tracks": len(self.dz_tracks), "artists_loaded": ok})
        # YouTube
        if self.yt_key:
            ids, handles = {}, {}
            for a in artists:
                ref = youtube.parse_channel_ref(a["links"].get("youtube", "")) if a["links"].get("youtube") else None
                if ref and ref[0] == "id":
                    ids[ref[1]] = a
                elif ref:
                    handles[ref[1]] = a
            yt_ok = 0
            def yt_all():
                nonlocal yt_ok
                for cid, st in youtube.channels_by_id(self.http, self.yt_key, list(ids)).items():
                    a = ids[cid]
                    self.hist.put(f"artist:{a['id']}", "yt_subs", day, st["subscribers"])
                    self.hist.put(f"artist:{a['id']}", "yt_views", day, st["views"])
                    yt_ok += 1
                for h, a in list(handles.items())[:60]:
                    st = youtube.channel_by_handle(self.http, self.yt_key, h)
                    if st:
                        self.hist.put(f"artist:{a['id']}", "yt_subs", day, st["subscribers"])
                        self.hist.put(f"artist:{a['id']}", "yt_views", day, st["views"])
                        yt_ok += 1
            self._guard("youtube", yt_all)
            if yt_ok:
                self.state.ok("youtube", extra={"channels": yt_ok})
        else:
            self.state.disabled("youtube", "ключ YOUTUBE_API_KEY не задан — источник отключён (необязательный)")
        # Wikipedia: статьи артистов через Wikidata (кэшируются)
        wc = self._wiki_cache
        def wiki_all():
            lookups = 40  # лимит новых запросов Wikidata за запуск
            for a in artists:
                key = a["mbid"] or norm(a["name"])
                if key not in wc and lookups > 0 and a["links"].get("wikidata"):
                    qid = musicbrainz.wikidata_id(a["links"])
                    if qid:
                        try:
                            wc[key] = musicbrainz.wikidata_sitelinks(self.http, qid)
                            lookups -= 1
                        except SourceError:
                            continue
                titles = wc.get(key) or {}
                title = titles.get("en")
                if not title:
                    continue
                ent = f"artist:{a['id']}"
                try:
                    start, end = wikipedia.date_window(self.hist.last_day(ent, "wiki"), self.today, 120)
                    self.hist.put_many(ent, "wiki", wikipedia.fetch_daily_views(self.http, title, start, end))
                    a["links"].setdefault("wikipedia", f"https://en.wikipedia.org/wiki/{title.replace(' ', '_')}")
                except SourceError as exc:
                    self.errors.append(f"wikipedia artist {a['name']}: {exc}")
        self._guard("wikipedia_artists", wiki_all)
        self.state.data.pop("wikipedia_artists", None)
        self._save_cache("wiki_artist_titles.json", wc)

    # ---------- 6. Расчёты ----------
    def compute_artists(self, artists: list[dict]) -> list[dict]:
        th = self.settings.thresholds
        end = self.today - timedelta(days=1)
        genre_by_tag: dict[str, str] = {}
        for g in self.genres:
            genre_by_tag[norm(g.lastfm_tag)] = g.id
            genre_by_tag[norm(g.mb_tag)] = g.id
            genre_by_tag[norm(g.name)] = g.id

        metric_defs = [("lf_listeners", "Last.fm", "listeners"), ("dz_fans", "Deezer", "fans"),
                       ("yt_subs", "YouTube", "subscribers")]
        # значения для перцентилей
        pools: dict[str, dict[str, float]] = {"lf_listeners": {}, "dz_fans": {}, "yt_subs": {}, "wiki": {}}
        for a in artists:
            ent = f"artist:{a['id']}"
            for m, _, _ in metric_defs:
                s = self.hist.series(ent, m)
                if s:
                    pools[m][a["id"]] = s[max(s)]
            w = trends.level_at(self.hist.series(ent, "wiki"), end, window=7, min_points=4)
            if w is not None:
                pools["wiki"][a["id"]] = w
        ranks = {m: trends.percentile_ranks(v) for m, v in pools.items()}

        result = []
        for a in artists:
            ent = f"artist:{a['id']}"
            metrics, srcs, pr = {}, [], []
            for m, label, _f in metric_defs:
                s = self.hist.series(ent, m)
                if not s:
                    continue
                last = max(s)
                metrics[m] = {"value": s[last], "as_of": last, "source": label}
                srcs.append(label)
                if a["id"] in ranks[m]:
                    pr.append(ranks[m][a["id"]])
            wlvl = pools["wiki"].get(a["id"])
            if wlvl is not None:
                metrics["wiki_views_7d_avg"] = {"value": round(wlvl, 1), "as_of": end.isoformat(), "source": "Wikipedia"}
                srcs.append("Wikipedia")
                pr.append(ranks["wiki"][a["id"]])
            # популярность = среднее перцентилей по доступным источникам (число источников показываем)
            popularity = round(sum(pr) / len(pr), 1) if pr else None

            # рост по сигналам
            signals = []
            for m, label, _ in metric_defs:
                s = self.hist.series(ent, m)
                g30 = trends.snapshot_growth(s, self.today, 30)
                g90 = trends.snapshot_growth(s, self.today, 90)
                if g30 is not None or g90 is not None:
                    signals.append({"source": label, "metric": m, "d30": g30, "d90": g90})
            ws = self.hist.series(ent, "wiki")
            if ws:
                ch = trends.changes(ws, end)
                if ch["d30"] is not None or ch["d90"] is not None:
                    signals.append({"source": "Wikipedia", "metric": "wiki", "d30": ch["d30"], "d90": ch["d90"]})
            g30s = sorted(s["d30"] for s in signals if s["d30"] is not None)
            g90s = sorted(s["d90"] for s in signals if s["d90"] is not None)
            growth30 = g30s[len(g30s) // 2] if g30s else None  # медиана по источникам
            growth90 = g90s[len(g90s) // 2] if g90s else None

            rising = None
            confirming = [s for s in signals if s["d30"] is not None and s["d30"] >= th.rising_artist_30d]
            if growth30 is not None and growth30 >= th.rising_artist_30d and len(confirming) >= th.rising_artist_min_signals:
                parts = ", ".join(f"{s['source']} {s['d30']:+.0f}%" for s in confirming)
                rising = {"reason": f"Рост за 30 дн. по: {parts}", "sources": sorted({s['source'] for s in confirming}),
                          "n_signals": len(confirming)}

            tagset = {norm(t) for t in a["tags"]}
            gids = set(a["_lf_genres"]) | {genre_by_tag[t] for t in tagset if t in genre_by_tag}
            hist_out = {}
            for m in ("lf_listeners", "dz_fans", "yt_subs", "wiki"):
                s = self.hist.series(ent, m)
                if m == "wiki":
                    cutoff = (self.today - timedelta(days=120)).isoformat()
                    s = {d: v for d, v in s.items() if d >= cutoff}
                if s:
                    hist_out[m] = sorted(s.items())

            if not metrics and not a["country"]:
                continue  # о таком артисте нечего показать — не засоряем рейтинги
            result.append({
                "id": a["id"], "name": a["name"], "country": a["country"], "country_source": a["country_source"],
                "genres": sorted(gids), "photo": a["photo"], "links": {k: v for k, v in a["links"].items() if v},
                "metrics": metrics, "popularity": popularity, "n_sources": len(srcs), "sources": srcs,
                "growth_30d": growth30, "growth_90d": growth90, "signals": signals, "rising": rising,
                "history": hist_out,
            })
        return result

    def compute_genres(self) -> list[dict]:
        end = self.today - timedelta(days=1)
        daily = {g.id: self.hist.series(f"genre:{g.id}", "wiki") for g in self.genres}
        table = trends.genre_table(daily, end, self.settings.thresholds)
        out = []
        for g in self.genres:
            row = table[g.id]
            lf = self.hist.series(f"genre:{g.id}", "lf_reach")
            lf_growth = trends.snapshot_growth(lf, self.today, 30)
            cutoff = (self.today - timedelta(days=365)).isoformat()
            wiki_hist = sorted((d, v) for d, v in daily[g.id].items() if d >= cutoff)
            out.append({
                "id": g.id, "name": g.name, "score": row["score"], "level": row["level"],
                "changes": row["changes"], "status": row["status"], "history_days": row["history_days"],
                "signals": {"lastfm_growth_30d": lf_growth,
                            "lastfm_reach": (lf[max(lf)] if lf else None)},
                "history": {"wiki": wiki_hist, "lf_reach": sorted(lf.items())},
                "wiki_article": getattr(self, "wiki_genre_titles", {}).get(g.id),
                "sources": ["Wikipedia Pageviews"] + (["Last.fm"] if lf else []),
                "as_of": max(daily[g.id]) if daily[g.id] else None,
            })
        return out

    def compute_tracks(self) -> list[dict]:
        day = self.today.isoformat()
        tracks = []
        for t in getattr(self, "dz_tracks", []):
            tid = f"dz{t['deezer_id']}"
            ent = f"track:{tid}"
            self.hist.put(ent, "chart_pos", day, t["position"])
            prev = prev_value(self.hist.series(ent, "chart_pos"), self.today)
            tracks.append({
                "id": tid, "title": t["title"], "artist": t["artist"], "cover": t["cover"], "url": t["url"],
                "preview": t["preview"], "source": "deezer", "chart": "Deezer · Electro", "genre": None,
                "chart_position": t["position"], "previous_position": prev,
                "position_delta": (prev - t["position"]) if prev else None,
                "release_date": t.get("release_date"), "as_of": day,
                "history": sorted(self.hist.series(ent, "chart_pos").items())[-30:],
            })
        for gid, arr in getattr(self, "lf_tag_tracks", {}).items():
            for t in arr:
                tid = f"lf-{gid}-{slugify(t['title'])}-{slugify(t['artist'])}"[:90]
                ent = f"track:{tid}"
                self.hist.put(ent, f"tag_rank", day, t["rank"])
                prev = prev_value(self.hist.series(ent, "tag_rank"), self.today)
                tracks.append({
                    "id": tid, "title": t["title"], "artist": t["artist"], "cover": None, "url": t["url"], "preview": None,
                    "source": "lastfm", "chart": f"Last.fm · тег", "genre": gid, "chart_position": t["rank"],
                    "previous_position": prev, "position_delta": (prev - t["rank"]) if prev else None,
                    "release_date": None, "as_of": day,
                    "history": sorted(self.hist.series(ent, "tag_rank").items())[-30:],
                })
        return tracks

    def step_releases(self) -> list[dict]:
        out: list[dict] = []
        since = (self.today - timedelta(days=30)).isoformat()
        until = self.today.isoformat()
        prev = read_json(self.public / "releases.json", {}).get("items", [])
        fails = 0
        def work():
            nonlocal fails
            for g in self.genres:
                try:
                    for r in musicbrainz.recent_release_groups(self.http, g.mb_tag, since, until, 12):
                        r["genre"] = g.id
                        out.append(r)
                except SourceError:
                    fails += 1
        self._guard("musicbrainz_releases", work)
        self.state.data.pop("musicbrainz_releases", None)
        if fails == len(self.genres):
            self.errors.append("musicbrainz releases: недоступно, оставлены прошлые данные")
            return prev
        if out:
            self.state.ok("musicbrainz", extra={**{k: v for k, v in self.state.data.get("musicbrainz", {}).items()
                                                  if k in ("artists_cached",)}, "releases": len(out)})
        out.sort(key=lambda r: r["date"], reverse=True)
        # один релиз может попасть в несколько жанров — оставляем первое вхождение
        seen, uniq = set(), []
        for r in out:
            if r["mbid"] in seen:
                continue
            seen.add(r["mbid"]); uniq.append(r)
        return uniq

    def step_news(self) -> list[dict]:
        items, ok = [], 0
        prev = read_json(self.public / "news.json", {}).get("items", [])
        for f in config.load_feeds():
            try:
                items += rss.fetch_feed(self.http, f); ok += 1
                self.state.ok(f"rss:{f['id']}", extra={"name": f["name"]})
            except SourceError as exc:
                self.state.fail(f"rss:{f['id']}", str(exc)); self.errors.append(f"rss {f['name']}: {exc}")
                self.state.data[f"rss:{f['id']}"]["name"] = f["name"]
        if not ok:
            return prev
        cutoff = iso(datetime(self.today.year, self.today.month, self.today.day, 23, 59, 59, tzinfo=timezone.utc) - timedelta(days=self.settings.news_max_age_days))
        items = [i for i in items if i["published"] >= cutoff]
        items.sort(key=lambda i: i["published"], reverse=True)
        return items[: self.settings.news_max_items]

    def compute_countries(self, artists: list[dict]) -> list[dict]:
        out = []
        gname = {g.id: g.name for g in self.genres}
        by_norm = {norm(a["name"]): a for a in artists}
        for c in config.COUNTRIES:
            origin = [a for a in artists if a["country"] == c.code]
            origin.sort(key=lambda a: -(a["popularity"] or -1))
            gcount: dict[str, int] = {}
            for a in origin:
                for gid in a["genres"]:
                    gcount[gid] = gcount.get(gid, 0) + 1
            entry = {
                "code": c.code, "name_ru": c.name_ru, "name_en": c.name_en,
                "origin": {"source": "MusicBrainz (страна происхождения артиста)", "n_artists": len(origin),
                           "n_rising": sum(1 for a in origin if a["rising"]),
                           "top_artists": [a["id"] for a in origin[:10]],
                           "rising_artists": [a["id"] for a in origin if a["rising"]][:10],
                           "genres": sorted(({"genre": g, "name": gname.get(g, g), "count": n} for g, n in gcount.items()),
                                            key=lambda x: -x["count"])[:8]},
                "listeners": None,
            }
            if self.lf:
                try:
                    geo = self.lf.geo_top_artists(c.name_en, 50)
                    matched = [by_norm[norm(x["name"])]["id"] for x in geo if norm(x["name"]) in by_norm]
                    entry["listeners"] = {"source": "Last.fm (география СЛУШАТЕЛЕЙ)", "as_of": self.today.isoformat(),
                                          "electronic_in_top50": matched,
                                          "share_electronic_in_top50": round(100 * len(matched) / len(geo), 1) if geo else None,
                                          "top_artists": [{"name": x["name"], "rank": x["rank"]} for x in geo[:10]]}
                    gc: dict[str, int] = {}
                    for aid in matched:
                        for gid in next((a["genres"] for a in artists if a["id"] == aid), []):
                            gc[gid] = gc.get(gid, 0) + 1
                    entry["listeners"]["genres"] = sorted(({"genre": g, "name": gname.get(g, g), "count": n} for g, n in gc.items()),
                                                         key=lambda x: -x["count"])[:8]
                except SourceError as exc:
                    self.errors.append(f"lastfm geo {c.code}: {exc}")
            out.append(entry)
        return out

    # ---------- запуск ----------
    def run_news_only(self) -> dict:
        """Лёгкое частое обновление: только новости (RSS) и новые релизы (MusicBrainz).
        Основные тренды и их дата актуальности (meta.json) не трогаются."""
        news = self.step_news()
        releases = self.step_releases()
        generated = iso(utcnow())
        write_json(self.public / "news.json", {"generated_at": generated, "items": news})
        write_json(self.public / "releases.json", {"generated_at": generated, "items": releases})
        self.state.save()
        return {"news": len(news), "releases": len(releases), "errors": self.errors}

    def run(self) -> dict:
        self.wiki_genre_titles = {}
        self.dz_tracks, self.dz_artists = [], []
        self.lf_tag_artists, self.lf_tag_tracks = {}, {}
        self.step_wikipedia_genres()
        self.step_lastfm_genres()
        self.step_deezer_chart()
        self.step_discover_ru()
        reg = self.step_artists()
        self.step_artist_metrics(reg)

        genres = self.compute_genres()
        artists = self.compute_artists(reg)
        tracks = self.compute_tracks()
        releases = self.step_releases()
        news = self.step_news()
        countries = self.compute_countries(artists)
        insights = insights_mod.build_insights(genres, artists, tracks, releases, self.today)

        self.hist.prune(self.today)
        self.hist.save()
        self.state.save()

        generated = iso(utcnow())
        crit_ok = self.state.data.get("wikipedia", {}).get("status") == "ok"
        any_error = bool(self.errors)
        status = "ok" if crit_ok and not any_error else ("partial" if crit_ok or any(
            s.get("status") == "ok" for s in self.state.data.values()) else "failed")
        meta = {
            "schema": SCHEMA_VERSION, "generated_at": generated, "data_date": self.today.isoformat(), "status": status,
            "demo": False, "errors": self.errors[:40],
            "counts": {"genres": len(genres), "artists": len(artists), "tracks": len(tracks),
                       "releases": len(releases), "news": len(news)},
            "history_days_max": max((g["history_days"] for g in genres), default=0),
        }
        w = self.public
        # Не затираем последний успешный снимок, если Wikipedia (основа трендов) не загрузилась
        write_json(w / "meta.json", meta, pretty=True)
        if crit_ok or not (w / "genres.json").exists():
            write_json(w / "genres.json", {"generated_at": generated, "items": genres})
            write_json(w / "insights.json", {"generated_at": generated, **insights})
        write_json(w / "artists.json", {"generated_at": generated, "items": artists}) if artists or not (w / "artists.json").exists() else None
        write_json(w / "tracks.json", {"generated_at": generated, "items": tracks}) if tracks or not (w / "tracks.json").exists() else None
        write_json(w / "releases.json", {"generated_at": generated, "items": releases})
        write_json(w / "news.json", {"generated_at": generated, "items": news})
        write_json(w / "countries.json", {"generated_at": generated, "items": countries})
        write_json(w / "digest.json", build_digest(meta, genres, artists, tracks, insights))
        return meta
