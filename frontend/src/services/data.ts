import type { AppData, Artist, Country, Genre, Insight, Meta, NewsItem, Release, SourceInfo, Digest, Track, WeeklyTrend } from '../types';

// Боевая сборка читает ./data/ (его кладёт GitHub Actions). Демо-набор подключается
// ТОЛЬКО явным флагом VITE_USE_DEMO — молча подменить реальные данные демо нельзя.
export const USE_DEMO = import.meta.env.VITE_USE_DEMO === '1';
const BASE = USE_DEMO ? 'demo-data/' : 'data/';

async function load<T>(name: string, bust: string): Promise<T | null> {
  try {
    const res = await fetch(`${BASE}${name}.json?v=${bust}`, { cache: 'no-cache' });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export class NoDataError extends Error {}

export async function loadAll(): Promise<AppData> {
  const bust = String(Math.floor(Date.now() / 600000)); // не чаще раза в 10 минут обходим кэш CDN
  const [meta, genres, artists, tracks, releases, news, countries, insights, sources, digest] = await Promise.all([
    load<Meta>('meta', bust),
    load<{ items: Genre[] }>('genres', bust),
    load<{ items: Artist[] }>('artists', bust),
    load<{ items: Track[] }>('tracks', bust),
    load<{ items: Release[] }>('releases', bust),
    load<{ items: NewsItem[] }>('news', bust),
    load<{ items: Country[] }>('countries', bust),
    load<{ weekly_trend: WeeklyTrend | null; items: Insight[] }>('insights', bust),
    load<Record<string, SourceInfo>>('sources', bust),
    load<Digest>('digest', bust),
  ]);
  if (!meta || !genres) throw new NoDataError('meta/genres');
  const missing: string[] = [];
  const pick = <T,>(name: string, v: { items: T[] } | null): T[] => {
    if (!v) missing.push(name);
    return v?.items ?? [];
  };
  return {
    meta,
    genres: genres.items,
    artists: pick('artists', artists),
    tracks: pick('tracks', tracks),
    releases: pick('releases', releases),
    news: pick('news', news),
    countries: pick('countries', countries),
    insights: insights ?? { weekly_trend: null, items: [] },
    sources: sources ?? {},
    digest,
    missing,
  };
}

/** Возраст данных в часах. */
export function ageHours(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / 3600000;
}

export const STALE_AFTER_HOURS = 48;
