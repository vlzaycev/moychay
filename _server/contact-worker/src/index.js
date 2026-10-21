// Cloudflare Worker: POST https://teaphuket.com/api/contact
// Receives contact / wholesale enquiries, checks them and forwards them to Telegram.
// The site shows "delivered" only when this handler answers { ok: true } – i.e. after Telegram accepted the message.
// Fail-closed: if any secret or binding is missing, nothing is sent and the visitor gets an error.
// Not deployed yet: see TELEGRAM_INTEGRATION_TODO.md in the repository root.
import { validate } from './validate.js';
import { formatMessage, sendTelegram } from './telegram.js';
import { verifyTurnstile } from './turnstile.js';
import { missingConfig, hashIp, hashMessage, checkLimits, countSend, isDuplicate, rememberSent } from './guard.js';

// Not exported: the Workers runtime accepts only handlers and functions as exports of the entry module
const ALLOWED_ORIGINS = ['https://teaphuket.com'];
const MAX_BODY = 16 * 1024;
export const maxBody = () => MAX_BODY;          // for tests

function json(status, body, origin) {
  const h = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
  if (origin) { h['Access-Control-Allow-Origin'] = origin; h['Vary'] = 'Origin'; }
  return new Response(JSON.stringify(body), { status, headers: h });
}

// Reads at most MAX_BODY bytes, whatever Content-Length claims (chunked bodies have none)
async function readLimited(request) {
  const len = Number(request.headers.get('Content-Length'));
  if (len > MAX_BODY) return null;
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks = []; let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY) { await reader.cancel(); return null; }
    chunks.push(value);
  }
  const all = new Uint8Array(size); let o = 0;
  for (const c of chunks) { all.set(c, o); o += c.byteLength; }
  return new TextDecoder('utf-8', { fatal: true }).decode(all);
}

// Only codes go to the logs – never names, emails, contacts, messages, IPs or tokens
const log = (event, extra = '') => console.log(`contact:${event}${extra ? ' ' + extra : ''}`);

async function handle(request, env, ctx) {
  const url = new URL(request.url);
  if (url.pathname !== '/api/contact') return json(404, { ok: false, error: 'not_found' });

  const origin = request.headers.get('Origin') || '';
  const allowed = ALLOWED_ORIGINS.concat(env.EXTRA_ORIGINS ? env.EXTRA_ORIGINS.split(',') : []);
  const okOrigin = allowed.includes(origin) ? origin : '';

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: okOrigin ? {
      'Access-Control-Allow-Origin': okOrigin, 'Access-Control-Allow-Methods': 'POST',
      'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400', 'Vary': 'Origin' } : {} });
  }
  if (request.method !== 'POST') return new Response(null, { status: 405, headers: { Allow: 'POST, OPTIONS' } });
  // Browser check only (curl can fake Origin) – Turnstile and the rate limits below are the real protection
  if (!okOrigin) return json(403, { ok: false, error: 'origin' });
  if (!/^application\/json(;\s*charset=utf-8)?$/i.test(request.headers.get('Content-Type') || '')) {
    return json(415, { ok: false, error: 'type' }, okOrigin);
  }

  const missing = missingConfig(env);
  if (missing.length) { log('not_configured', String(missing.length)); return json(503, { ok: false, error: 'unavailable' }, okOrigin); }

  const ip = request.headers.get('CF-Connecting-IP') || '';
  const ipHash = await hashIp(env, ip);
  const day = new Date().toISOString().slice(0, 10);
  const limited = await checkLimits(env, ipHash, day);
  if (limited) { log('rate_limited'); return json(429, { ok: false, error: 'rate_limited' }, okOrigin); }

  let raw;
  try { raw = await readLimited(request); } catch { return json(400, { ok: false, error: 'invalid' }, okOrigin); }
  if (raw === null) return json(413, { ok: false, error: 'too_large' }, okOrigin);
  let body;
  try { body = JSON.parse(raw); } catch { return json(400, { ok: false, error: 'invalid' }, okOrigin); }

  const v = validate(body);
  // Spam (honeypot / too fast): nothing is forwarded; a neutral error, real visitors never get here
  if (v.spam) { log('spam'); return json(400, { ok: false, error: 'rejected' }, okOrigin); }
  if (!v.ok) {
    if (v.errors.form) return json(400, { ok: false, error: 'invalid' }, okOrigin);
    return json(422, { ok: false, errors: v.errors }, okOrigin);           // field codes only, no echo of the input
  }
  const d = v.data;

  const msgHash = await hashMessage(env, d);
  const ts = await verifyTurnstile(env, { token: body.turnstile_token, ip, action: d.inquiry_type, idempotencyKey: crypto.randomUUID() });
  if (!ts.ok) {
    log(ts.error);
    return json(ts.error === 'captcha_unavailable' ? 503 : 400, { ok: false, error: 'captcha' }, okOrigin);
  }

  // Double click / resubmit of an already delivered enquiry: it did reach Telegram, so this is a true success
  if (await isDuplicate(env, msgHash)) { log('duplicate'); return json(200, { ok: true }, okOrigin); }

  const sent = await sendTelegram(env, formatMessage(d));
  if (!sent.ok) { log('delivery_failed', sent.error); return json(502, { ok: false, error: 'delivery' }, okOrigin); }

  const after = Promise.all([rememberSent(env, msgHash), countSend(env, ipHash, day)]).catch(() => log('kv_write_failed'));
  if (ctx && ctx.waitUntil) ctx.waitUntil(after); else await after;
  log('sent', d.inquiry_type);
  return json(200, { ok: true }, okOrigin);
}

export default {
  async fetch(request, env, ctx) {
    try {
      return await handle(request, env, ctx);
    } catch (e) {
      log('error', (e && e.name) || 'unknown');                            // no message/stack: could contain input
      return json(500, { ok: false, error: 'server' });
    }
  },
};
