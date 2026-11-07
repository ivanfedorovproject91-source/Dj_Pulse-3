export type Point = [string, number];
export type Status = 'rising' | 'stable' | 'declining' | 'emerging' | 'insufficient';

export interface Meta {
  schema: number;
  generated_at: string;
  data_date: string;
  status: 'ok' | 'partial' | 'failed';
  demo: boolean;
  errors: string[];
  counts: Record<string, number>;
  history_days_max: number;
}

export interface SourceInfo {
  status: 'ok' | 'error' | 'disabled';
  last_success?: string;
  last_attempt?: string;
  message?: string | null;
  name?: string;
}

export interface Genre {
  id: string;
  name: string;
  score: number | null;
  level: number | null;
  changes: { d7: number | null; d30: number | null; d90: number | null; y1: number | null };
  status: Status;
  history_days: number;
  signals: { lastfm_growth_30d: number | null; lastfm_reach: number | null };
  history: { wiki: Point[]; lf_reach: Point[] };
  wiki_article: string | null;
  sources: string[];
  as_of: string | null;
}

export interface MetricVal {
  value: number;
  as_of: string;
  source: string;
}

export interface Signal {
  source: string;
  metric: string;
  d30: number | null;
  d90: number | null;
}

export interface Artist {
  id: string;
  name: string;
  country: string | null;
  country_source: string | null;
  genres: string[];
  photo: string | null;
  links: Record<string, string>;
  metrics: Record<string, MetricVal>;
  popularity: number | null;
  n_sources: number;
  sources: string[];
  growth_30d: number | null;
  growth_90d: number | null;
  signals: Signal[];
  rising: { reason: string; sources: string[]; n_signals: number } | null;
  history: Record<string, Point[]>;
}

export interface Track {
  id: string;
  title: string;
  artist: string;
  cover: string | null;
  url: string | null;
  preview: string | null;
  source: 'deezer' | 'lastfm';
  chart: string;
  genre: string | null;
  chart_position: number;
  previous_position: number | null;
  position_delta: number | null;
  release_date: string | null;
  as_of: string;
  history: Point[];
}

export interface Release {
  mbid: string;
  title: string;
  artist: string;
  date: string;
  type: string | null;
  url: string;
  genre: string;
}

export interface NewsItem {
  title: string;
  link: string;
  source: string;
  published: string;
}

export interface CountryGenre {
  genre: string;
  name: string;
  count: number;
}

export interface Country {
  code: string;
  name_ru: string;
  name_en: string;
  origin: {
    source: string;
    n_artists: number;
    n_rising: number;
    top_artists: string[];
    rising_artists: string[];
    genres: CountryGenre[];
  };
  listeners: null | {
    source: string;
    as_of: string;
    electronic_in_top50: string[];
    share_electronic_in_top50: number | null;
    top_artists: { name: string; rank: number }[];
    genres: CountryGenre[];
  };
}

export interface Evidence {
  label: string;
  value: string;
}

export interface Insight {
  id: string;
  type: string;
  genre?: string;
  title: string;
  body: string;
  period_days: number;
  sources: string[];
  evidence: Evidence[];
}

export interface WeeklyTrend {
  genre: string;
  name: string;
  d7: number;
  d30: number | null;
  score: number | null;
  sources: string[];
  text: string;
}

export interface Digest {
  generated_at: string;
  data_date: string;
  status: string;
  sections: Record<string, string>;
  footer: string;
  order: string[];
}

export interface AppData {
  meta: Meta;
  genres: Genre[];
  artists: Artist[];
  tracks: Track[];
  releases: Release[];
  news: NewsItem[];
  countries: Country[];
  insights: { weekly_trend: WeeklyTrend | null; items: Insight[] };
  sources: Record<string, SourceInfo>;
  digest: Digest | null;
  /** Какие файлы не удалось загрузить (остальные работают). */
  missing: string[];
}
