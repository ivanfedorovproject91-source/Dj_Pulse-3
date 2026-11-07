import { useCallback, useEffect, useRef, useState } from 'react';
import type { Track } from '../types';

/** Один общий плеер для 30-секундных превью (ссылки отдаёт сам Deezer). */
export function useAudio() {
  const ref = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);

  useEffect(() => () => { ref.current?.pause(); ref.current = null; }, []);

  const toggle = useCallback((t: Track) => {
    if (!t.preview) return;
    if (playing === t.id) { ref.current?.pause(); setPlaying(null); return; }
    ref.current?.pause();
    const a = new Audio(t.preview);
    a.onended = () => setPlaying(null);
    a.onerror = () => setPlaying(null);
    ref.current = a;
    a.play().then(() => setPlaying(t.id)).catch(() => setPlaying(null));
  }, [playing]);

  return { playing, toggle };
}
