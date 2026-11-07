import { useMemo, useRef, useState } from 'react';
import { Line } from 'react-chartjs-2';
import type { Chart, Plugin } from 'chart.js';
import './setup';
import { tooltipStyle } from './setup';
import { GRID, TICK } from '../charts/palette';
import { useI18n } from '../services/i18n';
import { daysBetween, fmtDay, fmtDayYear, fmtNum, fmtPct } from '../services/format';
import { haptic } from '../services/telegram';
import type { Point } from '../types';

export interface Series {
  id: string;
  label: string;
  color: string;
  points: Point[];
}

type Period = 7 | 30 | 90 | 365;
type Mode = 'abs' | 'pct';

interface Props {
  series: Series[];
  periods?: Period[];
  defaultPeriod?: Period;
  defaultMode?: Mode;
  allowMode?: boolean;
  allowSmooth?: boolean;
  smoothDefault?: boolean;
  small?: boolean;
  fmt?: (v: number) => string;
}

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Скользящее среднее по 7 последним точкам; на коротких/редких рядах не применяется. */
function smooth(points: Point[]): Point[] {
  if (points.length < 14) return points;
  return points.map(([d], i) => {
    const w = points.slice(Math.max(0, i - 6), i + 1);
    return [d, w.reduce((s, p) => s + p[1], 0) / w.length] as Point;
  });
}

function nearestBefore(map: Map<string, number>, date: string, tolerance: number): number | null {
  for (let k = 0; k <= tolerance; k++) {
    const v = map.get(addDays(date, -k));
    if (v !== undefined) return v;
  }
  return null;
}

