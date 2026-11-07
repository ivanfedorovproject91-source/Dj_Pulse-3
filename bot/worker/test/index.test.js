import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import worker from '../src/index.js';

const TOKEN = '123456:TEST-TOKEN';

function kv() {
  const m = new Map();
  return {
    m,
    get: async (k) => m.get(k) ?? null,
    put: async (k, v) => void m.set(k, v),
    delete: async (k) => void m.delete(k),
    list: async ({ prefix }) => ({ keys: [...m.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })), list_complete: true }),
  };
}
const mkEnv = () => ({ BOT_TOKEN: TOKEN, WEBHOOK_SECRET: 'sek', APP_URL: 'https://u.github.io/dj-pulse', SUBS: kv() });

function initData(userId) {
  const f = { auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id: userId }) };
  const check = Object.entries(f).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => `${k}=${v}`).join('\n');
  const hash = createHmac('sha256', createHmac('sha256', 'WebAppData').update(TOKEN).digest()).update(check).digest('hex');
  return new URLSearchParams({ ...f, hash }).toString();
}

const DIGEST = { generated_at: new Date().toISOString(), order: ['trend'], sections: { trend: '🔥 <b>Тренд</b>' }, footer: 'ok' };

function mockFetch(sent) {
  globalThis.fetch = async (url, opts) => {
    const u = String(url);
    if (u.includes('/data/digest.json')) return new Response(JSON.stringify(DIGEST), { status: 200 });
    if (u.includes('api.telegram.org')) {
      sent.push({ method: u.split('/').pop(), body: JSON.parse(opts.body) });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
    return new Response('{}', { status: 404 });
  };
}

const post = (path, body, headers = {}) =>
  new Request(`https://w.example${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });

test('/api/prefs: без подписи — 401, подписанный запрос сохраняет подписку', async () => {
  const env = mkEnv();
  const bad = await worker.fetch(post('/api/prefs', { digest: { freq: 'daily' } }, { Authorization: 'tma fake=1&hash=00' }), env);
  assert.equal(bad.status, 401);
  assert.equal(env.SUBS.m.size, 0);

  const ok = await worker.fetch(post('/api/prefs', { digest: { freq: 'daily', sections: ['trend'] } }, { Authorization: `tma ${initData(77)}` }), env);
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get('Access-Control-Allow-Origin'), 'https://u.github.io');
  assert.equal(JSON.parse(env.SUBS.m.get('u:77')).freq, 'daily');

  await worker.fetch(post('/api/prefs', { digest: { freq: 'off' } }, { Authorization: `tma ${initData(77)}` }), env);
  assert.equal(env.SUBS.m.has('u:77'), false); // «выключен» = удалён
});

test('вебхук /start отправляет кнопку «ОТКРЫТЬ DJ PULSE» с web_app', async () => {
  const env = mkEnv(); const sent = []; mockFetch(sent);
  const res = await worker.fetch(post('/webhook/sek', { message: { text: '/start', chat: { id: 5, type: 'private' } } }), env);
  assert.equal(res.status, 200);
  const m = sent.find((s) => s.method === 'sendMessage');
  const btn = m.body.reply_markup.inline_keyboard[0][0];
  assert.equal(btn.text, 'ОТКРЫТЬ DJ PULSE');
  assert.equal(btn.web_app.url, 'https://u.github.io/dj-pulse/');
});

test('вебхук с неверным секретом не обрабатывается', async () => {
  const env = mkEnv(); const sent = []; mockFetch(sent);
  const res = await worker.fetch(post('/webhook/wrong', { message: { text: '/start', chat: { id: 5, type: 'private' } } }), env);
  assert.equal(res.status, 404);
  assert.equal(sent.length, 0);
});

test('/subscribe и /unsubscribe меняют хранилище', async () => {
  const env = mkEnv(); const sent = []; mockFetch(sent);
  await worker.fetch(post('/webhook/sek', { message: { text: '/subscribe daily', chat: { id: 9, type: 'private' } } }), env);
  assert.equal(JSON.parse(env.SUBS.m.get('u:9')).freq, 'daily');
  await worker.fetch(post('/webhook/sek', { message: { text: '/unsubscribe', chat: { id: 9, type: 'private' } } }), env);
  assert.equal(env.SUBS.m.has('u:9'), false);
});

test('cron рассылает только тем, кому сегодня положено, и чистит заблокировавших бота', async () => {
  const env = mkEnv(); const sent = [];
  mockFetch(sent);
  await env.SUBS.put('u:1', JSON.stringify({ freq: 'daily', sections: ['trend'] }));
  await env.SUBS.put('u:2', JSON.stringify({ freq: 'off', sections: ['trend'] }));
  await env.SUBS.put('u:3', JSON.stringify({ freq: 'daily', sections: ['trend'] }));
  const base = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    if (String(url).includes('sendMessage') && JSON.parse(opts.body).chat_id === '3') return new Response(JSON.stringify({ ok: false }), { status: 403 });
    return base(url, opts);
  };
  let job;
  await worker.scheduled({}, env, { waitUntil: (p) => { job = p; } });
  await job;
  const to = sent.filter((s) => s.method === 'sendMessage').map((s) => String(s.body.chat_id));
  assert.deepEqual(to, ['1']);
  assert.equal(env.SUBS.m.has('u:3'), false); // заблокировал бота — подписка удалена
  assert.equal(env.SUBS.m.has('u:2'), true);
});

test('/setup настраивает вебхук, кнопку меню и команды', async () => {
  const env = mkEnv(); const sent = []; mockFetch(sent);
  const res = await worker.fetch(new Request('https://w.example/setup/sek'), env);
  assert.deepEqual(await res.json(), { webhook: true, menu: true, commands: true });
  assert.ok(sent.some((s) => s.method === 'setChatMenuButton' && s.body.menu_button.type === 'web_app'));
});
