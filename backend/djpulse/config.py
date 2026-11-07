"""Статическая конфигурация DJ PULSE.

Здесь только справочники (какие жанры отслеживаем, какие страны и RSS-ленты
опрашиваем). Никаких статистических чисел в конфиге нет — все цифры приходят
из источников данных.

Чтобы добавить новый жанр — добавьте запись в GENRES (или в data/custom_genres.json,
см. README) и запустите обновление: история по нему подтянется автоматически.
"""
from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = ROOT / "data"
PUBLIC_DIR = DATA_DIR / "public"
HISTORY_DIR = DATA_DIR / "history"
CACHE_DIR = DATA_DIR / "cache"

# Идентифицирующий User-Agent требуют Wikimedia, MusicBrainz и Last.fm.
# В GitHub Actions адрес репозитория подставляется автоматически (переменная DJPULSE_REPO).
USER_AGENT = "DJPulse/1.0 (+%s)" % os.environ.get("DJPULSE_REPO", "https://github.com/YOUR_GITHUB_USER/dj-pulse")


@dataclass(frozen=True)
class Genre:
    id: str
    name: str
    # Кандидаты названий статьи в английской Википедии (берётся первая существующая).
    wiki: tuple[str, ...]
    # Тег в Last.fm (tag.getInfo / tag.getTopArtists / tag.getTopTracks).
    lastfm_tag: str
    # Тег в MusicBrainz для поиска новых релизов.
    mb_tag: str
    # Нужен ли «не-ядро» жанр для Rising/discovery (все True по умолчанию).
    discover: bool = True


GENRES: tuple[Genre, ...] = (
    Genre("organic-house", "Organic House", ("Organic house",), "organic house", "organic house"),
    Genre("afro-house", "Afro House", ("Afro house",), "afro house", "afro house"),
    Genre("melodic-house", "Melodic House", ("Melodic house and techno", "Melodic house"), "melodic house", "melodic house"),
    Genre("melodic-techno", "Melodic Techno", ("Melodic techno", "Melodic house and techno"), "melodic techno", "melodic techno"),
    Genre("progressive-house", "Progressive House", ("Progressive house",), "progressive house", "progressive house"),
    Genre("deep-house", "Deep House", ("Deep house",), "deep house", "deep house"),
    Genre("tech-house", "Tech House", ("Tech house",), "tech house", "tech house"),
    Genre("indie-dance", "Indie Dance", ("Indie dance",), "indie dance", "indie dance"),
    Genre("minimal-deep-tech", "Minimal / Deep Tech", ("Minimal techno", "Deep tech"), "minimal techno", "minimal techno"),
    Genre("house", "House", ("House music",), "house", "house"),
    Genre("techno", "Techno", ("Techno",), "techno", "techno"),
    Genre("hard-techno", "Hard Techno", ("Hard techno", "Hardcore techno"), "hard techno", "hard techno"),
    Genre("trance", "Trance", ("Trance music",), "trance", "trance"),
    Genre("drum-and-bass", "Drum & Bass", ("Drum and bass",), "drum and bass", "drum and bass"),
    Genre("uk-garage", "UK Garage", ("UK garage",), "uk garage", "uk garage"),
    Genre("amapiano", "Amapiano", ("Amapiano",), "amapiano", "amapiano"),
    Genre("downtempo", "Downtempo", ("Downtempo",), "downtempo", "downtempo"),
    Genre("electronica", "Electronica", ("Electronica",), "electronica", "electronica"),
)


def load_genres() -> tuple[Genre, ...]:
    """Базовые жанры + пользовательские из data/custom_genres.json (если файл есть)."""
    extra = DATA_DIR / "custom_genres.json"
    if not extra.exists():
        return GENRES
    try:
        raw = json.loads(extra.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return GENRES
    out = list(GENRES)
    known = {g.id for g in out}
    for item in raw if isinstance(raw, list) else []:
        try:
            gid = str(item["id"])
            if gid in known:
                continue
            out.append(
                Genre(
                    id=gid,
                    name=str(item["name"]),
                    wiki=tuple(item.get("wiki") or [item["name"]]),
                    lastfm_tag=str(item.get("lastfm_tag") or item["name"].lower()),
                    mb_tag=str(item.get("mb_tag") or item["name"].lower()),
                )
            )
        except (KeyError, TypeError, AttributeError):
            continue
    return tuple(out)


@dataclass(frozen=True)
class Country:
    code: str  # ISO 3166-1 alpha-2
    name_en: str  # название в формате Last.fm geo.* (английское)
    name_ru: str


COUNTRIES: tuple[Country, ...] = (
    Country("RU", "Russian Federation", "Россия"),
    Country("US", "United States", "США"),
    Country("GB", "United Kingdom", "Великобритания"),
    Country("DE", "Germany", "Германия"),
    Country("NL", "Netherlands", "Нидерланды"),
    Country("FR", "France", "Франция"),
    Country("ES", "Spain", "Испания"),
    Country("IT", "Italy", "Италия"),
    Country("BR", "Brazil", "Бразилия"),
    Country("UA", "Ukraine", "Украина"),
    Country("PL", "Poland", "Польша"),
    Country("TR", "Turkey", "Турция"),
    Country("ZA", "South Africa", "ЮАР"),
)

# RSS музыкальных изданий. Хранятся только заголовок, ссылка, дата и источник —
# текст статей не копируется. Если лента недоступна, источник помечается ошибкой,
# остальные продолжают работать. Адреса можно поменять в data/custom_feeds.json.
RSS_FEEDS: tuple[dict, ...] = (
    {"id": "mixmag", "name": "Mixmag", "url": "https://mixmag.net/rss.xml"},
    {"id": "djmag", "name": "DJ Mag", "url": "https://djmag.com/rss.xml"},
    {"id": "residentadvisor", "name": "Resident Advisor", "url": "https://ra.co/xml/rss.xml"},
    {"id": "attack", "name": "Attack Magazine", "url": "https://www.attackmagazine.com/feed/"},
)


def load_feeds() -> tuple[dict, ...]:
    extra = DATA_DIR / "custom_feeds.json"
    if not extra.exists():
        return RSS_FEEDS
    try:
        raw = json.loads(extra.read_text(encoding="utf-8"))
        if isinstance(raw, list) and raw:
            return tuple(f for f in raw if isinstance(f, dict) and "url" in f and "id" in f)
    except (OSError, ValueError):
        pass
    return RSS_FEEDS


@dataclass
class Thresholds:
    """Пороги классификации статуса жанра (проценты)."""

    rising_30d: float = 10.0
    declining_30d: float = -10.0
    emerging_30d: float = 25.0
    emerging_max_score: float = 25.0
    min_history_days_for_status: int = 35
    rising_artist_30d: float = 15.0
    rising_artist_min_signals: int = 1


@dataclass
class Settings:
    thresholds: Thresholds = field(default_factory=Thresholds)
    wiki_backfill_days: int = 365
    history_keep_days: int = 800
    top_artists_per_tag: int = 25
    max_registry_artists: int = 220
    mb_discover_ru_limit: int = 40
    tracks_per_tag: int = 15
    news_max_items: int = 40
    news_max_age_days: int = 21


SETTINGS = Settings()
