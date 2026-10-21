// Contact / wholesale form handler (_server/contact-worker): validation, anti-spam, rate limits,
// Turnstile, fail-closed config, no data leaks. Fully local: Telegram and Turnstile are mocked, nothing leaves the machine.
import test from 'node:test';
import assert from 'node:assert/strict';
import { validate, normalizeTelegram, normalizeWhatsapp, LIMITS } from '../../_server/contact-worker/src/validate.js';
import { formatMessage, sendTelegram } from '../../_server/contact-worker/src/telegram.js';
import { verifyTurnstile } from '../../_server/contact-worker/src/turnstile.js';
import worker, { maxBody } from '../../_server/contact-worker/src/index.js';
const MAX_BODY = maxBody();

const base = { inquiry_type: 'contact', name: 'Anna', email: 'Anna@Example.com', contact_method: 'whatsapp',
  contact_value: '+66 81 234 5678', message: 'Hello, can we book a ceremony?', page_language: 'en', page_path: '/contact/',
  website: '', elapsed_ms: 9000, turnstile_token: 'tok-ok' };

/* ── test doubles: Cloudflare bindings and outbound HTTP ─────────────────── */
function limiter(max) { const n = new Map(); return { limit: async ({ key }) => { n.set(key, (n.get(key) || 0) + 1); return { success: n.get(key) <= max }; } }; }
function kv() { const m = new Map(); return { m, get: async (k) => (m.has(k) ? m.get(k) : null), put: async (k, v) => { m.set(k, v); } }; }
function makeEnv(over = {}) {
  return { TELEGRAM_BOT_TOKEN: 'BOT-SECRET-123', TELEGRAM_CHAT_ID: '42', TURNSTILE_SECRET: 'TS-SECRET', HASH_SALT: 'salt',
    RL_IP: limiter(5), RL_GLOBAL: limiter(30), FORM_KV: kv(), ...over };
}
// Turnstile answer can be customised per test; Telegram sends are counted, never performed
function mockNet(ts = {}) {
  const calls = { telegram: [], turnstile: 0 };
  globalThis.fetch = async (url, opts) => {
    url = String(url);
    if (url.includes('turnstile')) {
      calls.turnstile++;
      const token = opts.body.get('response');
      const ok = token === 'tok-ok';
      return new Response(JSON.stringify({ success: ok, hostname: 'teaphuket.com', action: ts.action || 'contact',
        challenge_ts: ts.challenge_ts || new Date().toISOString(), ...ts.extra }));
    }
    if (url.includes('api.telegram.org')) { calls.telegram.push(JSON.parse(opts.body)); return new Response(ts.tgStatus ? '{"ok":false}' : '{"ok":true}', { status: ts.tgStatus || 200 }); }
    throw new Error('unexpected network call ' + url);
  };
  return calls;
}
const realFetch = globalThis.fetch;
test.afterEach(() => { globalThis.fetch = realFetch; });

const req = (body, { origin = 'https://teaphuket.com', ip = '203.0.113.7', type = 'application/json', method = 'POST', raw } = {}) =>
  new Request('https://teaphuket.com/api/contact', { method, headers: { Origin: origin, 'Content-Type': type, 'CF-Connecting-IP': ip },
    body: method === 'POST' ? (raw ?? JSON.stringify(body)) : undefined });
const send = async (body, env, opts) => { const r = await worker.fetch(req(body, opts), env, {}); return { status: r.status, body: await r.json().catch(() => null), text: '' }; };

/* ── validation ───────────────────────────────────────────────────────────── */
test('valid enquiry is normalised; server time is used', () => {
  const r = validate(base, Date.UTC(2026, 9, 15, 11, 42));
  assert.equal(r.ok, true);
  assert.equal(r.data.email, 'anna@example.com');
  assert.equal(r.data.contact_value, '+66812345678');
  assert.equal(r.data.submitted_at, '2026-10-15T11:42:00.000Z');
});

test('required fields and formats', () => {
  const r = validate({ ...base, name: ' ', email: 'nope', message: '', contact_value: '123' });
  assert.deepEqual(r.errors, { name: 'required', email: 'email', message: 'required', contact_value: 'phone' });
  assert.equal(validate({ ...base, contact_value: '' }).ok, true, 'WhatsApp is optional');
  assert.equal(validate({ ...base, inquiry_type: 'wholesale', page_path: '/wholesale/' }).errors.company, 'required');
});

