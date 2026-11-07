import { useCallback, useEffect, useState } from 'react';
import { BottomNav, DemoBanner, FreshnessBar, Topbar, type Tab, TABS } from './components/Shell';
import { useBackButton, useRoute } from './hooks/useRoute';
import Analytics, { type ATab } from './pages/Analytics';
import ArtistDetail from './pages/ArtistDetail';
import Dashboard from './pages/Dashboard';
import Djs from './pages/Djs';
import GenreDetail from './pages/GenreDetail';
import Genres from './pages/Genres';
import Tracks from './pages/Tracks';
import { loadAll, NoDataError } from './services/data';
import { useI18n } from './services/i18n';
import type { AppData } from './types';

type Load = { state: 'loading' } | { state: 'nodata' } | { state: 'error' } | { state: 'ready'; data: AppData };

function tabOf(parts: string[]): Tab {
  const [a] = parts;
  if (a === 'artist') return 'djs';
  return (TABS as readonly string[]).includes(a) ? (a as Tab) : 'dashboard';
}

export default function App() {
  const { t } = useI18n();
  const { parts, go, back } = useRoute();
  const [load, setLoad] = useState<Load>({ state: 'loading' });

  const fetchData = useCallback(() => {
    setLoad({ state: 'loading' });
    loadAll().then((data) => setLoad({ state: 'ready', data })).catch((e) => setLoad({ state: e instanceof NoDataError ? 'nodata' : 'error' }));
  }, []);
  useEffect(fetchData, [fetchData]);

  const tab = tabOf(parts);
  const nested = parts.length > 1 && !(parts[0] === 'analytics' && parts.length === 2);
  useBackButton(nested, back);

  const aTab = (['insights', 'world', 'sources', 'settings'] as string[]).includes(parts[1]) ? (parts[1] as ATab) : 'insights';
  const goTab = (x: Tab) => { go(x === 'dashboard' ? '' : x); window.scrollTo({ top: 0 }); };

  return (
    <div className="app">
      <Topbar onSettings={() => go('analytics/settings')} onBack={nested ? back : undefined} />
      {load.state === 'loading' && <div className="loader"><div className="spin" /><span>{t('loading')}</span></div>}
      {(load.state === 'nodata' || load.state === 'error') && (
        <div className="loader">
          <div><b style={{ fontSize: 17 }}>{t('nodata.title')}</b><p className="note" style={{ marginTop: 8 }}>{t('nodata.body')}</p></div>
          <button className="btn sm" onClick={fetchData}>{t('retry')}</button>
        </div>
      )}
      {load.state === 'ready' && (
        <main>
          <DemoBanner />
          {tab === 'dashboard' && <FreshnessBar data={load.data} />}
          {parts[0] === 'genres' && parts[1] ? <GenreDetail data={load.data} id={parts[1]} go={go} />
            : parts[0] === 'artist' && parts[1] ? <ArtistDetail data={load.data} id={parts[1]} go={go} />
            : tab === 'genres' ? <Genres data={load.data} go={go} />
            : tab === 'djs' ? <Djs data={load.data} go={go} />
            : tab === 'tracks' ? <Tracks data={load.data} />
            : tab === 'analytics' ? <Analytics data={load.data} tab={aTab} setTab={(x) => go(`analytics/${x}`)} go={go} />
            : <Dashboard data={load.data} go={go} />}
        </main>
      )}
      <BottomNav active={tab} onGo={goTab} />
    </div>
  );
}
