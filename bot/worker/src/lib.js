// Чистая логика бота (без сети и KV) — покрыта тестами в test/lib.test.js.

const enc = new TextEncoder();

async function hmac(keyBytes, data) {
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, typeof data === 'string' ? enc.encode(data) : data));
}

const toHex = (u8) => [...u8].map((b) => b.toString(16).padStart(2, '0')).join('');

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

/**
 * Проверка Telegram WebApp initData по официальному алгоритму:
 * secret = HMAC_SHA256("WebAppData", bot_token); hash = HMAC_SHA256(secret, data_check_string).
 * Возвращает {ok, user, reason}. Данным, не прошедшим проверку подписи, верить нельзя.
 */
export async function validateInitData(initData, botToken, { maxAgeSec = 86400, now = Date.now() } = {}) {
  if (!initData || !botToken) return { ok: false, reason: 'empty' };
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return { ok: false, reason: 'no-hash' };
  params.delete('hash');
  const check = [...params.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => `${k}=${v}`).join('\n');
  const secret = await hmac(enc.encode('WebAppData'), botToken);
  const calc = toHex(await hmac(secret, check));
  if (!safeEqual(calc, hash.toLowerCase())) return { ok: false, reason: 'bad-signature' };
  const authDate = Number(params.get('auth_date'));
  if (!authDate || now / 1000 - authDate > maxAgeSec) return { ok: false, reason: 'expired' };
  let user;
  try { user = JSON.parse(params.get('user') || ''); } catch { return { ok: false, reason: 'no-user' }; }
  if (!user || typeof user.id !== 'number') return { ok: false, reason: 'no-user' };
  return { ok: true, user };
}

export const SECTION_IDS = ['trend', 'genres', 'rising', 'russia', 'tracks', 'insights'];

/** Приводит присланные настройки к безопасному виду (белый список значений). */
export function sanitizePrefs(input) {
  const d = (input && input.digest) || {};
  const freq = ['off', 'daily', 'weekly'].includes(d.freq) ? d.freq : 'off';
  const sections = Array.isArray(d.sections) ? SECTION_IDS.filter((s) => d.sections.includes(s)) : [...SECTION_IDS];
  const lang = input && input.lang === 'en' ? 'en' : 'ru';
  return { freq, sections, lang };
}

/** Отправляем ли сегодня: daily — каждый день, weekly — по понедельникам (UTC). */
export function dueToday(freq, date = new Date()) {
  if (freq === 'daily') return true;
  if (freq === 'weekly') return date.getUTCDay() === 1;
  return false;
}

const MAX = 4000;

/** Собирает текст дайджеста из digest.json (формирует backend; динамические значения там уже экранированы). */
export function buildMessage(digest, sections, { now = Date.now() } = {}) {
  if (!digest || !digest.sections) return null;
  const parts = (digest.order || [])
    .filter((k) => sections.includes(k) && digest.sections[k])
    .map((k) => digest.sections[k]);
  if (!parts.length) return null;
  const ageH = (now - new Date(digest.generated_at).getTime()) / 3600000;
  const stale = Number.isFinite(ageH) && ageH > 48 ? '\n⚠️ <b>Данные устарели</b>: сбор не обновлялся более 2 суток.' : '';
  let text = `🎛 <b>DJ PULSE · дайджест</b>\n\n${parts.join('\n\n')}\n\n<i>${digest.footer}</i>${stale}`;
  if (text.length > MAX) text = text.slice(0, MAX - 1).replace(/<[^>]*$/, '') + '…';
  return text;
}

export function welcomeText() {
  return (
    '🎛 <b>DJ PULSE</b> — аналитика электронной музыки.\n\n' +
    'Жанры, диджеи, треки и тренды с графиками — в приложении. Нажмите кнопку ниже.\n\n' +
    'Дайджест в чат: /subscribe daily или /subscribe weekly. Отключить: /unsubscribe.'
  );
}

export function parseCommand(text) {
  const m = /^\/(\w+)(?:@\w+)?(?:\s+(.*))?$/.exec((text || '').trim());
  return m ? { cmd: m[1].toLowerCase(), arg: (m[2] || '').trim().toLowerCase() } : null;
}