test('length limits are enforced (rejected, not silently cut)', () => {
  for (const [k, max] of Object.entries({ name: LIMITS.name, email: LIMITS.email, message: LIMITS.message })) {
    const v = k === 'email' ? 'a'.repeat(max) + '@x.io' : 'a'.repeat(max + 1);
    assert.equal(validate({ ...base, [k]: v }).errors[k], 'too_long', k);
  }
  assert.equal(validate({ ...base, message: 'a'.repeat(LIMITS.message) }).ok, true, 'exactly the limit is fine');
});

test('suspicious input is rejected: unknown fields, wrong types, control chars, links, foreign pages', () => {
  const bad = [
    { ...base, admin: true }, { ...base, name: ['x'] }, { ...base, elapsed_ms: '9000' }, { ...base, message: { $gt: '' } },
    { ...base, inquiry_type: 'other' }, { ...base, page_language: 'de' }, { ...base, contact_method: 'sms' },
    { ...base, page_path: '/../admin' }, { ...base, page_path: '/wholesale/' }, { ...base, page_path: '/ru/contact/' },
    null, [], 'string',
  ];
  for (const b of bad) assert.deepEqual(validate(b).errors, { form: 'invalid' }, JSON.stringify(b));
  assert.equal(validate({ ...base, name: 'Anna\u0000' }).errors.name, 'invalid');
  assert.equal(validate({ ...base, name: 'Anna\nBcc: x' }).errors.name, 'invalid');
  assert.equal(validate({ ...base, name: 'Visit https://spam.example' }).errors.name, 'invalid');
  assert.equal(validate({ ...base, message: 'a http://1 b http://2 c http://3 d http://4' }).errors.message, 'links');
  assert.equal(validate({ ...base, email: 'a@b' }).errors.email, 'email');
  assert.equal(validate({ ...base, email: '"x"@evil.com' }).errors.email, 'email');
  // invisible / bidi characters are removed, so they cannot disguise the Telegram text
  assert.equal(validate({ ...base, name: 'An‮na​' }).data.name, 'Anna');
});

test('telegram username: @ optional, t.me links accepted, bad names rejected', () => {
  assert.equal(normalizeTelegram('moychay_phuket'), 'moychay_phuket');
  assert.equal(normalizeTelegram('@moychay_phuket'), 'moychay_phuket');
  assert.equal(normalizeTelegram('https://t.me/moychay_phuket'), 'moychay_phuket');
  for (const b of ['abc', '1abcdef', 'имя_пользователя', 'a'.repeat(33), 'bad name']) assert.equal(normalizeTelegram(b), null, b);
  assert.equal(normalizeWhatsapp('+7 (912) 345-67-89'), '+79123456789');
  assert.equal(normalizeWhatsapp('0812345678'), null);
});

test('anti-spam signals: honeypot and too-fast submissions', () => {
  assert.equal(validate({ ...base, website: 'http://spam' }).spam, true);
  assert.equal(validate({ ...base, elapsed_ms: 800 }).spam, true);
});

/* ── Telegram message ────────────────────────────────────────────────────── */
test('telegram message: format, B2B label, Bangkok time, plain text', () => {
  const d = validate({ ...base, inquiry_type: 'wholesale', company: 'Cafe <b>X</b>', contact_method: 'telegram',
    contact_value: '@cafe_x', page_language: 'ru', page_path: '/ru/wholesale/' }, Date.UTC(2026, 9, 15, 11, 42)).data;
  const m = formatMessage(d);
  assert.match(m, /^B2B \/ Wholesale enquiry\nНовое обращение с teaphuket\.com/);
  assert.match(m, /Компания: Cafe <b>X<\/b>/);                  // shown as text: no parse_mode
  assert.match(m, /Контакт: Telegram: @cafe_x/);
  assert.match(m, /Дата и время: 15\.10\.2026, 18:42 \(Asia\/Bangkok\)/);
});

test('sendTelegram never exposes the token on errors', async () => {
  globalThis.fetch = async () => { throw new Error('connect failed https://api.telegram.org/botBOT-SECRET-123/sendMessage'); };
  const r = await sendTelegram({ TELEGRAM_BOT_TOKEN: 'BOT-SECRET-123', TELEGRAM_CHAT_ID: '1' }, 'x');
  assert.deepEqual(r, { ok: false, error: 'telegram_network' });
});

