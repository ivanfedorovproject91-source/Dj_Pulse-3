import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import BarChart from '../charts/BarChart';
import { SERIES } from '../charts/palette';
import { ArtistRow, NewsRow } from '../components/Rows';
import { SourcesList } from '../components/Shell';
import { Empty, SecHead, Seg, SourceTags, Toggle } from '../components/ui';
import { apiConfigured, saveDigestPrefs, type SyncResult } from '../services/api';
import { useI18n, type Key } from '../services/i18n';
import { flag, fmtNum } from '../services/format';
import { DIGEST_SECTIONS, SECTIONS, usePrefs, type DigestSection, type Lang } from '../services/prefs';
import { haptic, inTelegram, tg } from '../services/telegram';
import type { AppData } from '../types';

export type ATab = 'insights' | 'world' | 'sources' | 'settings';
const ENT: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#x27;': "'", '&#39;': "'" };

/** Безопасно показывает дайджест: допускается только <b>, остальное — обычный текст. */
function DigestText({ html }: { html: string }) {
  const parts = html.split(/(<b>.*?<\/b>)/g);
  const dec = (s: string) => s.replace(/&(amp|lt|gt|quot|#x27|#39);/g, (m) => ENT[m] ?? m);
  const nodes: ReactNode[] = parts.map((p, i) => (p.startsWith('<b>') ? <b key={i}>{dec(p.slice(3, -4))}</b> : <span key={i}>{dec(p)}</span>));
  return <p style={{ whiteSpace: 'pre-line', fontSize: 13.5, lineHeight: 1.55 }}>{nodes}</p>;
}

export default function Analytics({ data, tab, setTab, go }: { data: AppData; tab: ATab; setTab: (t: ATab) => void; go: (p: string) => void }) {
  const { t } = useI18n();
  return (
    <>
      <h1 className="page-title">{t('nav.analytics')}</h1>
      <div className="tabs-page">
        <Seg<ATab> value={tab} onChange={setTab}
          options={[{ id: 'insights', label: t('an.insights') }, { id: 'world', label: t('an.world') }, { id: 'sources', label: t('an.sources') }, { id: 'settings', label: t('an.settings') }]} />
      </div>
      {tab === 'insights' && <Insights data={data} go={go} />}
      {tab === 'world' && <World data={data} go={go} />}
      {tab === 'sources' && <Sources data={data} />}
      {tab === 'settings' && <Settings data={data} />}
    </>
  );
}

function Insights({ data, go }: { data: AppData; go: (p: string) => void }) {
  const { t } = useI18n();
  const items = data.insights.items;
  return (
    <>
      <div className="panel">
        {items.length ? items.map((i) => (
          <div className="insight" key={i.id}>
            <h3>{i.title}</h3>
            <p>{i.body}</p>
            <div className="note" style={{ marginBottom: 4 }}>{t('insights.period')}: {t('insights.days', { n: i.period_days })}</div>
            <div className="note" style={{ marginBottom: 2 }}>{t('insights.evidence')}</div>
            {i.evidence.map((e, k) => <div className="ev" key={k}><span>{e.label}</span><b>{e.value}</b></div>)}
            <div style={{ marginTop: 8 }}><SourceTags sources={i.sources} /></div>
            {i.genre && <button className="chip" style={{ marginTop: 4 }} onClick={() => go(`genres/${i.genre}`)}>{data.genres.find((g) => g.id === i.genre)?.name}</button>}
          </div>
        )) : <Empty>{t('insights.none')}</Empty>}
      </div>
      <p className="note pad">{t('insights.ru.note')}</p>
      {data.news.length > 0 && (
        <section className="sec">
          <SecHead title={t('section.news')} />
          <div className="panel">{data.news.slice(0, 10).map((n) => <NewsRow key={n.link} n={n} />)}</div>
        </section>
      )}
    </>
  );
}

function World({ data, go }: { data: AppData; go: (p: string) => void }) {
  const { t, lang } = useI18n();
  const [code, setCode] = useState('RU');
  const countries = useMemo(() => [...data.countries].sort((a, b) => (a.code === 'RU' ? -1 : b.code === 'RU' ? 1 : b.origin.n_artists - a.origin.n_artists)), [data.countries]);
  const c = countries.find((x) => x.code === code) ?? countries[0];
  const name = (x: { name_ru: string; name_en: string }) => (lang === 'ru' ? x.name_ru : x.name_en);
  if (!c) return <Empty>{t('world.empty')}</Empty>;

  const byId = new Map(data.artists.map((a) => [a.id, a]));
  const top = c.origin.top_artists.map((id) => byId.get(id)).filter(Boolean).slice(0, 5);
  const rising = c.origin.rising_artists.map((id) => byId.get(id)).filter(Boolean).slice(0, 5);
  const market = countries.filter((x) => x.origin.n_artists > 0).map((x) => ({
    id: x.code, label: `${flag(x.code)} ${name(x)}`, value: x.origin.n_artists, color: x.code === c.code ? '#b7ff3c' : '#4a554f',
  }));

  return (
    <>
      <div className="chips">
        {countries.map((x) => <button key={x.code} className={`chip ${x.code === c.code ? 'on' : ''}`} onClick={() => { setCode(x.code); haptic(); }}>{flag(x.code)} {name(x)}</button>)}
      </div>

      <section className="sec">
        <SecHead title={t('world.compare')} note={t('world.compare.note')} />
        <div className="panel pad">
          {market.length ? <BarChart items={market} fmt={(v) => String(v)} onSelect={setCode} /> : <Empty>{t('world.empty')}</Empty>}
        </div>
      </section>

      <section className="sec">
        <SecHead title={`${flag(c.code)} ${name(c)} · ${t('world.origin')}`} />
        <div className="panel">
          <div className="mini-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
            <div><small>{t('world.artists.short')}</small><b>{c.origin.n_artists}</b></div>
            <div><small>{t('world.rising.short')}</small><b>{c.origin.n_rising}</b></div>
          </div>
        </div>
        <p className="note" style={{ margin: '8px 0' }}>{c.origin.source}. {t('world.origin.note')}</p>
        {c.origin.genres.length > 0 && (
          <div className="panel pad" style={{ marginBottom: 12 }}>
            <div className="note" style={{ marginBottom: 6 }}>{t('world.genres')}</div>
            <BarChart items={c.origin.genres.map((g, i) => ({ id: g.genre, label: g.name, value: g.count, color: SERIES[i % SERIES.length] }))} fmt={(v) => String(v)} onSelect={(id) => go(`genres/${id}`)} />
          </div>
        )}
        {rising.length > 0 && (
          <>
            <SecHead title={t('world.rising')} />
            <div className="panel" style={{ marginBottom: 12 }}>{rising.map((a) => a && <ArtistRow key={a.id} a={a} onOpen={() => go(`artist/${a.id}`)} showReason />)}</div>
          </>
        )}
        {top.length > 0 ? (
          <>
            <SecHead title={t('world.top')} />
            <div className="panel">{top.map((a, i) => a && <ArtistRow key={a.id} a={a} rank={i + 1} onOpen={() => go(`artist/${a.id}`)} />)}</div>
          </>
        ) : <div className="panel"><Empty>{t('world.empty')}</Empty></div>}
      </section>

      <section className="sec">
        <SecHead title={t('world.listeners')} />
        {c.listeners ? (
          <div className="panel pad">
            <p className="note" style={{ marginBottom: 6 }}>{c.listeners.source}</p>
            <div className="kv" style={{ padding: '6px 0' }}>
              <span>{t('world.share')}</span>
              <b>{c.listeners.share_electronic_in_top50 != null ? `${fmtNum(c.listeners.share_electronic_in_top50, lang)}%` : '—'}</b>
            </div>
            {c.listeners.genres.length > 0 && (
              <BarChart items={c.listeners.genres.map((g, i) => ({ id: g.genre, label: g.name, value: g.count, color: SERIES[i % SERIES.length] }))} fmt={(v) => String(v)} onSelect={(id) => go(`genres/${id}`)} />
            )}
          </div>
        ) : <div className="panel"><Empty>{t('world.listeners.na')}</Empty></div>}
      </section>
    </>
  );
}

function Sources({ data }: { data: AppData }) {
  const { t } = useI18n();
  return (
    <>
      <SecHead title={t('sources.title')} />
      <SourcesList data={data} />
      <section className="sec" style={{ marginTop: 22 }}>
        <SecHead title={t('method.title')} />
        <div className="panel pad" style={{ display: 'grid', gap: 10 }}>
          {(['method.score', 'method.change', 'method.status', 'method.pop', 'method.growth'] as Key[]).map((k) => <p className="note" key={k} style={{ color: 'var(--tx2)' }}>{t(k)}</p>)}
        </div>
      </section>
      <section className="sec">
        <SecHead title={t('method.limits')} />
        <div className="panel pad" style={{ display: 'grid', gap: 8 }}>
          {(['method.limits.1', 'method.limits.2', 'method.limits.3', 'method.limits.4'] as Key[]).map((k) => <p className="note" key={k} style={{ color: 'var(--tx2)' }}>• {t(k)}</p>)}
          <p className="note">{t('method.add')}</p>
          <p className="note">{t('method.lastfm')}</p>
        </div>
      </section>
    </>
  );
}

function Settings({ data }: { data: AppData }) {
  const { t } = useI18n();
  const { prefs, update } = usePrefs();
  const [result, setResult] = useState<SyncResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;

  const save = async () => {
    setBusy(true);
    tg()?.MainButton?.showProgress();
    const r = await saveDigestPrefs(prefsRef.current);
    setBusy(false);
    tg()?.MainButton?.hideProgress();
    setResult(r);
    if (r === 'ok') { setDirty(false); haptic('success'); }
  };
  const saveRef = useRef(save);
  saveRef.current = save;

  // Главная кнопка Telegram («Сохранить подписку») показывается только при несохранённых изменениях.
  useEffect(() => {
    const mb = tg()?.MainButton;
    if (!mb || !inTelegram()) return;
    const h = () => { void saveRef.current(); };
    if (dirty && prefs.digest.freq !== undefined) {
      mb.setParams({ text: t('settings.digest.save'), is_visible: true, is_active: true, color: '#b7ff3c', text_color: '#0e1011' });
      mb.onClick(h);
    } else mb.hide();
    return () => { mb.offClick(h); mb.hide(); };
  }, [dirty, t, prefs.digest.freq]);

  const setDigest = (patch: Partial<typeof prefs.digest>) => { update({ digest: { ...prefs.digest, ...patch } }); setDirty(true); setResult(null); };
  const toggleDigestSection = (s: DigestSection, on: boolean) =>
    setDigest({ sections: on ? [...new Set([...prefs.digest.sections, s])] : prefs.digest.sections.filter((x) => x !== s) });

  const msg: Record<SyncResult, Key> = { ok: 'settings.digest.saved', error: 'settings.digest.err', 'no-api': 'settings.digest.noapi', 'no-telegram': 'settings.digest.notg', unauthorized: 'settings.digest.unauth' };

  return (
    <>
      <section className="sec">
        <SecHead title={t('settings.lang')} />
        <Seg<Lang> value={prefs.lang} onChange={(l) => { update({ lang: l }); setDirty(true); }} options={[{ id: 'ru', label: 'Русский' }, { id: 'en', label: 'English' }]} />
      </section>

      <section className="sec">
        <SecHead title={t('settings.sections')} />
        <div className="panel">
          {SECTIONS.map((s) => (
            <Toggle key={s} on={!prefs.hidden.includes(s)} onChange={(on) => update({ hidden: on ? prefs.hidden.filter((x) => x !== s) : [...prefs.hidden, s] })}>
              {t(`section.${s}` as Key)}
            </Toggle>
          ))}
        </div>
      </section>

      <section className="sec">
        <SecHead title={t('settings.digest')} />
        <p className="note" style={{ marginBottom: 8 }}>{t('settings.digest.freq')}</p>
        <Seg<'off' | 'daily' | 'weekly'> value={prefs.digest.freq} onChange={(f) => setDigest({ freq: f })}
          options={[{ id: 'off', label: t('settings.digest.off') }, { id: 'daily', label: t('settings.digest.daily') }, { id: 'weekly', label: t('settings.digest.weekly') }]} />
        {prefs.digest.freq !== 'off' && (
          <>
            <p className="note" style={{ margin: '14px 0 8px' }}>{t('settings.digest.sections')}</p>
            <div className="panel">
              {DIGEST_SECTIONS.map((s) => (
                <Toggle key={s} on={prefs.digest.sections.includes(s)} onChange={(on) => toggleDigestSection(s, on)}>{t(`digest.${s}` as Key)}</Toggle>
              ))}
            </div>
          </>
        )}
        {!inTelegram() && <button className="btn" style={{ marginTop: 14 }} disabled={busy || !dirty} onClick={() => void save()}>{t('settings.digest.save')}</button>}
        {inTelegram() && !dirty && result !== 'ok' && !apiConfigured && <p className="note" style={{ marginTop: 10 }}>{t('settings.digest.noapi')}</p>}
        {result && <p className="note" style={{ marginTop: 10, color: result === 'ok' ? 'var(--up)' : 'var(--warn)' }}>{t(msg[result])}</p>}
      </section>

      {data.digest && (
        <section className="sec">
          <SecHead title={t('settings.preview')} note={data.digest.data_date} />
          <div className="panel pad" style={{ display: 'grid', gap: 12 }}>
            {data.digest.order.filter((k) => data.digest!.sections[k]).map((k) => <DigestText key={k} html={data.digest!.sections[k]} />)}
            <p className="note">{data.digest.footer.replace(/&amp;/g, '&')}</p>
          </div>
        </section>
      )}

      <button className="btn ghost" onClick={() => update({ favGenres: [], favArtists: [] })}>{t('settings.reset')}</button>
    </>
  );
}