export default function LineChart({
  series, periods = [7, 30, 90, 365], defaultPeriod = 90, defaultMode = 'abs', allowMode = true,
  allowSmooth = true, smoothDefault = true, small, fmt,
}: Props) {
  const { t, lang } = useI18n();
  const [period, setPeriod] = useState<Period>(periods.includes(defaultPeriod) ? defaultPeriod : periods[periods.length - 1]);
  const [mode, setMode] = useState<Mode>(defaultMode);
  const [smoothOn, setSmoothOn] = useState(smoothDefault);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [sel, setSel] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const selRef = useRef<number | null>(null);
  selRef.current = sel;
  const f = fmt ?? ((v: number) => fmtNum(v, lang));

  const model = useMemo(() => {
    const processed = series.map((s) => {
      const sorted = [...s.points].sort((a, b) => (a[0] < b[0] ? -1 : 1));
      return { ...s, pts: smoothOn && allowSmooth ? smooth(sorted) : sorted };
    });
    const ends = processed.map((s) => s.pts[s.pts.length - 1]?.[0]).filter(Boolean) as string[];
    if (!ends.length) return null;
    const end = [...ends].sort()[ends.length - 1];
    const start = addDays(end, -(period - 1));
    const visible = processed.filter((s) => !hidden.has(s.id));
    const dateSet = new Set<string>();
    for (const s of visible) for (const [d] of s.pts) if (d >= start && d <= end) dateSet.add(d);
    const labels = [...dateSet].sort();
    const maps = new Map(processed.map((s) => [s.id, new Map(s.pts)]));
    const bases = new Map<string, number | null>();
    for (const s of processed) {
      const first = s.pts.find(([d]) => d >= start);
      bases.set(s.id, first && first[1] > 0 ? first[1] : null);
    }
    const valueOf = (id: string, d: string): number | null => {
      const v = maps.get(id)?.get(d);
      if (v === undefined) return null;
      if (mode === 'abs') return v;
      const b = bases.get(id);
      return b ? (v / b - 1) * 100 : null;
    };
    const firstDate = labels[0];
    const covered = firstDate ? daysBetween(firstDate, end) + 1 : 0;
    const pointCount = Math.max(0, ...visible.map((s) => s.pts.filter(([d]) => d >= start && d <= end).length));
    return { processed, visible, labels, maps, bases, valueOf, covered, end, start, pointCount };
  }, [series, period, mode, smoothOn, allowSmooth, hidden]);

  const selPlugin = useMemo<Plugin<'line'>>(() => ({
    id: 'selLine',
    afterDatasetsDraw(chart: Chart) {
      const i = selRef.current;
      if (i == null) return;
      const meta = chart.getDatasetMeta(0);
      const el = meta?.data[i];
      if (!el) return;
      const { ctx, chartArea } = chart;
      ctx.save();
      ctx.strokeStyle = 'rgba(236,238,233,0.45)';
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(el.x, chartArea.top);
      ctx.lineTo(el.x, chartArea.bottom);
      ctx.stroke();
      ctx.restore();
    },
  }), []);

  if (!model) {
    return <div className="empty">{t('chart.empty')}</div>;
  }
  const { visible, labels, valueOf, covered, maps, bases } = model;
  const dense = labels.length <= 40;
  const pctFmt = (v: number) => fmtPct(v, 1);
  const axisFmt = (v: number) => (mode === 'pct' ? `${v > 0 ? '+' : ''}${Math.round(v)}%` : fmtNum(v, lang));

  const data = {
    labels,
    datasets: visible.map((s) => ({
      label: s.label,
      data: labels.map((d) => valueOf(s.id, d)),
      borderColor: s.color,
      backgroundColor: s.color,
      borderWidth: 2,
      pointRadius: dense ? 3 : 0,
      pointHoverRadius: 5,
      pointBackgroundColor: s.color,
      pointBorderColor: '#151819',
      pointBorderWidth: 1.5,
      tension: 0.22,
      spanGaps: true,
    })),
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 300 },
    interaction: { mode: 'index' as const, intersect: false },
    onClick: (evt: { native: Event | null }, _els: unknown, chart: Chart) => {
      if (!evt.native) return;
      const els = chart.getElementsAtEventForMode(evt.native, 'index', { intersect: false }, true);
      if (els[0]) { setSel(els[0].index); haptic('select'); }
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        ...tooltipStyle,
        callbacks: {
          title: (items: { label: string }[]) => (items[0] ? fmtDayYear(items[0].label, lang) : ''),
          label: (c: { dataset: { label?: string }; parsed: { y: number | null } }) =>
            `${c.dataset.label ?? ''}: ${c.parsed.y == null ? '—' : mode === 'pct' ? pctFmt(c.parsed.y) : f(c.parsed.y)}`,
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        border: { color: GRID },
        ticks: { color: TICK, maxTicksLimit: 5, maxRotation: 0, callback(this: unknown, _v: unknown, i: number) { return fmtDay(labels[i], lang); } },
      },
      y: {
        grid: { color: GRID },
        border: { display: false },
        ticks: { color: TICK, maxTicksLimit: 5, callback: (v: number | string) => axisFmt(Number(v)) },
      },
    },
  };

  const selDate = sel != null ? labels[sel] : null;
  const detailRows = selDate
    ? visible.map((s) => {
        const m = maps.get(s.id)!;
        const v = m.get(selDate) ?? null;
        const base = bases.get(s.id) ?? null;
        const prev7 = nearestBefore(m, addDays(selDate, -7), 2);
        return {
          s, v,
          vsStart: v != null && base ? (v / base - 1) * 100 : null,
          vs7: v != null && prev7 ? (v / prev7 - 1) * 100 : null,
        };
      })
    : [];

  const tableRows = [...labels].reverse().slice(0, 60);

  return (
    <div>
      <div className="chart-tools">
        <div className="seg" role="tablist">
          {periods.map((p) => (
            <button key={p} className={p === period ? 'on' : ''} onClick={() => { setPeriod(p); setSel(null); haptic(); }}>
              {t(`chart.period.${p}` as 'chart.period.7')}
            </button>
          ))}
        </div>
        <div className="tool-row">
          {allowMode && (
            <div className="seg" style={{ flex: 'none' }}>
              {(['abs', 'pct'] as Mode[]).map((m) => (
                <button key={m} className={m === mode ? 'on' : ''} onClick={() => { setMode(m); haptic(); }}>
                  {t(m === 'abs' ? 'chart.mode.abs' : 'chart.mode.pct')}
                </button>
              ))}
            </div>
          )}
          {allowSmooth && (
            <button className={`toggle ${smoothOn ? 'on' : ''}`} onClick={() => setSmoothOn((x) => !x)} role="switch" aria-checked={smoothOn}>
              <i />{t('chart.smooth')}
            </button>
          )}
        </div>
      </div>

      {covered > 0 && covered < period * 0.85 && model.pointCount > 1 && (
        <div className="notice">{t('chart.short', { n: covered, m: period })}</div>
      )}

      {visible.length === 0 || model.pointCount === 0 ? (
        <div className="empty">{t('chart.empty')}</div>
      ) : model.pointCount === 1 ? (
        <div className="empty">{t('chart.single')}</div>
      ) : table ? (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>{t('chart.detail.date')}</th>{visible.map((s) => <th key={s.id}>{s.label}</th>)}</tr></thead>
            <tbody>
              {tableRows.map((d) => (
                <tr key={d}>
                  <td>{fmtDayYear(d, lang)}</td>
                  {visible.map((s) => {
                    const v = valueOf(s.id, d);
                    return <td key={s.id}>{v == null ? '—' : mode === 'pct' ? pctFmt(v) : f(v)}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className={`chart-box ${small ? 'sm' : ''}`} role="img" aria-label={visible.map((s) => s.label).join(', ')}>
          <Line data={data} options={options as never} plugins={[selPlugin]} />
        </div>
      )}

      <div className="legend" aria-label={t('chart.legend')}>
        {series.map((s) => (
          <button key={s.id} className={hidden.has(s.id) ? 'off' : ''} aria-pressed={!hidden.has(s.id)}
            onClick={() => { setHidden((h) => { const n = new Set(h); if (n.has(s.id)) n.delete(s.id); else n.add(s.id); return n; }); setSel(null); haptic(); }}>
            <span className="sw" style={{ background: s.color }} />{s.label}
          </button>
        ))}
      </div>

      {!table && selDate && (
        <div className="detail">
          <div className="d-head">{fmtDayYear(selDate, lang)}</div>
          {detailRows.map(({ s, v, vsStart, vs7 }) => (
            <div className="d-row" key={s.id}>
              <span className="sw" style={{ background: s.color }} />
              <span className="nm">{s.label}</span>
              <span className="v">{v == null ? '—' : f(v)}</span>
              <span className="x" title={t('chart.detail.vs7')}>{fmtPct(vs7, 1)}</span>
              <span className="x" title={t('chart.detail.vsStart')}>{fmtPct(vsStart, 1)}</span>
            </div>
          ))}
          <div className="note" style={{ marginTop: 6 }}>{t('chart.detail.vs7')} · {t('chart.detail.vsStart')}</div>
        </div>
      )}
      {!table && !selDate && model.pointCount > 1 && <div className="note" style={{ marginTop: 8 }}>{t('chart.hint')}</div>}

      <div className="tool-row" style={{ marginTop: 10 }}>
        <span />
        <button className="chip" style={{ padding: '5px 11px', fontSize: 12.5 }} onClick={() => setTable((x) => !x)}>
          {table ? t('chart.graph') : t('chart.table')}
        </button>
      </div>
    </div>
  );
}