/* ── Turnstile ───────────────────────────────────────────────────────────── */
test('turnstile: wrong token, other site, other form, stale token are refused', async () => {
  const env = { TURNSTILE_SECRET: 's' };
  mockNet(); assert.equal((await verifyTurnstile(env, { token: 'bad', action: 'contact' })).ok, false);
  assert.equal((await verifyTurnstile(env, { token: '', action: 'contact' })).ok, false);
  mockNet({ extra: { hostname: 'evil.example' } }); assert.equal((await verifyTurnstile(env, { token: 'tok-ok', action: 'contact' })).ok, false);
  mockNet({ action: 'wholesale' }); assert.equal((await verifyTurnstile(env, { token: 'tok-ok', action: 'contact' })).ok, false);
  mockNet({ challenge_ts: new Date(Date.now() - 6 * 60e3).toISOString() });
  assert.equal((await verifyTurnstile(env, { token: 'tok-ok', action: 'contact' })).ok, false);
  mockNet(); assert.equal((await verifyTurnstile(env, { token: 'tok-ok', action: 'contact' })).ok, true);
  assert.equal((await verifyTurnstile({}, { token: 'tok-ok' })).error, 'not_configured');
});

/* ── Worker end to end (mocked network) ──────────────────────────────────── */
test('happy path: delivered once, then { ok: true } – and only then', async () => {
  const calls = mockNet(); const env = makeEnv();
  const r = await send(base, env);
  assert.equal(r.status, 200); assert.deepEqual(r.body, { ok: true });
  assert.equal(calls.telegram.length, 1);
  assert.equal(calls.telegram[0].parse_mode, undefined);
  assert.equal(calls.telegram[0].chat_id, '42');
});

test('fail-closed: any missing secret or binding → 503, nothing sent', async () => {
  for (const k of ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID', 'TURNSTILE_SECRET', 'HASH_SALT', 'RL_IP', 'RL_GLOBAL', 'FORM_KV']) {
    const calls = mockNet();
    const r = await send(base, makeEnv({ [k]: undefined }));
    assert.equal(r.status, 503, k); assert.equal(r.body.ok, false); assert.equal(calls.telegram.length, 0, k);
  }
});

test('the earlier bypass is closed: forged Origin + fake elapsed_ms without Turnstile → nothing sent', async () => {
  const calls = mockNet(); const env = makeEnv();
  for (let i = 0; i < 5; i++) assert.equal((await send({ ...base, turnstile_token: 'forged', message: 'spam ' + i }, env)).status, 400);
  assert.equal(calls.telegram.length, 0);
  const r = await send({ ...base, turnstile_token: undefined }, env, { ip: '203.0.113.99' });
  assert.equal(r.status, 400); assert.equal(calls.telegram.length, 0);
});

test('rate limits: 6th request per minute from one IP → 429; global cap; daily cap', async () => {
  let calls = mockNet(); let env = makeEnv();
  const codes = [];
  for (let i = 0; i < 7; i++) codes.push((await send({ ...base, message: 'Question number ' + i }, env)).status);
  assert.deepEqual(codes, [200, 200, 200, 200, 200, 429, 429]);
  assert.equal(calls.telegram.length, 5);

  calls = mockNet(); env = makeEnv({ RL_GLOBAL: limiter(2) });           // distributed flood: many IPs
  const g = [];
  for (let i = 0; i < 4; i++) g.push((await send({ ...base, message: 'Flood ' + i }, env, { ip: '198.51.100.' + i })).status);
  assert.deepEqual(g, [200, 200, 429, 429]);

  calls = mockNet(); env = makeEnv({ RL_IP: limiter(1000) });            // slow drip over the day
  const d = [];
  for (let i = 0; i < 22; i++) d.push((await send({ ...base, message: 'Daily message ' + i }, env)).status);
  assert.equal(d.filter((s) => s === 200).length, 20); assert.equal(d.at(-1), 429);
});

test('duplicate submission (double click / resend) reaches Telegram only once', async () => {
  const calls = mockNet(); const env = makeEnv();
  assert.equal((await send(base, env)).status, 200);
  assert.equal((await send({ ...base, message: '  Hello,   can we book a ceremony?  ' }, env)).status, 200);
  assert.equal(calls.telegram.length, 1);
});

