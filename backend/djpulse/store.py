"""Хранилище: атомарная запись JSON, история показателей, состояние источников."""
from __future__ import annotations

import json
import os
import tempfile
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any


def read_json(path: Path, default: Any) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return default


def write_json(path: Path, obj: Any, *, pretty: bool = False) -> None:
    """Атомарная запись: сначала временный файл, затем rename — файл не бывает «наполовину записанным»."""
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=path.parent, suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            if pretty:
                json.dump(obj, fh, ensure_ascii=False, indent=1, sort_keys=True)
            else:
                json.dump(obj, fh, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
        os.replace(tmp, path)
    except BaseException:
        if os.path.exists(tmp):
            os.unlink(tmp)
        raise


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


class History:
    """История числовых рядов: history[entity][metric][YYYY-MM-DD] = value.

    Сохраняется в одном JSON-файле. Повторная запись той же даты перезаписывает
    значение (для Wikipedia это нужно: значения за последние дни уточняются).
    """

    def __init__(self, path: Path, keep_days: int = 800):
        self.path = path
        self.keep_days = keep_days
        self.data: dict[str, dict[str, dict[str, float]]] = read_json(path, {})

    def put(self, entity: str, metric: str, day: str, value: float | int | None) -> None:
        if value is None:
            return
        self.data.setdefault(entity, {}).setdefault(metric, {})[day] = value

    def put_many(self, entity: str, metric: str, series: dict[str, float]) -> None:
        for d, v in series.items():
            self.put(entity, metric, d, v)

    def series(self, entity: str, metric: str) -> dict[str, float]:
        return self.data.get(entity, {}).get(metric, {})

    def last_day(self, entity: str, metric: str) -> str | None:
        s = self.series(entity, metric)
        return max(s) if s else None

    def prune(self, today: date) -> None:
        cutoff = (today - timedelta(days=self.keep_days)).isoformat()
        for metrics in self.data.values():
            for series in metrics.values():
                for d in [d for d in series if d < cutoff]:
                    del series[d]

    def save(self) -> None:
        write_json(self.path, self.data)


class SourceState:
    """Состояние каждого источника переживает сбои: last_success не затирается при ошибке."""

    def __init__(self, path: Path):
        self.path = path
        self.data: dict[str, dict] = read_json(path, {})

    def ok(self, sid: str, message: str | None = None, extra: dict | None = None) -> None:
        now = iso(utcnow())
        entry = self.data.setdefault(sid, {})
        entry.update(status="ok", last_success=now, last_attempt=now, message=message)
        if extra:
            entry.update(extra)

    def fail(self, sid: str, message: str) -> None:
        entry = self.data.setdefault(sid, {})
        entry.update(status="error", last_attempt=iso(utcnow()), message=message[:300])

    def disabled(self, sid: str, message: str) -> None:
        entry = self.data.setdefault(sid, {})
        entry.update(status="disabled", last_attempt=iso(utcnow()), message=message)

    def save(self) -> None:
        write_json(self.path, self.data, pretty=True)
