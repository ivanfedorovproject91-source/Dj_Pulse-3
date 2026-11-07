import { useCallback, useEffect, useState } from 'react';
import { tg } from '../services/telegram';

function parse(): string[] {
  return window.location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
}

export function useRoute() {
  const [parts, setParts] = useState<string[]>(parse);
  useEffect(() => {
    const on = () => { setParts(parse()); window.scrollTo({ top: 0 }); };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const go = useCallback((path: string) => { window.location.hash = `#/${path}`; }, []);
  const back = useCallback(() => {
    if (window.history.length > 1) window.history.back();
    else window.location.hash = '#/';
  }, []);
  return { parts, go, back };
}

/** Показывает кнопку «Назад» Telegram на вложенных экранах и ведёт её в историю. */
export function useBackButton(visible: boolean, onBack: () => void) {
  useEffect(() => {
    const b = tg()?.BackButton;
    if (!b) return;
    if (visible) { b.show(); b.onClick(onBack); }
    else b.hide();
    return () => { b.offClick(onBack); };
  }, [visible, onBack]);
}
