"""Точка входа сборщика (вызывается GitHub Actions).

    python backend/run_update.py            # полный ежедневный сбор
    python backend/run_update.py --only news   # только новости и новые релизы (частый запуск)
"""
import argparse
import os
import sys

from djpulse.pipeline import Pipeline


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", choices=["news"], help="облегчённый режим")
    args = ap.parse_args()
    env = {k: os.environ.get(k, "") for k in ("LASTFM_API_KEY", "YOUTUBE_API_KEY")}
    pipe = Pipeline(env)
    if args.only == "news":
        res = pipe.run_news_only()
        print(f"news={res['news']} releases={res['releases']}")
        for e in res["errors"]:
            print("  !", e)
        return 0
    meta = pipe.run()
    print(f"status={meta['status']} data_date={meta['data_date']} counts={meta['counts']}")
    for e in meta["errors"]:
        print("  !", e)
    # Код выхода 1 только если не получено вообще ничего — иначе Action сохранит частичные данные.
    return 1 if meta["status"] == "failed" else 0


if __name__ == "__main__":
    sys.exit(main())
