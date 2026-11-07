import { useMemo, useState } from 'react';
import { ArtistRow } from '../components/Rows';
import { Empty, Seg } from '../components/ui';
import { useI18n } from '../services/i18n';
import { flag } from '../services/format';
import { usePrefs } from '../services/prefs';
import type { AppData } from '../types';

type Tab = 'global' | 'rising' | 'russia';
type Sort = 'pop' | 'growth';

export default function Djs({ data, go }: { data: AppData; go: (p: string) => void }) {
  const { t, lang } = useI18n();
  const { prefs, toggleFav } = usePrefs();
  const [tab, setTab] = useState<Tab>('global');
  const [q, setQ] = useState('');
  const [genre, setGenre] = useState('');
  const [country, setCountry] = useState('');
  const [sort, setSort] = useState<Sort>('pop');

  const countries = useMemo(() => {
    const names = new Map(data.countries.map((c) => [c.code, lang === 'ru' ? c.name_ru : c.name_en]));
    const codes = [...new Set(data.artists.map((a) => a.country).filter(Boolean) as string[])];
    return codes.map((c) => ({ code: c, name: names.get(c) ?? c })).sort((a, b) => a.name.localeCompare(b.name));
  }, [data, lang]);

  const list = useMemo(() => {
    let arr = data.artists.filter((a) => {
      if (tab === 'rising' && !a.rising) return false;
      if (tab === 'russia' && a.country !== 'RU') return false;
      if (genre && !a.genres.includes(genre)) return false;
      if (country && tab !== 'russia' && a.country !== country) return false;
      if (q.trim() && !a.name.toLowerCase().includes(q.trim().toLowerCase())) return false;
      return true;
    });
    const effective: Sort = tab === 'rising' && sort === 'pop' ? 'growth' : sort;
    arr = [...arr].sort((a, b) => effective === 'growth'
      ? (b.growth_30d ?? -Infinity) - (a.growth_30d ?? -Infinity)
      : (b.popularity ?? -1) - (a.popularity ?? -1));
    return arr;
  }, [data.artists, tab, genre, country, q, sort]);

  return (
    <>
      <h1 className="page-title">{t('nav.djs')}</h1>
      <Seg<Tab>
        value={tab}
        onChange={(v) => { setTab(v); if (v === 'rising') setSort('growth'); else if (tab === 'rising') setSort('pop'); }}
        options={[{ id: 'global', label: t('djs.global') }, { id: 'rising', label: t('djs.rising') }, { id: 'russia', label: `${flag('RU')} ${t('djs.russia')}` }]}
      />
      <div className="filters">
        <input className="input full" type="search" placeholder={t('djs.search')} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('djs.search')} />
        <label>
          <span className="field-label">{t('djs.genre')}</span>
          <select className="select" value={genre} onChange={(e) => setGenre(e.target.value)}>
            <option value="">{t('all')}</option>
            {data.genres.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </label>
        <label>
          <span className="field-label">{t('djs.country')}</span>
          <select className="select" value={tab === 'russia' ? 'RU' : country} disabled={tab === 'russia'} onChange={(e) => setCountry(e.target.value)}>
            <option value="">{t('all')}</option>
            {countries.map((c) => <option key={c.code} value={c.code}>{flag(c.code)} {c.name}</option>)}
          </select>
        </label>
        <label className="full">
          <span className="field-label">{t('djs.sort')}</span>
          <select className="select" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
            <option value="pop">{t('djs.sort.pop')}</option>
            <option value="growth">{t('djs.sort.growth')}</option>
          </select>
        </label>
      </div>
      <p className="note" style={{ marginBottom: 12 }}>{t('djs.pop.hint')}</p>

      <div className="panel">
        {list.length ? list.slice(0, 80).map((a, i) => (
          <ArtistRow key={a.id} a={a} rank={i + 1} showReason={tab === 'rising'} onOpen={() => go(`artist/${a.id}`)}
            fav={prefs.favArtists.includes(a.id)} onFav={() => toggleFav('favArtists', a.id)} />
        )) : <Empty>{tab === 'rising' && !q && !genre && !country ? t('djs.none.rising') : t('djs.none')}</Empty>}
      </div>
    </>
  );
}
