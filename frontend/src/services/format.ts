import type { Lang } from './prefs';

const loc = (l: Lang) => (l === 'ru' ? 'ru-RU' : 'en-US');

export function fmtNum(v: number | null | undefined, l: Lang): string {
  if (v == null) return '—';
  return new Intl.NumberFormat(loc(l), { notation: Math.abs(v) >= 10000 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(v);
}

export function fmtPct(v: number | null | undefined, digits = 0): string {
  if (v == null) return '—';
  const r = Number(v.toFixed(digits));
  return `${r > 0 ? '+' : r < 0 ? '−' : ''}${Math.abs(r).toFixed(digits)}%`;
}

export function fmtDay(iso: string | null | undefined, l: Lang): string {
  if (!iso) return '—';
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat(loc(l), { day: 'numeric', month: 'short', timeZone: iso.length === 10 ? 'UTC' : undefined }).format(d);
}

export function fmtDayYear(iso: string, l: Lang): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return new Intl.DateTimeFormat(loc(l), { day: 'numeric', month: 'short', year: '2-digit', timeZone: 'UTC' }).format(d);
}

export function fmtDateTime(iso: string | null | undefined, l: Lang): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat(loc(l), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(d);
}

export function flag(code: string | null | undefined): string {
  if (!code || code.length !== 2) return '🌐';
  return String.fromCodePoint(...[...code.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

export function initials(name: string): string {
  return name.replace(/[^\p{L}\p{N} ]/gu, '').split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

/** Возвращает ключ i18n-единицы для «N дней назад». */
export function daysBetween(a: string, b: string): number {
  return Math.round((new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86400000);
}
