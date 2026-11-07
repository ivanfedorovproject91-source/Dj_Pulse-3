import { useState } from 'react';
import { useI18n, type Key } from '../services/i18n';
import { ageHours, STALE_AFTER_HOURS, USE_DEMO } from '../services/data';
import { fmtDateTime, fmtDay } from '../services/format';
import type { AppData } from '../types';
import { Icon, Sheet } from './ui';

export const TABS = ['dashboard', 'genres', 'djs', 'tracks', 'analytics'] as const;
export type Tab = (typeof TABS)[number];

export function BottomNav({ active, onGo }: { active: Tab; onGo: (t: Tab) => void }) {
  const { t } = useI18n();
  return (
    <nav className="nav" aria-label="Main">
      <div className="nav-in">
        {TABS.map((tab) => (
          <button key={tab} className={tab === active ? 'on' : ''} aria-current={tab === active ? 'page' : undefined} onClick={() => onGo(tab)}>
            <Icon name={tab} />
            <span>{t(`nav.${tab}` as Key)}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}

export function Topbar({ onSettings, onBack }: { onSettings: () => void; onBack?: () => void }) {
  const { t } = useI18n();
  return (
    <header className="topbar">
      {onBack ? (
        <button className="icon-btn" onClick={onBack} aria-label={t('back')}><Icon name="back" /></button>
      ) : (
        <div className="brand">
          <b>DJ <i>PULSE</i></b>
          <span>{t('tagline')}</span>
        </div>
      )}
      {onBack && <div className="brand" style={{ flex: 1 }}><b>DJ <i>PULSE</i></b></div>}
      <button className="icon-btn" onClick={onSettings} aria-label={t('an.settings')}><Icon name="gear" size={20} /></button>
    </header>
  );
}

export function DemoBanner() {
  const { t } = useI18n();
  if (!USE_DEMO) return null;
  return <div className="demo-banner"><b>{t('demo')}</b><span>{t('demo.note')}</span></div>;
}

/** Статус последнего обновления: дата, состояние, ошибки; по тапу — каждый источник отдельно. */
export function FreshnessBar({ data }: { data: AppData }) {
  const { t, lang } = useI18n();
  const [open, setOpen] = useState(false);
  const { meta } = data;
  const stale = ageHours(meta.generated_at) > STALE_AFTER_HOURS;
  const state = stale ? 'stale' : meta.status;
  const title = stale ? t('status.stale') : t(`status.${meta.status}` as Key);
  return (
    <>
      <button className={`fresh ${state}`} onClick={() => setOpen(true)} aria-label={t('sources.title')}>
        <span className="dot" />
        <span className="txt">
          <b>{title}</b>
          <span>{t('updated')} {fmtDateTime(meta.generated_at, lang)} · {t('data.date')} {fmtDay(meta.data_date, lang)}</span>
        </span>
        <Icon name="chevron" size={18} />
      </button>
      {open && <Sheet title={t('sources.title')} onClose={() => setOpen(false)}><SourcesList data={data} /></Sheet>}
    </>
  );
}

export function SourcesList({ data }: { data: AppData }) {
  const { t, lang } = useI18n();
  const names: Record<string, string> = {
    wikipedia: 'Wikipedia Pageviews', lastfm: 'Last.fm', deezer: 'Deezer', musicbrainz: 'MusicBrainz', youtube: 'YouTube Data API',
  };
  const entries = Object.entries(data.sources).sort(([a], [b]) => a.localeCompare(b));
  return (
    <div>
      <div className="panel">
        {entries.map(([id, s]) => (
          <div className="kv" key={id}>
            <span>{names[id] ?? (s.name ? `RSS · ${s.name}` : id)}</span>
            <b style={{ color: s.status === 'ok' ? 'var(--up)' : s.status === 'error' ? 'var(--down)' : 'var(--tx3)' }}>
              {t(`sources.${s.status}` as Key)}
              <small>{t('sources.last')}: {s.last_success ? fmtDateTime(s.last_success, lang) : t('sources.never')}</small>
              {s.message && <small>{s.message}</small>}
            </b>
          </div>
        ))}
      </div>
      {data.missing.length > 0 && <p className="note pad">{t('sources.missing')}: {data.missing.join(', ')}</p>}
      {data.meta.errors.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <p className="note">{t('sources.errors')}:</p>
          {data.meta.errors.slice(0, 8).map((e, i) => <p className="note" key={i}>• {e}</p>)}
        </div>
      )}
    </div>
  );
}
