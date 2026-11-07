import { Doughnut } from 'react-chartjs-2';
import './setup';
import { tooltipStyle } from './setup';
import { OTHER, SERIES, SURFACE } from './palette';

export interface Slice {
  id: string;
  label: string;
  value: number;
  isOther?: boolean;
}

export default function Donut({ slices, unit = '%' }: { slices: Slice[]; unit?: string }) {
  const total = slices.reduce((s, x) => s + x.value, 0) || 1;
  const colors = slices.map((s, i) => (s.isOther ? OTHER : SERIES[i % SERIES.length]));
  return (
    <div className="donut-wrap">
      <div className="chart-box" role="img" aria-label={slices.map((s) => `${s.label} ${((s.value / total) * 100).toFixed(0)}%`).join(', ')}>
        <Doughnut
          data={{ labels: slices.map((s) => s.label), datasets: [{ data: slices.map((s) => s.value), backgroundColor: colors, borderColor: SURFACE, borderWidth: 3, hoverOffset: 4 }] }}
          options={{
            responsive: true, maintainAspectRatio: false, cutout: '66%', animation: { duration: 300 },
            plugins: { legend: { display: false }, tooltip: { ...tooltipStyle, callbacks: { label: (c) => `${c.label}: ${((Number(c.raw) / total) * 100).toFixed(1)}${unit}` } } },
          }}
        />
      </div>
      <div className="donut-legend">
        {slices.map((s, i) => (
          <div key={s.id}>
            <span className="sw" style={{ background: colors[i] }} />
            <span className="nm">{s.label}</span>
            <span className="v">{((s.value / total) * 100).toFixed(0)}{unit}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
