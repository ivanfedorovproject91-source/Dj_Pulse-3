import { useMemo, useState } from 'react';
import { ReleaseRow, TrackRow } from '../components/Rows';
import { Empty, SecHead, Seg } from '../components/ui';
import { useAudio } from '../hooks/useAudio';
import { useI18n } from '../services/i18n';
import { daysBetween } from '../services/format';
import type { AppData, Track } from '../types';

type Tab = 'charts' | 'rising' | 'new';
type Src = '' | 'deezer' | 'lastfm';

export default function Tracks({ data }: { data: AppData }) {
  const { t } = useI18n();
  const audio = useAudio();
  const [tab, setTab] = useState<Tab>('charts');
  const [genre, setGenre] = useState('');
  const [src, setSrc] = useState<Src>('');
  const [period, setPeriod] = useState('0');
  const gname = useMemo(() => new Map(data.genres.map((g) => [g.id, g.name])), [data.genres]);
  const today = data.meta.data_date;

  const filtered = useMemo(() => {
    const p = Number(period);
    return data.tracks.filter((x: Track) => {
      if (src && x.source !== src) return false;
      if (genre && x.genre !== genre) return false;
      if (p > 0) {
        if (!x.release_date) return false;
        const age = daysBetween(x.release_date, today);
        if (age < 0 || age > p) return false;
      }
      return true;
    });
  }, [data.tracks, genre, src, period, today]);

  const list = useMemo(() => {
    if (tab === 'rising') return filtered.filter((x) => (x.position_delta ?? 0) > 0).sort((a, b) => (b.position_delta as number) - (a.position_delta as number));
    if (tab === 'new') return filtered.filter((x) => x.release_date).sort((a, b) => ((a.release_date as string) < (b.release_date as string) ? 1 : -1));
    return [...filtered].sort((a, b) => (a.source === b.source ? a.chart_position - b.chart_position : a.source === 'deezer' ? -1 : 1));
  }, [filtered, tab]);

  const hasDelta = data.tracks.some((x) => x.position_delta != null);
  const releases = data.releases.filter((r) => !genre || r.genre === genre);

  return (
    <>
      <h1 className="page-title">{t('nav.tracks')}</h1>
      <Seg<Tab> value={tab} onChange={setTab} options={[{ id: 'charts', label: t('tracks.charts') }, { id: 'rising', label: t('tracks.rising') }, { id: 'new', label: t('tracks.new') }]} />
      <div className="filters">
        <label>
          <span className="field-label">{t('djs.genre')}</span>
          <select className="select" value={genre} onChange={(e) => setGenre(e.target.value)}>
            <option value="">{t('all')}</option>
            {data.genres.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </label>
        <label>
          <span className="field-label">{t('tracks.source')}</span>
          <select className="select" value={src} onChange={(e) => setSrc(e.target.value as Src)}>
            <option value="">{t('all')}</option>
            <option value="deezer">Deezer</option>
            <option value="lastfm">Last.fm</option>
          </select>
        </label>
        <label>
          <span className="field-label">{t('tracks.period')}</span>
          <select className="select" value={period} onChange={(e) => setPeriod(e.target.value)}>
            <option value="0">{t('period.all')}</option>
            <option value="7">{t('chart.period.7')}</option>
            <option value="30">{t('chart.period.30')}</option>
            <option value="90">{t('chart.period.90')}</option>
          </select>
        </label>
        <label>
          <span className="field-label">{t('tracks.country')}</span>
          <select className="select" disabled value="" aria-describedby="country-na"><option>—</option></select>
        </label>
      </div>
      <p className="note" id="country-na" style={{ marginBottom: 6 }}>{t('tracks.country.na')}. {Number(period) > 0 ? t('tracks.period.note') : ''}</p>
      <p className="note" style={{ marginBottom: 12 }}>{t('tracks.deezer.note')}</p>

      <div className="panel">
        {list.length ? list.slice(0, 60).map((x) => <TrackRow key={x.id} tr={x} playing={audio.playing === x.id} onPlay={audio.toggle} />)
          : <Empty>{tab === 'rising' && !hasDelta ? t('tracks.rising.none') : t('tracks.none')}</Empty>}
      </div>

      {tab === 'new' && (
        <section className="sec" style={{ marginTop: 22 }}>
          <SecHead title={t('section.releases')} note="MusicBrainz" />
          <div className="panel">
            {releases.length ? releases.slice(0, 25).map((r) => <ReleaseRow key={r.mbid} r={r} genreName={gname.get(r.genre)} />) : <Empty>{t('genre.releases.none')}</Empty>}
          </div>
        </section>
      )}
    </>
  );
}
