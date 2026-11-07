from datetime import date, timedelta

from djpulse.analytics import trends
from djpulse.config import Thresholds

END = date(2026, 6, 30)


def series(days, fn):
    return {(END - timedelta(days=i)).isoformat(): fn(i) for i in range(days)}


def test_level_needs_enough_points():
    s = {(END - timedelta(days=i)).isoformat(): 10 for i in range(4)}
    assert trends.level_at(s, END) is None  # 4 из 7 — мало
    s = {(END - timedelta(days=i)).isoformat(): 10 for i in range(5)}
    assert trends.level_at(s, END) == 10


def test_pct_change_basic_and_none_on_zero_base():
    assert trends.pct_change(120, 100) == 20.0
    assert trends.pct_change(80, 100) == -20.0
    assert trends.pct_change(10, 0) is None
    assert trends.pct_change(None, 5) is None


def test_changes_growth_series():
    # значения растут на 1% в день назад по времени уменьшаются
    s = series(400, lambda i: 100 - 0.1 * i if i < 300 else 70)
    ch = trends.changes(s, END)
    assert ch["d30"] > 0 and ch["d7"] > 0
    assert ch["y1"] is not None


def test_changes_missing_history_is_none_not_zero():
    s = series(20, lambda i: 100)
    ch = trends.changes(s, END)
    assert ch["d7"] == 0.0
    assert ch["d30"] is None and ch["d90"] is None and ch["y1"] is None


def test_classify_statuses():
    th = Thresholds()
    assert trends.classify(50, {"d30": 20, "d7": 3}, 60, th) == "rising"
    assert trends.classify(50, {"d30": -20, "d7": -1}, 60, th) == "declining"
    assert trends.classify(50, {"d30": 2, "d7": 1}, 60, th) == "stable"
    assert trends.classify(10, {"d30": 40, "d7": 5}, 60, th) == "emerging"
    assert trends.classify(50, {"d30": 20, "d7": 3}, 10, th) == "insufficient"  # мало истории
    assert trends.classify(None, {"d30": None, "d7": None}, 100, th) == "insufficient"


def test_rising_requires_recent_momentum():
    th = Thresholds()
    # +20% за 30 дней, но последняя неделя падает → не rising
    assert trends.classify(50, {"d30": 20, "d7": -5}, 60, th) == "stable"


def test_genre_table_scores_relative_to_leader():
    big = series(120, lambda i: 1000)
    small = series(120, lambda i: 250)
    t = trends.genre_table({"a": big, "b": small}, END, Thresholds())
    assert t["a"]["score"] == 100.0
    assert t["b"]["score"] == 25.0
    assert t["a"]["status"] == "stable"


def test_snapshot_growth_uses_nearest_point_or_none():
    s = {"2026-06-30": 120, "2026-05-31": 100}
    assert trends.snapshot_growth(s, END, 30) == 20.0
    assert trends.snapshot_growth({"2026-06-30": 120}, END, 30) is None  # нет базы
    assert trends.snapshot_growth({"2026-06-30": 120, "2026-04-01": 100}, END, 30) is None  # база слишком далеко


def test_percentile_ranks():
    r = trends.percentile_ranks({"a": 1, "b": 10, "c": 100})
    assert r == {"a": 0.0, "b": 50.0, "c": 100.0}
    assert trends.percentile_ranks({"x": 5}) == {"x": 100.0}
    assert trends.percentile_ranks({}) == {}
