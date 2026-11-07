import { useEffect, type ReactNode } from 'react';
import { useI18n, type Key } from '../services/i18n';
import { fmtPct, flag, initials } from '../services/format';
import { haptic } from '../services/telegram';
import type { Status } from '../types';

export function Icon({ name, size = 22 }: { name: string; size?: number }) {
  const p: Record<string, ReactNode> = {
    dashboard: <><rect x="3" y="3" width="7.5" height="9" rx="2" /><rect x="13.5" y="3" width="7.5" height="5.5" rx="2" /><rect x="13.5" y="11.5" width="7.5" height="9.5" rx="2" /><rect x="3" y="15" width="7.5" height="6" rx="2" /></>,
    genres: <path d="M3 13h2.5l2-6 3 12 3-16 2.5 10H21" />,
    djs: <><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="2.6" /><path d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2" /></>,
    tracks: <><path d="M9 18V5l11-2v13" /><circle cx="6.5" cy="18" r="2.5" /><circle cx="17.5" cy="16" r="2.5" /></>,
    analytics: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></>,
    chevron: <path d="M9 5l7 7-7 7" />,
    back: <path d="M15 5l-7 7 7 7" />,
    star: <path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1.1 5.8L12 16.8 6.7 19.6l1.1-5.8L3.5 9.7l5.9-.8z" />,
    gear: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 00.3 1.9l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.9-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.9.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.9 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.9l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.9.3h0a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.9-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.9v0a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" /></>,
    play: <path d="M8 5.5v13l11-6.5z" fill="currentColor" />,
    stop: <rect x="6.5" y="6.5" width="11" height="11" rx="2" fill="currentColor" />,
    ext: <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5" />,
    disc: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="2.5" /></>,
  };
  const filled = name === 'play' || name === 'stop';
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={filled ? 'none' : 'currentColor'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {p[name]}
    </svg>
  );
}

export function Delta({ v, digits = 0 }: { v: number | null | undefined; digits?: number }) {
  if (v == null) return <span className="delta na" title="—">—</span>;
  const cls = v > 0.05 ? 'up' : v < -0.05 ? 'down' : 'zero';
  return <span className={`delta ${cls}`}>{cls === 'up' ? '▲' : cls === 'down' ? '▼' : '•'} {fmtPct(Math.abs(v), digits).replace('+', '')}</span>;
}

export function StatusBadge({ status }: { status: Status }) {
  const { t } = useI18n();
  const sym: Record<Status, string> = { rising: '▲', declining: '▼', emerging: '✦', stable: '●', insufficient: '○' };
  return <span className={`badge ${status}`} title={status === 'insufficient' ? t('status.insufficient.hint') : undefined}>{sym[status]} {t(`status.${status}` as Key)}</span>;
}

export function SourceTags({ sources }: { sources: string[] }) {
  return <>{sources.map((s) => <span className="src-tag" key={s}>{s}</span>)}</>;
}

export function Seg<T extends string>({ value, options, onChange }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="seg" role="tablist">
      {options.map((o) => (
        <button key={o.id} role="tab" aria-selected={o.id === value} className={o.id === value ? 'on' : ''} onClick={() => { onChange(o.id); haptic(); }}>{o.label}</button>
      ))}
    </div>
  );
}

export function Toggle({ on, onChange, children }: { on: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <button className="check-row" role="switch" aria-checked={on} onClick={() => { onChange(!on); haptic(); }}>
      <span>{children}</span>
      <span className={`toggle ${on ? 'on' : ''}`}><i /></span>
    </button>
  );
}

export function SecHead({ title, note, action }: { title: string; note?: string; action?: { label: string; onClick: () => void } }) {
  return (
    <div className="sec-head">
      <h2>{title}</h2>
      {note && <small>{note}</small>}
      {action && <button onClick={action.onClick}>{action.label}</button>}
    </div>
  );
}

export function Empty({ title, children }: { title?: string; children?: ReactNode }) {
  return <div className="empty">{title && <b>{title}</b>}{children}</div>;
}

export function Avatar({ name, photo }: { name: string; photo?: string | null }) {
  return <span className="avatar">{photo ? <img src={photo} alt="" loading="lazy" referrerPolicy="no-referrer" /> : initials(name)}</span>;
}

export function FavStar({ on, onClick }: { on: boolean; onClick: () => void }) {
  const { t } = useI18n();
  return (
    <button className={`star ${on ? 'on' : ''}`} aria-pressed={on} aria-label={on ? t('fav.remove') : t('fav.add')}
      onClick={(e) => { e.stopPropagation(); onClick(); haptic('light'); }}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill={on ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"><path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1.1 5.8L12 16.8 6.7 19.6l1.1-5.8L3.5 9.7l5.9-.8z" /></svg>
    </button>
  );
}

export function CountryTag({ code }: { code: string | null }) {
  return <>{flag(code)} {code ?? '—'}</>;
}

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="grab" />
        <h3>{title}</h3>
        {children}
      </div>
    </div>
  );
}
