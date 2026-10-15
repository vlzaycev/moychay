// Server-side form handling (_server/contact-worker): validation, anti-spam, Telegram message, delivery honesty
import test from 'node:test';
import assert from 'node:assert/strict';
import { validate, normalizeTelegram, normalizeWhatsapp } from '../../_server/contact-worker/src/validate.js';
import { formatMessage, sendTelegram } from '../../_server/contact-worker/src/telegram.js';
import worker from '../../_server/contact-worker/src/index.js';

const base = { inquiry_type: 'contact', name: 'Anna', email: 'Anna@Example.com', contact_method: 'whatsapp',
  contact_value: '+66 81 234 5678', message: 'Hello, can we book?', page_language: 'en', page_path: '/contact/',
  website: '', elapsed_ms: 9000 };

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
  assert.equal(validate({ ...base, inquiry_type: 'wholesale' }).errors.company, 'required');
});

test('telegram username: @ optional, t.me links accepted, bad names rejected', () => {
  assert.equal(normalizeTelegram('moychay_phuket'), 'moychay_phuket');
  assert.equal(normalizeTelegram('@moychay_phuket'), 'moychay_phuket');
  assert.equal(normalizeTelegram('https://t.me/moychay_phuket'), 'moychay_phuket');
  for (const bad of ['abc', '1abcdef', 'имя_пользователя', 'a'.repeat(33), 'bad name']) assert.equal(normalizeTelegram(bad), null, bad);
  assert.equal(normalizeWhatsapp('+7 (912) 345-67-89'), '+79123456789');
  assert.equal(normalizeWhatsapp('0812345678'), null);
});

test('anti-spam: honeypot and too-fast submissions are rejected', () => {
  assert.equal(validate({ ...base, website: 'http://spam' }).spam, true);
  assert.equal(validate({ ...base, elapsed_ms: 800 }).spam, true);
});

test('telegram message: format, B2B label, Bangkok time, plain text', () => {
  const d = validate({ ...base, inquiry_type: 'wholesale', company: 'Cafe <b>X</b>', contact_method: 'telegram',
    contact_value: '@cafe_x', page_language: 'ru', page_path: '/ru/wholesale/' }, Date.UTC(2026, 9, 15, 11, 42)).data;
  const m = formatMessage(d);
  assert.match(m, /^B2B \/ Wholesale enquiry\nНовое обращение с teaphuket\.com/);
  assert.match(m, /Компания: Cafe <b>X<\/b>/);
  assert.match(m, /Контакт: Telegram: @cafe_x/);
  assert.match(m, /Страница: https:\/\/teaphuket\.com\/ru\/wholesale\//);
  assert.match(m, /Дата и время: 15\.10\.2026, 18:42 \(Asia\/Bangkok\)/);
});

test('no token → not delivered (never a fake success)', async () => {
  assert.deepEqual(await sendTelegram({}, 'x'), { ok: false, error: 'not_configured' });
  const req = new Request('https://teaphuket.com/api/contact', { method: 'POST',
    headers: { Origin: 'https://teaphuket.com', 'Content-Type': 'application/json' }, body: JSON.stringify(base) });
  const r = await worker.fetch(req, {});
  assert.equal(r.status, 503);
  assert.equal((await r.json()).ok, false);
});

test('worker: foreign origin refused, invalid data → 422 with field codes', async () => {
  const mk = (origin, body) => new Request('https://teaphuket.com/api/contact', { method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal((await worker.fetch(mk('https://evil.example', base), {})).status, 403);
  const r = await worker.fetch(mk('https://teaphuket.com', { ...base, email: 'x' }), {});
  assert.equal(r.status, 422);
  assert.deepEqual((await r.json()).errors, { email: 'email' });
});

test('worker: delivered only after Telegram confirms', async () => {
  const orig = globalThis.fetch;
  let sent;
  globalThis.fetch = async (u, o) => { sent = { u: String(u), body: JSON.parse(o.body) }; return new Response('{"ok":true}', { status: 200 }); };
  try {
    const req = new Request('https://teaphuket.com/api/contact', { method: 'POST',
      headers: { Origin: 'https://teaphuket.com', 'Content-Type': 'application/json' }, body: JSON.stringify(base) });
    const r = await worker.fetch(req, { TELEGRAM_BOT_TOKEN: 'TEST', TELEGRAM_CHAT_ID: '1' });
    assert.equal(r.status, 200);
    assert.equal(sent.u, 'https://api.telegram.org/botTEST/sendMessage');
    assert.equal(sent.body.parse_mode, undefined);
  } finally { globalThis.fetch = orig; }
});
