import { getInitData } from './telegram';
import type { Prefs } from './prefs';

const API = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? '';

export type SyncResult = 'ok' | 'no-api' | 'no-telegram' | 'error' | 'unauthorized';

/**
 * Сохраняет настройки дайджеста на Worker. Worker проверяет подпись initData по токену бота
 * (HMAC-SHA256) — без подтверждённой подписи данные пользователя не принимаются.
 */
export async function saveDigestPrefs(prefs: Prefs): Promise<SyncResult> {
  if (!API) return 'no-api';
  const initData = getInitData();
  if (!initData) return 'no-telegram';
  try {
    const res = await fetch(`${API}/api/prefs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `tma ${initData}` },
      body: JSON.stringify({ digest: prefs.digest, lang: prefs.lang }),
    });
    if (res.status === 401) return 'unauthorized';
    return res.ok ? 'ok' : 'error';
  } catch {
    return 'error';
  }
}

export const apiConfigured = Boolean(API);
