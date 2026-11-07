// Cloudflare Worker: вебхук бота + API настроек Mini App + рассылка дайджеста по расписанию.
// Бесплатный тариф Workers (100 000 запросов/сутки) и KV достаточен для небольшой аудитории.
import { buildMessage, dueToday, parseCommand, sanitizePrefs, validateInitData, welcomeText } from './lib.js';

const TG = (token, method) => `https://api.telegram.org/bot${token}/${method}`;

async function tg(env, method, body) {
  const res = await fetch(TG(env.BOT_TOKEN, method), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  return { ok: !!json.ok, status: res.status, json };
}

const appUrl = (env) => env.APP_URL.replace(/\/$/, '');
const openButton = (env) => ({ inline_keyboard: [[{ text: 'ОТКРЫТЬ DJ PULSE', web_app: { url: appUrl(env) + '/' } }]] });

function cors(env, req) {
  const origin = new URL(appUrl(env)).origin;
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
    ...(req.headers.get('Origin') && req.headers.get('Origin') !== origin ? { 'X-Origin-Mismatch': '1' } : {}),
  };
}

const json = (obj, status = 200, extra = {}) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', ...extra } });

async function getDigest(env) {
  try {
    const res = await fetch(`${appUrl(env)}/data/digest.json`, { cf: { cacheTtl: 300 } });
    return res.ok ? await res.json() : null;
  } catch { return null; }
}

async function getSub(env, id) {
  const raw = await env.SUBS.get(`u:${id}`);
  return raw ? JSON.parse(raw) : null;
}
const putSub = (env, id, sub) => env.SUBS.put(`u:${id}`, JSON.stringify({ ...sub, updated: new Date().toISOString() }));

async function sendDigest(env, chatId, sections) {
  const digest = await getDigest(env);
  const text = buildMessage(digest, sections);
  if (!text) return { ok: false, status: 0, json: {} };
  return tg(env, 'sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: openButton(env) });
}

async function handleUpdate(env, update) {
  const msg = update.message;
  if (!msg || !msg.text || msg.chat.type !== 'private') return;
  const chatId = msg.chat.id;
  const c = parseCommand(msg.text);
  if (!c) return;
  if (c.cmd === 'start' || c.cmd === 'help') {
    await tg(env, 'sendMessage', { chat_id: chatId, text: welcomeText(), parse_mode: 'HTML', reply_markup: openButton(env) });
  } else if (c.cmd === 'subscribe') {
    const freq = c.arg === 'daily' ? 'daily' : 'weekly';
    const cur = (await getSub(env, chatId)) || sanitizePrefs({});
    await putSub(env, chatId, { ...cur, freq });
    await tg(env, 'sendMessage', { chat_id: chatId, text: freq === 'daily' ? '✅ Дайджест будет приходить каждый день.' : '✅ Дайджест будет приходить раз в неделю (по понедельникам).' });
  } else if (c.cmd === 'unsubscribe') {
    await env.SUBS.delete(`u:${chatId}`);
    await tg(env, 'sendMessage', { chat_id: chatId, text: 'Дайджест отключён. Включить снова: /subscribe' });
  } else if (c.cmd === 'digest') {
    const sub = (await getSub(env, chatId)) || sanitizePrefs({});
    const r = await sendDigest(env, chatId, sub.sections);
    if (!r.ok) await tg(env, 'sendMessage', { chat_id: chatId, text: 'Дайджест пока недоступен: данные ещё не опубликованы.' });
  }
}

async function runDigestJob(env) {
  let cursor, sent = 0, removed = 0;
  do {
    const page = await env.SUBS.list({ prefix: 'u:', cursor });
    for (const k of page.keys) {
      const sub = JSON.parse((await env.SUBS.get(k.name)) || 'null');
      if (!sub || !dueToday(sub.freq)) continue;
      const r = await sendDigest(env, k.name.slice(2), sub.sections);
      if (r.ok) sent++;
      else if (r.status === 403 || r.status === 400) { await env.SUBS.delete(k.name); removed++; } // бот заблокирован / чат недоступен
      if (sent % 25 === 0) await new Promise((res) => setTimeout(res, 1000)); // лимиты Telegram
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return { sent, removed };
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);

    if (url.pathname === '/health') return json({ ok: true });

    // Разовая настройка: вебхук, меню, команды. Защищена секретом.
    if (url.pathname === `/setup/${env.WEBHOOK_SECRET}`) {
      const hook = await tg(env, 'setWebhook', { url: `${url.origin}/webhook/${env.WEBHOOK_SECRET}`, allowed_updates: ['message'], drop_pending_updates: true });
      const menu = await tg(env, 'setChatMenuButton', { menu_button: { type: 'web_app', text: 'DJ PULSE', web_app: { url: appUrl(env) + '/' } } });
      const cmds = await tg(env, 'setMyCommands', { commands: [
        { command: 'start', description: 'Открыть DJ PULSE' }, { command: 'digest', description: 'Получить дайджест сейчас' },
        { command: 'subscribe', description: 'Подписка: daily или weekly' }, { command: 'unsubscribe', description: 'Отключить дайджест' } ] });
      return json({ webhook: hook.ok, menu: menu.ok, commands: cmds.ok });
    }

    if (url.pathname === `/webhook/${env.WEBHOOK_SECRET}` && req.method === 'POST') {
      // Дополнительная защита: Telegram присылает секретный заголовок, если он задан при setWebhook.
      await handleUpdate(env, await req.json().catch(() => ({})));
      return json({ ok: true });
    }

    if (url.pathname === '/api/prefs') {
      const h = cors(env, req);
      if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
      if (req.method !== 'POST') return json({ error: 'method' }, 405, h);
      const auth = req.headers.get('Authorization') || '';
      const v = await validateInitData(auth.startsWith('tma ') ? auth.slice(4) : '', env.BOT_TOKEN);
      if (!v.ok) return json({ error: 'unauthorized', reason: v.reason }, 401, h);
      const prefs = sanitizePrefs(await req.json().catch(() => ({})));
      if (prefs.freq === 'off') await env.SUBS.delete(`u:${v.user.id}`);
      else await putSub(env, v.user.id, prefs);
      return json({ ok: true, prefs }, 200, h);
    }

    return json({ error: 'not found' }, 404);
  },

  // Cron Trigger (wrangler.toml): ежедневная рассылка тем, кому она сегодня положена.
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(runDigestJob(env));
  },
};
