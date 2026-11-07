import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { buildMessage, dueToday, parseCommand, sanitizePrefs, validateInitData } from '../src/lib.js';

const TOKEN = '123456:TEST-TOKEN';

// Подписываем initData тем же алгоритмом, что и Telegram (эталонная реализация на node:crypto).
function sign(fields, token = TOKEN) {
  const check = Object.entries(fields).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => `${k}=${v}`).join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(token).digest();
  const hash = createHmac('sha256', secret).update(check).digest('hex');
  return new URLSearchParams({ ...fields, hash }).toString();
}
const NOW = 1_800_000_000_000;
const base = () => ({ auth_date: String(NOW / 1000 - 60), query_id: 'AAH', user: JSON.stringify({ id: 42, first_name: 'Ann' }) });

test('валидная подпись принимается', async () => {
  const r = await validateInitData(sign(base()), TOKEN, { now: NOW });
  assert.equal(r.ok, true);
  assert.equal(r.user.id, 42);
});

test('поддельная подпись отклоняется', async () => {
  const r = await validateInitData(sign(base(), 'other:TOKEN'), TOKEN, { now: NOW });
  assert.deepEqual([r.ok, r.reason], [false, 'bad-signature']);
});

test('подмена user после подписи отклоняется', async () => {
  const p = new URLSearchParams(sign(base()));
  p.set('user', JSON.stringify({ id: 999 }));
  const r = await validateInitData(p.toString(), TOKEN, { now: NOW });
  assert.equal(r.ok, false);
});

test('просроченные данные отклоняются', async () => {
  const f = { ...base(), auth_date: String(NOW / 1000 - 3 * 86400) };
  const r = await validateInitData(sign(f), TOKEN, { now: NOW });
  assert.equal(r.reason, 'expired');
});

test('пустые данные и отсутствие hash', async () => {
  assert.equal((await validateInitData('', TOKEN)).ok, false);
  assert.equal((await validateInitData('a=1', TOKEN)).reason, 'no-hash');
});

test('sanitizePrefs оставляет только допустимые значения', () => {
  const p = sanitizePrefs({ lang: 'xx', digest: { freq: 'hourly', sections: ['trend', '<script>', 'rising'] } });
  assert.deepEqual(p, { freq: 'off', sections: ['trend', 'rising'], lang: 'ru' });
  assert.equal(sanitizePrefs({ digest: { freq: 'daily' } }).sections.length, 6);
});

test('расписание: weekly только по понедельникам', () => {
  assert.equal(dueToday('daily', new Date('2026-11-04T06:00:00Z')), true);
  assert.equal(dueToday('weekly', new Date('2026-11-09T06:00:00Z')), true); // понедельник
  assert.equal(dueToday('weekly', new Date('2026-11-10T06:00:00Z')), false);
  assert.equal(dueToday('off', new Date('2026-11-09T06:00:00Z')), false);
});

const digest = (over = {}) => ({
  generated_at: new Date(NOW - 3600000).toISOString(), order: ['trend', 'genres', 'rising'],
  sections: { trend: '🔥 <b>Тренд</b>', genres: '📈 Жанры', rising: '🚀 DJs' }, footer: 'Данные на 2026-11-07 · статус: ok', ...over,
});

test('дайджест учитывает выбранные разделы', () => {
  const t = buildMessage(digest(), ['trend', 'rising'], { now: NOW });
  assert.ok(t.includes('Тренд') && t.includes('DJs') && !t.includes('Жанры'));
  assert.equal(buildMessage(digest(), [], { now: NOW }), null);
  assert.equal(buildMessage(null, ['trend']), null);
});

test('устаревшие данные помечаются в дайджесте', () => {
  const t = buildMessage(digest({ generated_at: new Date(NOW - 80 * 3600000).toISOString() }), ['trend'], { now: NOW });
  assert.ok(t.includes('Данные устарели'));
});

test('длинный дайджест обрезается до лимита Telegram', () => {
  const t = buildMessage(digest({ sections: { trend: 'x'.repeat(6000), genres: '', rising: '' } }), ['trend'], { now: NOW });
  assert.ok(t.length <= 4000);
});

test('разбор команд', () => {
  assert.deepEqual(parseCommand('/subscribe Daily'), { cmd: 'subscribe', arg: 'daily' });
  assert.deepEqual(parseCommand('/start@dj_pulse_bot'), { cmd: 'start', arg: '' });
  assert.equal(parseCommand('привет'), null);
});
