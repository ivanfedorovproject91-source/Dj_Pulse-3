import { useI18n } from '../services/i18n';
import { fmtDay, fmtNum, flag } from '../services/format';
import { openLink } from '../services/telegram';
import type { Artist, Genre, NewsItem, Release, Track } from '../types';
import Spark from '../charts/Spark';
import { Avatar, Delta, FavStar, Icon, StatusBadge } from './ui';

export function GenreRow({ g, onOpen, fav, onFav, right }: {
  g: Genre; onOpen: () => void; fav?: boolean; onFav?: () => void; right?: 'spark' | 'score';
}) {
  const { t } = useI18n();
  return (
    <div className="row" style={{ cursor: 'pointer' }} onClick={onOpen} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onOpen()}>
      <div className="grow">
        <div className="title">{g.name}</div>
        <div className="sub"><StatusBadge status={g.status} /></div>
      </div>
      {right !== 'score' && <Spark points={g.history.wiki} days={30} />}
      <div style={{ textAlign: 'right', minWidth: 62 }}>
        <Delta v={g.changes.d30} />
        <div className="note" style={{ fontSize: 11.5 }}>{t('change.30')}</div>
      </div>
      {onFav && <FavStar on={!!fav} onClick={onFav} />}
    </div>
  );
}

export function ArtistRow({ a, onOpen, rank, showReason, fav, onFav }: {
  a: Artist; onOpen: () => void; rank?: number; showReason?: boolean; fav?: boolean; onFav?: () => void;
}) {
  const { t, lang } = useI18n();
  return (
    <div className="row" style={{ cursor: 'pointer', alignItems: 'flex-start' }} onClick={onOpen} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onOpen()}>
      {rank != null && <span className="rank" style={{ paddingTop: 12 }}>{rank}</span>}
      <Avatar name={a.name} photo={a.photo} />
      <div className="grow" style={{ paddingTop: 2 }}>
        <div className="title">{a.name}</div>
        <div className="sub">{flag(a.country)} {a.country ?? '—'}{a.sources.length ? ` · ${a.sources.join(', ')}` : ''}</div>
        {a.popularity != null ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 7 }}>
            <div className="bar" style={{ flex: 1 }}><i style={{ width: `${Math.max(3, a.popularity)}%` }} /></div>
            <span className="note" style={{ fontSize: 11.5, minWidth: 74, textAlign: 'right' }}>{Math.round(a.popularity)} · {t('djs.sources', { n: a.n_sources })}</span>
          </div>
        ) : <div className="note" style={{ marginTop: 4 }}>{t('djs.nopop')}</div>}
        {showReason && a.rising && <div className="note" style={{ marginTop: 5, color: 'var(--tx2)' }}>{a.rising.reason}</div>}
      </div>
      <div style={{ textAlign: 'right', paddingTop: 2 }}>
        <Delta v={a.growth_30d} />
        <div className="note" style={{ fontSize: 11.5 }}>{t('change.30')}</div>
      </div>
      {onFav && <FavStar on={!!fav} onClick={onFav} />}
      <span hidden>{lang}</span>
    </div>
  );
}

export function TrackRow({ tr, playing, onPlay }: { tr: Track; playing: boolean; onPlay: (t: Track) => void }) {
  const { t, lang } = useI18n();
  return (
    <div className="row">
      <span className="pos">#{tr.chart_position}</span>
      <span className="cover">{tr.cover ? <img src={tr.cover} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <Icon name="disc" size={20} />}</span>
      <div className="grow">
        <div className="title">{tr.title}</div>
        <div className="sub">{tr.artist}</div>
        <div className="sub">
          {tr.chart}{tr.release_date ? ` · ${t('tracks.released')} ${fmtDay(tr.release_date, lang)}` : ''}
        </div>
      </div>
      <div style={{ textAlign: 'right', minWidth: 44 }}>
        {tr.position_delta != null ? <Delta v={tr.position_delta} /> : <span className="delta na">—</span>}
      </div>
      {tr.preview && (
        <button className={`play ${playing ? 'on' : ''}`} onClick={() => onPlay(tr)} aria-label={playing ? t('tracks.stop') : t('tracks.play')}>
          <Icon name={playing ? 'stop' : 'play'} size={16} />
        </button>
      )}
      {tr.url && <button className="play" onClick={() => openLink(tr.url!)} aria-label={t('tracks.open')}><Icon name="ext" size={16} /></button>}
    </div>
  );
}

export function ReleaseRow({ r, genreName }: { r: Release; genreName?: string }) {
  const { lang } = useI18n();
  return (
    <button className="row" onClick={() => openLink(r.url)}>
      <span className="cover"><Icon name="disc" size={20} /></span>
      <div className="grow">
        <div className="title">{r.title}</div>
        <div className="sub">{r.artist}</div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div className="note">{fmtDay(r.date, lang)}</div>
        {(genreName || r.type) && <div className="note" style={{ fontSize: 11.5 }}>{[r.type, genreName].filter(Boolean).join(' · ')}</div>}
      </div>
    </button>
  );
}

export function NewsRow({ n }: { n: NewsItem }) {
  const { lang } = useI18n();
  return (
    <button className="row news-row" onClick={() => openLink(n.link)}>
      <div className="grow">
        <div className="title">{n.title}</div>
        <div className="sub">{n.source} · {fmtDay(n.published, lang)}</div>
      </div>
      <Icon name="ext" size={16} />
    </button>
  );
}

export { fmtNum };
