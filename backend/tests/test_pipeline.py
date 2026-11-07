import json
from datetime import date, timedelta

import pytest

from djpulse import config
from djpulse.collectors import rss
from djpulse.pipeline import Pipeline
from tests.fakes import FakeHttp

TODAY = date(2026, 7, 1)


@pytest.fixture
def dirs(tmp_path, monkeypatch):
    pub, data = tmp_path / "public", tmp_path / "data"
    pub.mkdir(); (data / "cache").mkdir(parents=True); (data / "history").mkdir()
    return pub, data


def run(dirs, http, env=None, today=TODAY):
    pub, data = dirs
    return Pipeline(env if env is not None else {"LASTFM_API_KEY": "k"}, http=http, today=today, public_dir=pub, data_dir=data).run()


def load(dirs, name):
    name = name if name.endswith(".json") else name + ".json"
    return json.loads((dirs[0] / name).read_text(encoding="utf-8"))


def test_full_run_produces_all_files(dirs):
    meta = run(dirs, FakeHttp(TODAY))
    for f in ("meta", "genres", "artists", "tracks", "releases", "news", "countries", "insights", "digest", "sources"):
        assert (dirs[0] / f"{f}.json").exists(), f
    assert meta["demo"] is False
    g = load(dirs, "genres")["items"]
    assert len(g) >= 18
    # Wikipedia-бэкфилл даёт историю сразу → есть Trend Score и изменения за 7/30/90 дней
    deep = next(x for x in g if x["id"] == "deep-house")
    assert deep["score"] is not None and deep["changes"]["d30"] is not None and deep["changes"]["d90"] is not None
    assert len(deep["history"]["wiki"]) > 300


def test_missing_wikipedia_article_is_reported_not_faked(dirs, monkeypatch):
    monkeypatch.setattr(config, "GENRES", config.GENRES + (
        config.Genre("ghost", "Ghost", ("Nonexistent genre",), "ghost", "ghost"),))
    run(dirs, FakeHttp(TODAY))
    ghost = next(x for x in load(dirs, "genres")["items"] if x["id"] == "ghost")
    assert ghost["score"] is None and ghost["status"] == "insufficient"
    assert ghost["history"]["wiki"] == []
    assert any("Ghost" in e for e in load(dirs, "meta")["errors"])


def test_snapshot_metrics_have_no_growth_on_first_day(dirs):
    run(dirs, FakeHttp(TODAY))
    a = load(dirs, "artists")["items"]
    one = next(x for x in a if x["name"] == "Artist One")
    assert one["metrics"]["lf_listeners"]["value"] == 12345
    # Last.fm — снимок за один день: роста нет, и это None, а не 0
    lf = next(s for s in one["signals"] if s["metric"] == "lf_listeners") if any(s["metric"] == "lf_listeners" for s in one["signals"]) else None
    assert lf is None


def test_snapshot_growth_after_30_days(dirs):
    run(dirs, FakeHttp(TODAY))
    # через 30 дней тот же показатель вырос: подменим историю вручную
    hist_path = dirs[1] / "history" / "history.json"
    h = json.loads(hist_path.read_text(encoding="utf-8"))
    for ent, m in h.items():
        if ent.startswith("artist:") and "lf_listeners" in m:
            (d, v), = m["lf_listeners"].items()
            m["lf_listeners"] = {(TODAY - timedelta(days=30)).isoformat(): v / 1.5, d: v}
    hist_path.write_text(json.dumps(h), encoding="utf-8")
    run(dirs, FakeHttp(TODAY))
    one = next(x for x in load(dirs, "artists")["items"] if x["name"] == "Artist One")
    sig = next(s for s in one["signals"] if s["metric"] == "lf_listeners")
    assert sig["d30"] == 50.0
    assert one["rising"] and "Last.fm" in one["rising"]["sources"]


def test_one_source_down_does_not_block_others(dirs):
    meta = run(dirs, FakeHttp(TODAY, fail_hosts=("api.deezer.com",)))
    sources = load(dirs, "sources.json")
    assert sources["wikipedia"]["status"] == "ok"
    assert sources["lastfm"]["status"] == "ok"
    assert sources.get("deezer", {}).get("status") != "ok"
    assert meta["status"] in ("ok", "partial")
    assert load(dirs, "genres")["items"]  # данные есть


def test_failed_source_keeps_previous_success_date(dirs):
    run(dirs, FakeHttp(TODAY))
    first = load(dirs, "sources.json")["deezer"]["last_success"]
    run(dirs, FakeHttp(TODAY, fail_hosts=("api.deezer.com",)), today=TODAY + timedelta(days=1))
    d = load(dirs, "sources.json")["deezer"]
    assert d["last_success"] == first  # не затёрт
    assert d["status"] == "error"


