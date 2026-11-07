import LineChart from '../charts/LineChart';
import { SERIES } from '../charts/palette';
import { ArtistRow, ReleaseRow, TrackRow } from '../components/Rows';
import { Delta, Empty, FavStar, SecHead, SourceTags, StatusBadge } from '../components/ui';
import { useAudio } from '../hooks/useAudio';
import { useI18n } from '../services/i18n';
import { fmtDay } from '../services/format';
import { usePrefs } from '../services/prefs';
import { openLink } from '../services/telegram';
import type { AppData } from '../types';

export default function GenreDetail({ data, id, go }: { data: AppData; id: string; go: (p: string) => void }) {
  const { t, lang } = useI18n();
  const { prefs, toggleFav } = usePrefs();
  const audio = useAudio();
  const g = data.genres.find((x) => x.id === id);
  if (!g) return <Empty title={t('tracks.none')} />;

  const tracks = data.tracks.filter((x) => x.genre === g.id).sort((a, b) => a.chart_position - b.chart_position).slice(0, 8);
  const artists = data.artists.filter((a) => a.genres.includes(g.id)).sort((a, b) => (b.popularity ?? -1) - (a.popularity ?? -1)).slice(0, 6);
  const releases = data.releases.filter((r) => r.genre === g.id).slice(0, 6);
  const lfPoints = g.history.lf_reach;

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div>
          <h1 className="page-title" style={{ marginBottom: 8 }}>{g.name}</h1>
          <StatusBadge status={g.status} />
        </div>
        <FavStar on={prefs.favGenres.includes(g.id)} onClick={() => toggleFav('favGenres', g.id)} />
      </div>

      <section className="sec" style={{ marginTop: 16 }}>
        <div className="panel">
          <div className="row" style={{ alignItems: 'flex-end' }}>
            <div className="grow">
              <div className="note">{t('score')}</div>
              <div className="score">{g.score != null ? g.score.toFixed(0) : '—'}</div>
            </div>
            <div className="note" style={{ maxWidth: 150, textAlign: 'right' }}>{t('score.hint')}</div>
          </div>
          <div className="kpis" style={{ borderTop: '1px solid var(--line)' }}>
            <div className="kpi"><small>{t('change.7')}</small><Delta v={g.changes.d7} /></div>
            <div className="kpi"><small>{t('change.30')}</small><Delta v={g.changes.d30} /></div>
            <div className="kpi"><small>{t('change.90')}</small><Delta v={g.changes.d90} /></div>
          </div>
        </div>
        {g.changes.y1 != null && <p className="note" style={{ marginTop: 8 }}>{t('change.365')}: <Delta v={g.changes.y1} /></p>}
      </section>

      <section className="sec">
        <SecHead title={t('genre.history')} />
        <div className="panel pad">
          <LineChart series={[{ id: g.id, label: g.name, color: SERIES[0], points: g.history.wiki }]} defaultPeriod={90} />
          <p className="note" style={{ marginTop: 8 }}>{t('genre.history.note')}</p>
          <p className="note">{t('genre.asof')} {fmtDay(g.as_of, lang)} · <SourceTags sources={g.sources} /></p>
          {g.wiki_article && (
            <button className="chip" style={{ marginTop: 8 }} onClick={() => openLink(`https://en.wikipedia.org/wiki/${encodeURIComponent(g.wiki_article!.replace(/ /g, '_'))}`)}>
              {t('genre.article')}
            </button>
          )}
        </div>
      </section>

      <section className="sec">
        <SecHead title={t('genre.lf')} />
        <div className="panel pad">
          {lfPoints.length >= 3 ? (
            <LineChart series={[{ id: 'lf', label: 'Last.fm', color: SERIES[1], points: lfPoints }]} defaultPeriod={90} allowSmooth={false} small />
          ) : (
            <p className="note">{t('genre.lf.few')}: {lfPoints.length}</p>
          )}
        </div>
      </section>

      <section className="sec">
        <SecHead title={t('genre.tracks')} />
        <div className="panel">
          {tracks.length ? tracks.map((x) => <TrackRow key={x.id} tr={x} playing={audio.playing === x.id} onPlay={audio.toggle} />) : <Empty>{t('genre.tracks.none')}</Empty>}
        </div>
      </section>

      <section className="sec">
        <SecHead title={t('genre.artists')} />
        <div className="panel">
          {artists.length ? artists.map((a, i) => <ArtistRow key={a.id} a={a} rank={i + 1} onOpen={() => go(`artist/${a.id}`)} />) : <Empty>{t('genre.artists.none')}</Empty>}
        </div>
      </section>

      <section className="sec">
        <SecHead title={t('genre.releases')} />
        <div className="panel">
          {releases.length ? releases.map((r) => <ReleaseRow key={r.mbid} r={r} />) : <Empty>{t('genre.releases.none')}</Empty>}
        </div>
      </section>
    </>
  );
}
