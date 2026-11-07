import type { Point } from '../types';

/** Мини-график без интерактива. Меньше 3 точек — честный прочерк вместо линии. */
export default function Spark({ points, width = 64, height = 26, days = 30 }: { points: Point[]; width?: number; height?: number; days?: number }) {
  const pts = points.slice(-days);
  if (pts.length < 3) return <span className="delta na" style={{ width }}>—</span>;
  const vals = pts.map((p) => p[1]);
  const min = Math.min(...vals), max = Math.max(...vals);
  const span = max - min || 1;
  const xy = vals.map((v, i) => [(i / (vals.length - 1)) * (width - 2) + 1, height - 3 - ((v - min) / span) * (height - 6)]);
  const up = vals[vals.length - 1] >= vals[0];
  const color = up ? '#b7ff3c' : '#ff7396';
  return (
    <svg className="spark" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <polyline points={xy.map((p) => p.join(',')).join(' ')} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={xy[xy.length - 1][0]} cy={xy[xy.length - 1][1]} r="2.4" fill={color} />
    </svg>
  );
}
