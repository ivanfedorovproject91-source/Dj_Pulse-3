import { useMemo, useRef } from 'react';
import { Bar } from 'react-chartjs-2';
import type { Chart, Plugin } from 'chart.js';
import './setup';
import { tooltipStyle } from './setup';
import { DOWN, GRID, INK, SERIES, TICK, UP } from './palette';

export interface BarItem {
  id: string;
  label: string;
  value: number | null;
  color?: string;
}

interface Props {
  items: BarItem[];
  fmt: (v: number) => string;
  /** Окрашивает по знаку: рост — зелёный, спад — розовый (знак всегда виден и в подписи). */
  signed?: boolean;
  onSelect?: (id: string) => void;
}

/** Форматтер передаётся через ref: функции в options Chart.js трактует как «скриптовые» и вызывает со своим контекстом. */
function makeValueLabels(fmtRef: { current: (v: number) => string }): Plugin<'bar'> {
  return {
    id: 'valueLabels',
    afterDatasetsDraw(chart: Chart<'bar'>) {
      const { ctx } = chart;
      const meta = chart.getDatasetMeta(0);
      ctx.save();
      ctx.font = "700 11px 'Manrope', sans-serif";
      ctx.fillStyle = INK;
      ctx.textBaseline = 'middle';
      meta.data.forEach((el, i) => {
        const v = chart.data.datasets[0].data[i] as number | null;
        if (v == null) return;
        const neg = v < 0;
        ctx.textAlign = neg ? 'right' : 'left';
        ctx.fillText(fmtRef.current(v), el.x + (neg ? -6 : 6), el.y);
      });
      ctx.restore();
    },
  };
}

export default function BarChart({ items, fmt, signed, onSelect }: Props) {
  const fmtRef = useRef(fmt);
  fmtRef.current = fmt;
  const plugin = useMemo(() => makeValueLabels(fmtRef), []);
  const rows = items.filter((i) => i.value != null);
  const colors = rows.map((r, i) => r.color ?? (signed ? ((r.value as number) >= 0 ? UP : DOWN) : SERIES[i % SERIES.length]));
  const max = Math.max(1e-9, ...rows.map((r) => Math.abs(r.value as number)));
  const hasNeg = rows.some((r) => (r.value as number) < 0);
  const options = {
    indexAxis: 'y' as const,
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 300 },
    layout: { padding: { right: 56, left: 0 } },
    onClick: (_e: unknown, els: { index: number }[]) => { if (els[0] && onSelect) onSelect(rows[els[0].index].id); },
    plugins: {
      legend: { display: false },
      tooltip: { ...tooltipStyle, callbacks: { label: (c: { parsed: { x: number | null } }) => (c.parsed.x == null ? '—' : fmt(c.parsed.x)) } },
    },
    scales: {
      x: { display: false, min: hasNeg ? -max * 1.15 : 0, max: max * 1.15, grid: { color: GRID } },
      y: { grid: { display: false }, border: { color: GRID }, ticks: { color: INK, font: { size: 12 } } },
    },
  };
  return (
    <div style={{ height: rows.length * 32 + 12 }} role="img" aria-label={rows.map((r) => `${r.label}: ${fmt(r.value as number)}`).join('; ')}>
      <Bar
        data={{ labels: rows.map((r) => r.label), datasets: [{ data: rows.map((r) => r.value), backgroundColor: colors, borderRadius: 4, borderSkipped: false, barThickness: 16, borderColor: 'transparent' }] }}
        options={options as never}
        plugins={[plugin]}
      />
    </div>
  );
}

export { TICK };