def test_wikipedia_down_keeps_previous_genres_file(dirs):
    run(dirs, FakeHttp(TODAY))
    before = load(dirs, "genres")["generated_at"]
    meta = run(dirs, FakeHttp(TODAY, fail_hosts=("wikimedia.org", "wikipedia.org")), today=TODAY + timedelta(days=1))
    after = load(dirs, "genres.json")
    assert meta["status"] != "ok"
    assert after["generated_at"] == before  # старый снимок не выдан за новый


def test_no_lastfm_key_disables_source_honestly(dirs):
    run(dirs, FakeHttp(TODAY), env={})
    s = load(dirs, "sources.json")
    assert s["lastfm"]["status"] == "disabled"
    assert s["youtube"]["status"] == "disabled"
    # приложение всё равно получает жанры и чарт Deezer
    assert load(dirs, "genres")["items"] and load(dirs, "tracks")["items"]


def test_russia_artists_have_origin_country_from_musicbrainz(dirs):
    run(dirs, FakeHttp(TODAY))
    a = load(dirs, "artists")["items"]
    ru = [x for x in a if x["country"] == "RU"]
    assert ru and all(x["country_source"] == "MusicBrainz" for x in ru)
    c = next(x for x in load(dirs, "countries")["items"] if x["code"] == "RU")
    assert c["origin"]["n_artists"] == len(ru)
    assert "СЛУШАТЕЛЕЙ" in c["listeners"]["source"]  # география слушателей отдельно от происхождения


def test_incomplete_release_dates_are_dropped(dirs):
    run(dirs, FakeHttp(TODAY))
    r = load(dirs, "releases")["items"]
    assert r and all(len(x["date"]) == 10 for x in r)
    assert not any(x["title"] == "Fuzzy" for x in r)


def test_chart_delta_needs_previous_day(dirs):
    run(dirs, FakeHttp(TODAY))
    t = next(x for x in load(dirs, "tracks")["items"] if x["source"] == "deezer")
    assert t["position_delta"] is None  # вчерашних данных нет → нет «динамики»
    run(dirs, FakeHttp(TODAY), today=TODAY + timedelta(days=1))
    t = next(x for x in load(dirs, "tracks")["items"] if x["source"] == "deezer")
    assert t["position_delta"] == 0 and t["previous_position"] == 1


def test_digest_is_html_safe_and_has_footer(dirs):
    run(dirs, FakeHttp(TODAY))
    d = load(dirs, "digest.json")
    assert d["footer"].startswith("Данные на")
    for text in d["sections"].values():
        assert "<script" not in text


def test_rss_parser_filters_undated_and_unsafe():
    out = rss.fetch_feed(FakeHttp(TODAY), {"id": "x", "name": "X", "url": "https://x/rss"})
    assert [i["title"] for i in out] == ["Big release"]
    assert out[0]["published"].endswith("Z")


def test_rss_rejects_garbage():
    with pytest.raises(Exception):
        rss.parse_feed("<html><not-closed>")


def test_news_only_mode_does_not_touch_trend_meta(dirs):
    run(dirs, FakeHttp(TODAY))
    before = load(dirs, "meta")["generated_at"]
    genres_before = load(dirs, "genres")["generated_at"]
    pub, data = dirs
    res = Pipeline({}, http=FakeHttp(TODAY), today=TODAY, public_dir=pub, data_dir=data).run_news_only()
    assert res["news"] >= 1 and res["releases"] >= 1
    assert load(dirs, "meta")["generated_at"] == before          # дата основных данных не «освежается» задним числом
    assert load(dirs, "genres")["generated_at"] == genres_before


def test_same_musicbrainz_artist_under_two_names_is_merged(dirs, monkeypatch):
    # «Artist One» и алиас «A1» в MusicBrainz — один и тот же mbid → один артист в реестре
    from tests import fakes
    class AliasHttp(fakes.FakeHttp):
        def get(self, url, params=None, **kw):
            if url.endswith("/artist") and "musicbrainz" in url and "country:RU" not in (params or {}).get("query", ""):
                return {"artists": [{"id": "same-mbid", "name": "Artist One", "score": 100}]}
            if "musicbrainz.org/ws/2/artist/mb-ru-1" in url:
                return {"id": "mb-ru-1", "name": "Ruski DJ", "country": "RU", "area": {"name": "Russia"}, "tags": [], "relations": []}
            if "musicbrainz.org/ws/2/artist/same-mbid" in url:
                return {"id": "same-mbid", "name": "Artist One", "country": "RU", "area": {"name": "Russia"}, "tags": [], "relations": []}
            return super().get(url, params, **kw)
    monkeypatch.setattr(fakes, "FakeHttp", AliasHttp)
    run(dirs, AliasHttp(TODAY))
    a = [x for x in load(dirs, "artists")["items"] if x["country"] == "RU"]
    ids = [x["id"] for x in a]
    assert len(ids) == len(set(ids))
    assert sum(1 for x in a if x["name"] == "Artist One") == 1
