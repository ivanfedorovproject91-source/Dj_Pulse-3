import { useMemo } from 'react';
import LineChart from '../charts/LineChart';
import { SERIES } from '../charts/palette';
import { ArtistRow, GenreRow, NewsRow, ReleaseRow, TrackRow } from '../components/Rows';
import { Empty, SecHead, SourceTags } from '../components/ui';
import { useAudio } from '../hooks/useAudio';
import { useI18n } from '../services/i18n';
import { fmtPct } from '../services/format';
import { usePrefs, type SectionId } from '../services/prefs';
import type { AppData } from '../types';

interface Props { data: AppData; go: (p: string) => void }

export default function Dashboard({ data, go }: Props) {
  const { t } = useI18n();
  const { prefs, toggleFav } = usePrefs();
  const audio = useAudio();
  const show = (id: SectionId) => !prefs.hidden.includes(id);
  const gname = useMemo(() => new Map(data.genres.map((g) => [g.id, g.name])), [data.genres]);

  const topGenres = useMemo(
    () => data.genres.filter((g) => g.changes.d30 != null).sort((a, b) => (b.changes.d30 as number) - (a.changes.d30 as number)).slice(0, 5),
    [data.genres],
  );
  const rising = useMemo(
    () => data.artists.filter((a) => a.rising).sort((a, b) => (b.growth_30d ?? 0) - (a.growth_30d ?? 0)).slice(0, 5),
    [data.artists],
  );
  const hotTracks = useMemo(() => {
    const dz = data.tracks.filter((x) => x.source === 'deezer');
    const movers = dz.filter((x) => (x.position_delta ?? 0) > 0).sort((a, b) => (b.position_delta as number) - (a.position_delta as number));
    return (movers.length ? movers : dz.sort((a, b) => a.chart_position - b.chart_position)).slice(0, 5);
  }, [data.tracks]);
  const releases = useMemo(() => [...data.releases].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 5), [data.releases]);
  const favGenres = data.genres.filter((g) => prefs.favGenres.includes(g.id));
  const favArtists = data.artists.filter((a) => prefs.favArtists.includes(a.id));
  const wt = data.insights.weekly_trend;

  return (
    <>
      {show('trend') && (
        <section className="hero" aria-label={t('trend.title')}>
          <h2>{t('trend.title')}</h2>
          {wt ? (
            <>
              <div className="pulse" aria-hidden="true"><i /><i /><i /><b /></div>
              <div className="name">{wt.name}</div>
              <div className="big">{fmtPct(wt.d7)}</div>
              <div className="meta">{t('trend.d7')}{wt.d30 != null ? ` · ${fmtPct(wt.d30)} ${t('trend.d30')}` : ''}</div>
              <div className="tags"><SourceTags sources={wt.sources} /></div>
              <button className="chip" style={{ marginTop: 6 }} onClick={() => go(`genres/${wt.genre}`)}>{t('genre.history')}</button>
            </>
          ) : (
            <>
              <div className="name" style={{ maxWidth: '100%', fontSize: 17 }}>{t('trend.none')}</div>
              <p className="note" style={{ marginTop: 8 }}>{t('trend.none.why')}</p>
            </>
          )}
        </section>
      )}

      {show('favorites') && (favGenres.length > 0 || favArtists.length > 0) && (
        <section className="sec">
          <SecHead title={t('section.favorites')} />
          <div className="panel">
            {favGenres.map((g) => <GenreRow key={g.id} g={g} onOpen={() => go(`genres/${g.id}`)} fav onFav={() => toggleFav('favGenres', g.id)} />)}
            {favArtists.map((a) => <ArtistRow key={a.id} a={a} onOpen={() => go(`artist/${a.id}`)} fav onFav={() => toggleFav('favArtists', a.id)} />)}
          </div>
        </section>
      )}
      {show('favorites') && favGenres.length === 0 && favArtists.length === 0 && (
        <section className="sec">
          <SecHead title={t('section.favorites')} />
          <div className="panel"><Empty>{t('fav.empty')}</Empty></div>
        </section>
      )}

      {show('chart') && (
        <section className="sec">
          <SecHead title={t('section.chart')} note={t('top5')} />
          <div className="panel pad">
            <LineChart
              defaultMode="pct"
              defaultPeriod={90}
              series={topGenres.map((g, i) => ({ id: g.id, label: g.name, color: SERIES[i % SERIES.length], points: g.history.wiki }))}
            />
            <p className="note" style={{ marginTop: 8 }}>{t('genre.history.note')}</p>
          </div>
        </section>
      )}

      {show('genres') && (
        <section className="sec">
          <SecHead title={t('section.genres')} action={{ label: t('more'), onClick: () => go('genres') }} />
          <div className="panel">
            {topGenres.length ? topGenres.map((g) => <GenreRow key={g.id} g={g} onOpen={() => go(`genres/${g.id}`)} />) : <Empty>{t('status.insufficient.hint')}</Empty>}
          </div>
        </section>
      )}

      {show('rising') && (
        <section className="sec">
          <SecHead title={t('section.rising')} action={{ label: t('more'), onClick: () => go('djs') }} />
          <div className="panel">
            {rising.length ? rising.map((a, i) => <ArtistRow key={a.id} a={a} rank={i + 1} onOpen={() => go(`artist/${a.id}`)} />) : <Empty>{t('djs.none.rising')}</Empty>}
          </div>
        </section>
      )}

      {show('tracks') && (
        <section className="sec">
          <SecHead title={t('section.tracks')} action={{ label: t('more'), onClick: () => go('tracks') }} />
          <div className="panel">
            {hotTracks.length ? hotTracks.map((x) => <TrackRow key={x.id} tr={x} playing={audio.playing === x.id} onPlay={audio.toggle} />) : <Empty>{t('tracks.none')}</Empty>}
          </div>
        </section>
      )}

      {show('releases') && (
        <section className="sec">
          <SecHead title={t('section.releases')} />
          <div className="panel">
            {releases.length ? releases.map((r) => <ReleaseRow key={r.mbid} r={r} genreName={gname.get(r.genre)} />) : <Empty>{t('genre.releases.none')}</Empty>}
          </div>
        </section>
      )}

      {show('insights') && (
        <section className="sec">
          <SecHead title={t('section.insights')} action={{ label: t('more'), onClick: () => go('analytics/insights') }} />
          <div className="panel">
            {data.insights.items.length ? data.insights.items.slice(0, 3).map((i) => (
              <div className="insight" key={i.id}>
                <h3>{i.title}</h3>
                <p style={{ marginBottom: 6 }}>{i.body}</p>
                <SourceTags sources={i.sources} />
              </div>
            )) : <Empty>{t('insights.none')}</Empty>}
          </div>
        </section>
      )}

      {show('news') && data.news.length > 0 && (
        <section className="sec">
          <SecHead title={t('section.news')} />
          <div className="panel">{data.news.slice(0, 4).map((n) => <NewsRow key={n.link} n={n} />)}</div>
        </section>
      )}
    </>
  );
}
