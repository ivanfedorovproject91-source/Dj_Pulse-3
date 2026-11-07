// Тонкая обёртка над Telegram WebApp SDK. Вне Telegram (браузер, разработка) все вызовы безопасно ничего не делают.

type TgWebApp = {
  initData: string;
  initDataUnsafe?: { user?: { id: number; first_name?: string; language_code?: string } };
  platform?: string;
  version?: string;
  ready(): void;
  expand(): void;
  close(): void;
  setHeaderColor?(c: string): void;
  setBackgroundColor?(c: string): void;
  setBottomBarColor?(c: string): void;
  disableVerticalSwipes?(): void;
  openLink(url: string, opts?: { try_instant_view?: boolean }): void;
  isVersionAtLeast?(v: string): boolean;
  onEvent?(e: string, cb: () => void): void;
  HapticFeedback?: { impactOccurred(s: string): void; notificationOccurred(t: string): void; selectionChanged(): void };
  BackButton?: { show(): void; hide(): void; onClick(cb: () => void): void; offClick(cb: () => void): void };
  MainButton?: {
    setParams(p: { text?: string; is_visible?: boolean; is_active?: boolean; color?: string; text_color?: string }): void;
    show(): void; hide(): void; showProgress(leave?: boolean): void; hideProgress(): void;
    onClick(cb: () => void): void; offClick(cb: () => void): void;
  };
};

declare global {
  interface Window {
    Telegram?: { WebApp?: TgWebApp };
  }
}

export const BG = '#0e1011';

export function tg(): TgWebApp | undefined {
  return typeof window !== 'undefined' ? window.Telegram?.WebApp : undefined;
}

/** true только внутри настоящего Telegram (есть подписанные initData). */
export function inTelegram(): boolean {
  return !!tg()?.initData;
}

export function initTelegram(): void {
  const w = tg();
  if (!w) return;
  try {
    w.ready();
    w.expand();
    w.disableVerticalSwipes?.(); // чтобы свайп по графикам не закрывал приложение
    w.setHeaderColor?.(BG);
    w.setBackgroundColor?.(BG);
    w.setBottomBarColor?.(BG);
    const apply = () => {
      document.documentElement.dataset.platform = w.platform ?? 'web';
    };
    apply();
  } catch {
    /* старые клиенты Telegram */
  }
}

export function haptic(kind: 'select' | 'light' | 'success' = 'select'): void {
  try {
    const h = tg()?.HapticFeedback;
    if (!h) return;
    if (kind === 'select') h.selectionChanged();
    else if (kind === 'light') h.impactOccurred('light');
    else h.notificationOccurred('success');
  } catch { /* ignore */ }
}

export function openLink(url: string): void {
  if (!/^https?:\/\//i.test(url)) return;
  const w = tg();
  if (w) w.openLink(url);
  else window.open(url, '_blank', 'noopener,noreferrer');
}

export function telegramLang(): string | undefined {
  return tg()?.initDataUnsafe?.user?.language_code; // только подсказка для языка интерфейса
}

export function getInitData(): string {
  return tg()?.initData ?? '';
}
