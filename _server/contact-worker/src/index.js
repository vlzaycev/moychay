// Cloudflare Worker: POST https://teaphuket.com/api/contact
// Receives contact / wholesale enquiries, validates them and forwards them to Telegram.
// The site shows "delivered" only when this handler answers { ok: true } — i.e. after Telegram accepted the message.
// Not deployed yet: see TELEGRAM_INTEGRATION_TODO.md in the repository root.
import { validate } from './validate.js';
import { formatMessage, sendTelegram } from './telegram.js';

const ALLOWED_ORIGINS = ['https://teaphuket.com'];
const MAX_BODY = 16 * 1024;

function json(status, body, origin) {
  const h = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
  if (origin) { h['Access-Control-Allow-Origin'] = origin; h['Vary'] = 'Origin'; }
  return new Response(JSON.stringify(body), { status, headers: h });
}

async function turnstileOk(env, token, ip) {
  if (!env.TURNSTILE_SECRET) return true;            // optional extra layer, off until configured
  const form = new FormData();
  form.append('secret', env.TURNSTILE_SECRET); form.append('response', token || ''); form.append('remoteip', ip || '');
  const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form });
  return !!(await r.json().catch(() => ({}))).success;
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowed = ALLOWED_ORIGINS.concat(env.EXTRA_ORIGINS ? env.EXTRA_ORIGINS.split(',') : []);
    const okOrigin = allowed.includes(origin) ? origin : '';

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: okOrigin ? {
        'Access-Control-Allow-Origin': okOrigin, 'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400', 'Vary': 'Origin' } : {} });
    }
    if (request.method !== 'POST') return json(405, { ok: false, error: 'method' });
    if (!okOrigin) return json(403, { ok: false, error: 'origin' });
    if (!(request.headers.get('Content-Type') || '').includes('application/json')) return json(415, { ok: false, error: 'type' }, okOrigin);

    const ip = request.headers.get('CF-Connecting-IP') || '';
    // Rate limit: Cloudflare Rate Limiting binding (wrangler.toml → [[unsafe.bindings]] type "ratelimit")
    if (env.RATE_LIMITER) {
      const { success } = await env.RATE_LIMITER.limit({ key: ip || 'unknown' });
      if (!success) return json(429, { ok: false, error: 'rate_limited' }, okOrigin);
    }

    const raw = await request.text();
    if (raw.length > MAX_BODY) return json(413, { ok: false, error: 'too_large' }, okOrigin);
    let body;
    try { body = JSON.parse(raw); } catch { return json(400, { ok: false, error: 'json' }, okOrigin); }

    const v = validate(body);
    // Spam (honeypot / too fast): nothing is forwarded; the bot gets a neutral error, people never see it
    if (v.spam) return json(400, { ok: false, error: 'rejected' }, okOrigin);
    if (!v.ok) return json(422, { ok: false, errors: v.errors }, okOrigin);
    if (!(await turnstileOk(env, body.turnstile_token, ip))) return json(400, { ok: false, error: 'captcha' }, okOrigin);

    try {
      const sent = await sendTelegram(env, formatMessage(v.data));
      if (!sent.ok) {
        console.log('delivery_failed', sent.error, v.data.inquiry_type);   // never log names, contacts or messages
        return json(sent.error === 'not_configured' ? 503 : 502, { ok: false, error: 'delivery' }, okOrigin);
      }
    } catch (e) {
      console.log('delivery_error', v.data.inquiry_type);
      return json(502, { ok: false, error: 'delivery' }, okOrigin);
    }
    return json(200, { ok: true }, okOrigin);
  },
};