test('request size: oversize body (with or without Content-Length) → 413 before parsing', async () => {
  mockNet(); const env = makeEnv();
  assert.equal((await send(null, env, { raw: 'x'.repeat(MAX_BODY + 1) })).status, 413);
  const stream = new ReadableStream({ start(c) { for (let i = 0; i < 40; i++) c.enqueue(new Uint8Array(1024)); c.close(); } });
  const r = await worker.fetch(new Request('https://teaphuket.com/api/contact', { method: 'POST', body: stream, duplex: 'half',
    headers: { Origin: 'https://teaphuket.com', 'Content-Type': 'application/json' } }), env, {});
  assert.equal(r.status, 413);
});

test('protocol checks: method, origin, content type, path, bad JSON', async () => {
  mockNet(); const env = makeEnv();
  assert.equal((await worker.fetch(req(base, { method: 'GET' }), env, {})).status, 405);
  assert.equal((await send(base, env, { origin: 'https://evil.example' })).status, 403);
  assert.equal((await send(base, env, { type: 'text/plain' })).status, 415);
  assert.equal((await send(null, env, { raw: '{not json' })).status, 400);
  assert.equal((await send(null, env, { raw: '[]' })).status, 400);
  const other = await worker.fetch(new Request('https://teaphuket.com/api/other', { method: 'POST' }), env, {});
  assert.equal(other.status, 404);
  const pre = await worker.fetch(new Request('https://teaphuket.com/api/contact', { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } }), env, {});
  assert.equal(pre.headers.get('Access-Control-Allow-Origin'), null);
});

test('responses and logs never contain personal data or secrets', async () => {
  const logs = []; const orig = console.log; console.log = (...a) => logs.push(a.join(' '));
  try {
    const env = makeEnv();
    mockNet({ tgStatus: 500 });
    const fail = await send({ ...base, email: 'secret.person@mail.example', message: 'My private message 12345' }, env);
    assert.equal(fail.status, 502); assert.deepEqual(fail.body, { ok: false, error: 'delivery' });
    mockNet();
    const inv = await send({ ...base, email: 'secret.person@', message: 'My private message 12345' }, env);
    assert.equal(inv.status, 422); assert.deepEqual(inv.body, { ok: false, errors: { email: 'email' } });
    // unexpected crash → generic 500
    const broken = makeEnv({ FORM_KV: { get: async () => { throw new Error('secret.person@mail.example BOT-SECRET-123'); }, put: async () => {} } });
    const crash = await send(base, broken);
    assert.equal(crash.status, 500); assert.deepEqual(crash.body, { ok: false, error: 'server' });
  } finally { console.log = orig; }
  const all = logs.join('\n');
  for (const s of ['secret.person', 'private message', 'BOT-SECRET', 'TS-SECRET', '203.0.113', 'Anna', '+668']) assert.ok(!all.includes(s), 'log leaks ' + s);
  assert.ok(logs.length > 0 && logs.every((l) => /^contact:[a-z_]+/.test(l)), logs.join(' | '));
});

test('KV keys are hashed: no IPs, emails or messages stored in clear text', async () => {
  mockNet(); const env = makeEnv();
  await send(base, env);
  const keys = [...env.FORM_KV.m.keys()].join(' ');
  for (const s of ['203.0.113.7', 'anna@example.com', 'Hello']) assert.ok(!keys.includes(s), keys);
});

test('wholesale business type: optional, whitelist only, shown in Telegram', () => {
  const w = { ...base, inquiry_type: 'wholesale', company: 'Cafe', page_path: '/wholesale/' };
  assert.equal(validate(w).ok, true);
  assert.equal(validate({ ...w, business_type: 'hotel' }).ok, true);
  assert.equal(validate({ ...w, business_type: '<script>' }).errors.business_type, 'invalid');
  assert.equal(validate({ ...w, business_type: '__proto__' }).errors.business_type, 'invalid');
  assert.equal(validate({ ...base, business_type: 'hotel' }).errors.business_type, 'invalid', 'not on the contact form');
  assert.match(formatMessage(validate({ ...w, business_type: 'spa' }).data), /Тип бизнеса: SPA \/ wellness/);
});
