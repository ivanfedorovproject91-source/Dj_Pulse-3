import { useState } from 'react';
import LineChart from '../charts/LineChart';
import { SERIES } from '../charts/palette';
import { Avatar, Delta, Empty, FavStar, SecHead, SourceTags } from '../components/ui';
import { useI18n, type Key } from '../services/i18n';
import { flag, fmtDay, fmtNum } from '../services/format';
import { usePrefs } from '../services/prefs';
import { openLink } from '../services/telegram';
import type { AppData } from '../types';

const LINK_LABEL: Record<string, string> = {
  lastfm: 'Last.fm', deezer: 'Deezer', youtube: 'YouTube', soundcloud: 'SoundCloud', beatport: 'Beatport',
  website: 'Website', wikipedia: 'Wikipedia', musicbrainz: 'MusicBrainz',
};

export default function ArtistDetail({ data, id, go }: { data: AppData; id: string; go: (p: string) => void }) {
  const { t, lang } = useI18n();
  const { prefs, toggleFav } = usePrefs();
  const a = data.artists.find((x) => x.id === id);
  const histKeys = a ? Object.keys(a.history).filter((k) => a.history[k].length > 0) : [];
  const [metric, setMetric] = useState<string>(histKeys[0] ?? '');
  if (!a) return <Empty title={t('tracks.none')} />;

  const country = data.countries.find((c) => c.code === a.country);
  const gname = new Map(data.genres.map((g) => [g.id, g.name]));
  const active = histKeys.includes(metric) ? metric : histKeys[0];
  const metricList = Object.entries(a.metrics);
  const links = Object.entries(a.links).filter(([, u]) => /^https?:\/\//.test(u));

  return (
    <>
      <div className="row" style={{ padding: '0 0 14px', alignItems: 'flex-start' }}>
        <Avatar name={a.name} photo={a.photo} />
        <div className="grow">
          <h1 className="page-title" style={{ margin: '0 0 4px', fontSize: 20 }}>{a.name}</h1>
          <div className="note">
            {t('artist.origin')}: {flag(a.country)} {country ? (lang === 'ru' ? country.name_ru : country.name_en) : a.country ?? '—'}
            {a.country_source ? ` (${a.country_source})` : ''}
          </div>
        </div>
        <FavStar on={prefs.favArtists.includes(a.id)} onClick={() => toggleFav('favArtists', a.id)} />
      </div>

      {a.genres.length > 0 && (
        <div className="chips" style={{ paddingTop: 0 }}>
          {a.genres.map((gid) => <button key={gid} className="chip" onClick={() => go(`genres/${gid}`)}>{gname.get(gid) ?? gid}</button>)}
        </div>
      )}

      <section className="sec">
        <div className="panel">
          <div className="mini-grid">
            <div>
              <small>{t('artist.popularity')}</small>
              <b>{a.popularity != null ? Math.round(a.popularity) : '—'}</b>
              <div className="note" style={{ fontSize: 11.5 }}>{a.n_sources ? t('djs.sources', { n: a.n_sources }) : t('djs.nopop')}</div>
            </div>
            <div><small>{t('artist.growth')} · {t('change.30')}</small><Delta v={a.growth_30d} /></div>
            <div><small>{t('artist.growth')} · {t('change.90')}</small><Delta v={a.growth_90d} /></div>
          </div>
        </div>
        <p className="note" style={{ marginTop: 8 }}>{t('djs.pop.hint')}</p>
        {a.rising && (
          <div className="panel pad" style={{ marginTop: 10 }}>
            <div className="note">{t('artist.why')}</div>
            <p style={{ margin: '4px 0 8px' }}>{a.rising.reason}</p>
            <SourceTags sources={a.rising.sources} />
          </div>
        )}
      </section>

      <section className="sec">
        <SecHead title={t('artist.metrics')} />
        <div className="panel">
          {metricList.length ? metricList.map(([k, m]) => (
            <div className="kv" key={k}>
              <span>{t(`metric.${k}` as Key)}</span>
              <b>{fmtNum(m.value, lang)}<small>{m.source} · {t('asof')} {fmtDay(m.as_of, lang)}</small></b>
            </div>
          )) : <Empty>{t('artist.metrics.none')}</Empty>}
        </div>
      </section>

      <section className="sec">
        <SecHead title={t('artist.signals')} />
        <div className="panel">
          {a.signals.length ? a.signals.map((s) => (
            <div className="kv" key={s.metric}>
              <span>{s.source}</span>
              <b><Delta v={s.d30} /> {t('change.30')} · <Delta v={s.d90} /> {t('change.90')}</b>
            </div>
          )) : <Empty>{t('artist.signals.none')}</Empty>}
        </div>
      </section>

      <section className="sec">
        <SecHead title={t('artist.history')} />
        <div className="panel pad">
          {histKeys.length ? (
            <>
              {histKeys.length > 1 && (
                <div className="chips" style={{ paddingTop: 0 }}>
                  {histKeys.map((k) => <button key={k} className={`chip ${k === active ? 'on' : ''}`} onClick={() => setMetric(k)}>{t(`metric.${k}` as Key)}</button>)}
                </div>
              )}
              <LineChart
                key={active}
                series={[{ id: active, label: t(`metric.${active}` as Key), color: SERIES[histKeys.indexOf(active) % SERIES.length], points: a.history[active] }]}
                periods={[30, 90, 365]}
                defaultPeriod={90}
                allowSmooth={active === 'wiki'}
                small
              />
            </>
          ) : <Empty>{t('artist.history.none')}</Empty>}
        </div>
      </section>

      {links.length > 0 && (
        <section className="sec">
          <SecHead title={t('artist.links')} />
          <div className="chips" style={{ flexWrap: 'wrap', overflow: 'visible', margin: 0, padding: 0 }}>
            {links.map(([k, u]) => <button key={k} className="chip" onClick={() => openLink(u)}>{LINK_LABEL[k] ?? k}</button>)}
          </div>
        </section>
      )}
    </>
  );
}
