// Cloudflare Worker: Cha – AI tea assistant and live support for teaphuket.com
//   POST /api/chat/start      new conversation (Turnstile once per conversation)
//   GET  /api/chat/poll       new messages and status (visitor token); ?wait=N holds the request up to N s
//                             until something new arrives (long polling: a team reply shows up within ~1 s)
//   POST /api/chat/send       visitor message → AI answer, or → staff in Telegram; {stream:true} → the answer
//                             as server-sent events while it is written (event: visitor | delta | done)
//   POST /api/chat/human      "Talk to our team"
//   POST /api/chat/contact    visitor leaves a contact for the team (optional)
//   POST /api/chat/lang       interface language switch
//   POST /api/chat/telegram   Telegram webhook (secret header, staff chat and operator ids checked)
// Separate from the contact form Worker (/api/contact): nothing here can break the forms.
import * as S from './store.js';
import { ALLOWED_ORIGINS, LANGS, num, dayKey, devMode } from './config.js';
import { t } from './i18n.js';
import { answerWithAI, requestHuman, forwardToStaff, handleUpdate, wantsHuman } from './chat.js';
import { validSecret, telegramReady } from './telegram.js';
import { verifyTurnstile } from '../../contact-worker/src/turnstile.js';

const log = (e, x = '') => console.log(`chat:${e}${x ? ' ' + x : ''}`);

function headers(origin, type, extra) {
  const h = { 'Content-Type': type, 'Cache-Control': 'no-store, no-transform', 'X-Content-Type-Options': 'nosniff', ...extra };
  if (origin) { h['Access-Control-Allow-Origin'] = origin; h['Vary'] = 'Origin'; }
  return h;
}
function json(status, body, origin, extra) {
  return new Response(JSON.stringify(body), { status, headers: headers(origin, 'application/json; charset=utf-8', extra) });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const LONG_POLL_MAX_S = 20;        // a check every 0.75 s: ≤ 30 single-row reads per request, inside the Workers limits
const LONG_POLL_TICK_MS = 750;

// Stage times of an AI answer → perf table (numbers only) and the Server-Timing header (browser dev tools)
function aiPerf(t, total) {
  if (t.ai0 === undefined) return null;
  return { total, pre: t.ai0, ttft: Math.max(0, (t.ttft ?? t.ai1) - t.ai0), ai: t.ai1 - t.ai0, post: total - t.ai1 };
}
const serverTiming = (p) => (p ? { 'Server-Timing': `pre;dur=${p.pre}, ttft;dur=${p.ttft}, ai;dur=${p.ai}, post;dur=${p.post}, total;dur=${p.total}` } : {});

async function readJSON(request, max) {
  const len = Number(request.headers.get('Content-Length'));
  if (len > max) return null;
  const buf = await request.arrayBuffer();
  if (buf.byteLength > max) return null;
  try { const v = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buf)); return v && typeof v === 'object' && !Array.isArray(v) ? v : null; }
  catch { return null; }
}

// Visitor text: trimmed, control characters removed (newlines kept), length-limited
export function cleanText(s, max) {
  if (typeof s !== 'string') return '';
  s = s.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000B-\u001F\u007F​-‏‪-‮⁦-⁩]/g, '').replace(/\n{3,}/g, '\n\n').trim();
  return s.length > max ? '' : s;
}
const okClientId = (s) => typeof s === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(s);
const okLang = (s) => LANGS.includes(s);
const okPage = (s) => (typeof s === 'string' && /^\/[A-Za-z0-9/_-]{0,120}$/.test(s) ? s : '/');

export function missingConfig(env) {
  return ['DB', 'HASH_SALT'].filter((k) => !env[k]);
}

async function ipHash(env, request) {
  return S.sha256hex(`${env.HASH_SALT}|chat-ip|${request.headers.get('CF-Connecting-IP') || 'unknown'}`);
}

async function handle(request, env, ctx) {
  const t0 = Date.now();
  const waitUntil = ctx && ctx.waitUntil ? ctx.waitUntil.bind(ctx) : undefined;
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '');
  if (!path.startsWith('/api/chat/')) return json(404, { ok: false, error: 'not_found' });
  const action = path.slice('/api/chat/'.length);
  const dev = devMode(env, request.url);

  // ── Telegram webhook: no browser, no CORS; the secret header is the authentication ──
  if (action === 'telegram') {
    if (request.method !== 'POST') return new Response(null, { status: 405 });
    if (!validSecret(env, request.headers.get('X-Telegram-Bot-Api-Secret-Token'))) { log('webhook_forbidden'); return json(401, { ok: false }); }
    if (missingConfig(env).length || !telegramReady(env)) return json(503, { ok: false });
    const update = await readJSON(request, 64 * 1024);
    if (!update) return json(400, { ok: false });
    try { log('webhook', await handleUpdate(env, update, { waitUntil, t0 })); }
    catch (e) {
      // A temporary failure (database, network) must not lose a team message: the update is "unseen" again and
      // Telegram delivers it once more. After 3 failed attempts it is dropped, so one bad update cannot block the queue.
      log('webhook_error');
      if (Number.isInteger(update.update_id) && (await S.bump(env.DB, `tgfail:${update.update_id}`, 86400000).catch(() => 9)) < 3) {
        await S.forgetUpdate(env.DB, update.update_id).catch(() => {});
        return json(500, { ok: false });
      }
    }
    return json(200, { ok: true });
  }

  // ── browser API: same origin only ──
  const origin = request.headers.get('Origin') || '';
  const allowed = ALLOWED_ORIGINS.concat(env.EXTRA_ORIGINS ? env.EXTRA_ORIGINS.split(',').map((s) => s.trim()) : []);
  const okOrigin = allowed.includes(origin) ? origin : '';
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: okOrigin ? { 'Access-Control-Allow-Origin': okOrigin, 'Access-Control-Allow-Methods': 'GET, POST',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Max-Age': '86400', Vary: 'Origin' } : {} });
  }
  // Browsers send no Origin on same-origin GET requests (fetch spec), so reading new messages (poll)
  // is allowed without it: it needs the visitor's token, and CORS keeps other sites from reading the answer.
  // Everything that writes (POST) still requires our Origin.
  const sameOriginGet = request.method === 'GET' && !origin && action === 'poll';
  if (!okOrigin && !sameOriginGet) return json(403, { ok: false, error: 'origin' });
  if (missingConfig(env).length) { log('not_configured'); return json(503, { ok: false, error: 'unavailable' }, okOrigin); }
  const ip = await ipHash(env, request);
  const day = dayKey();

  if (action === 'start') {
    if (request.method !== 'POST') return json(405, { ok: false }, okOrigin);
    if (env.RL_START && !(await env.RL_START.limit({ key: ip })).success) return json(429, { ok: false, error: 'rate_limited' }, okOrigin);
    const body = await readJSON(request, num(env, 'MAX_BODY'));
    if (!body) return json(400, { ok: false, error: 'invalid' }, okOrigin);
    const lang = okLang(body.lang) ? body.lang : 'en';
    if (!dev) {
      const ts = await verifyTurnstile(env, { token: body.turnstile_token, ip: request.headers.get('CF-Connecting-IP'), action: 'chat' });
      if (!ts.ok) return json(ts.error === 'not_configured' ? 503 : 400, { ok: false, error: ts.error === 'not_configured' ? 'unavailable' : 'captcha' }, okOrigin);
    }
    if ((await S.bump(env.DB, `start:${day}:${ip}`, 2 * 86400000)) > num(env, 'STARTS_PER_IP_DAY')) return json(429, { ok: false, error: 'rate_limited' }, okOrigin);
    const { token, conv } = await S.createConversation(env.DB, { lang, page: okPage(body.page) });
    log('start');
    return json(200, { ok: true, token, status: conv.status, lang, messages: [] }, okOrigin);
  }

  // everything else needs the visitor's token
  const auth = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const conv = await S.conversationByToken(env.DB, auth);
  if (!conv) return json(401, { ok: false, error: 'session' }, okOrigin);

  if (action === 'poll') {
    if (request.method !== 'GET') return json(405, { ok: false }, okOrigin);
    if (env.RL_POLL && !(await env.RL_POLL.limit({ key: conv.id })).success) return json(429, { ok: false, error: 'rate_limited' }, okOrigin);
    const after = Math.max(0, Math.min(1e9, parseInt(url.searchParams.get('after') || '0', 10) || 0));
    const wait = Math.max(0, Math.min(LONG_POLL_MAX_S, parseInt(url.searchParams.get('wait') || '0', 10) || 0));
    // Long polling: nothing new yet → check every 0.75 s (a single-row read) until a message or a status change arrives
    if (wait && conv.seq <= after) {
      const end = t0 + wait * 1000;
      while (Date.now() < end && !(request.signal && request.signal.aborted)) {
        await sleep(Math.min(LONG_POLL_TICK_MS, end - Date.now()));
        const head = await S.convHead(env.DB, conv.id);
        if (!head || head.seq > after || head.status !== conv.status) break;
      }
    }
    const st = await S.stateAfter(env.DB, conv.id, after);
    const op = st.messages.find((m) => m.sender === 'operator' && m.at);
    if (op && waitUntil) waitUntil(S.addPerf(env.DB, 'deliver', { total: Math.max(0, Date.now() - op.at) }).catch(() => {}));
    return json(200, { ok: true, status: st.status, lang: st.lang, messages: st.messages }, okOrigin);
  }

  if (request.method !== 'POST') return json(405, { ok: false }, okOrigin);
  if (env.RL_MSG && !(await env.RL_MSG.limit({ key: ip })).success) return json(429, { ok: false, error: 'rate_limited' }, okOrigin);
  const body = await readJSON(request, num(env, 'MAX_BODY'));
  if (!body) return json(400, { ok: false, error: 'invalid' }, okOrigin);

  if (action === 'lang') {
    if (!okLang(body.lang)) return json(400, { ok: false, error: 'invalid' }, okOrigin);
    await S.setLang(env.DB, conv.id, body.lang);
    return json(200, { ok: true, lang: body.lang }, okOrigin);
  }

  if (action === 'human') {
    const before = conv.seq;
    await requestHuman(env, conv, { ack: true });
    return json(200, { ok: true, ...(await state(env, conv.id, before)) }, okOrigin);
  }

  if (action === 'contact') {
    if (!okClientId(body.client_id)) return json(400, { ok: false, error: 'invalid' }, okOrigin);
    const contact = cleanText(body.contact, num(env, 'MAX_CONTACT')).replace(/\n/g, ' ');
    if (!contact) return json(400, { ok: false, error: 'invalid' }, okOrigin);
    if (await S.messageByClientId(env.DB, conv.id, body.client_id)) return json(200, { ok: true, duplicate: true, ...(await state(env, conv.id, conv.seq)) }, okOrigin);
    if (conv.status !== 'human_requested' && conv.status !== 'human_active') return json(409, { ok: false, error: 'state' }, okOrigin);
    const before = conv.seq;
    await S.addMessage(env.DB, conv.id, { sender: 'visitor', text: contact, meta: { lead: true }, clientId: body.client_id });
    await forwardToStaff(env, conv, `Contact left by the visitor: ${contact}`, { label: 'Contact' });
    await S.addMessage(env.DB, conv.id, { sender: 'system', text: t('contact_saved', conv.lang) });
    log('lead');
    return json(200, { ok: true, ...(await state(env, conv.id, before)) }, okOrigin);
  }

  if (action === 'send') {
    if (!okClientId(body.client_id)) return json(400, { ok: false, error: 'invalid' }, okOrigin);
    const text = cleanText(body.text, num(env, 'MAX_TEXT'));
    if (!text) return json(400, { ok: false, error: 'invalid' }, okOrigin);
    // Repeated submit (double click, network retry): the message is not stored or answered twice
    const dup = await S.messageByClientId(env.DB, conv.id, body.client_id);
    if (dup) return json(200, { ok: true, duplicate: true, ...(await state(env, conv.id, dup.seq - 1)) }, okOrigin);
    if ((await S.bump(env.DB, `msg:${day}:${ip}`, 2 * 86400000)) > num(env, 'MESSAGES_PER_IP_DAY')) return json(429, { ok: false, error: 'rate_limited' }, okOrigin);
    if (okLang(body.lang) && body.lang !== conv.lang) { await S.setLang(env.DB, conv.id, body.lang); conv.lang = body.lang; }

    const human = conv.status === 'human_requested' || conv.status === 'human_active';
    // the AI lock is taken before the message is stored: a second tab cannot start a parallel AI call
    if (!human && !(await S.acquireAiLock(env.DB, conv.id, num(env, 'AI_LOCK_MS')))) return json(409, { ok: false, error: 'busy' }, okOrigin);
    const before = conv.seq;
    let visitorMsg;
    try {
      visitorMsg = await S.addMessage(env.DB, conv.id, { sender: 'visitor', text, clientId: body.client_id });
    } catch {
      if (!human) await S.releaseAiLock(env.DB, conv.id);
      return json(200, { ok: true, duplicate: true, ...(await state(env, conv.id, before)) }, okOrigin);   // unique client_id race
    }
    if (human) {
      const sent = await forwardToStaff(env, conv, text);
      if (!sent) log('forward_failed');
      return json(200, { ok: true, ...(await state(env, conv.id, before)) }, okOrigin);
    }
    if (conv.status === 'closed') { await S.setStatus(env.DB, conv.id, 'ai_active'); conv.status = 'ai_active'; }   // writing again reopens the chat
    if (wantsHuman(text)) {
      try { await requestHuman(env, conv, { ack: true }); } finally { await S.releaseAiLock(env.DB, conv.id); }
      return json(200, { ok: true, ...(await state(env, conv.id, before)) }, okOrigin);
    }
    const timing = { t0 };
    if (body.stream !== true) {
      try { await answerWithAI(env, conv, { dev, waitUntil, timing }); } finally { await S.releaseAiLock(env.DB, conv.id); }
      const st = await state(env, conv.id, before);
      const p = aiPerf(timing, Date.now() - t0);
      if (p && waitUntil) waitUntil(S.addPerf(env.DB, 'ai', p).catch(() => {}));
      return json(200, { ok: true, ...st }, okOrigin, serverTiming(p));
    }
    return streamAnswer(env, conv, { dev, waitUntil, timing, before, visitorMsg, okOrigin });
  }

  return json(404, { ok: false, error: 'not_found' }, okOrigin);
}

async function state(env, convId, after) {
  const st = await S.stateAfter(env.DB, convId, after);
  return { status: st.status, lang: st.lang, messages: st.messages };
}

// The AI answer as server-sent events: "visitor" (the stored message), "delta" (the answer so far: {add} appends,
// {text} replaces), "done" (status and all new messages – the stored, checked answer replaces the preview).
// If the visitor's connection drops, the answer is still finished and stored: the next poll brings it.
function streamAnswer(env, conv, { dev, waitUntil, timing, before, visitorMsg, okOrigin }) {
  const { readable, writable } = new TransformStream();
  const w = writable.getWriter(), enc = new TextEncoder();
  let alive = true, sent = '';
  const emit = (event, data) => { if (alive) w.write(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)).catch(() => { alive = false; }); };
  const run = (async () => {
    emit('visitor', { message: visitorMsg });
    try {
      await answerWithAI(env, conv, { dev, waitUntil, timing, onDelta: (v) => {
        emit('delta', v.startsWith(sent) ? { add: v.slice(sent.length) } : { text: v });
        sent = v;
      } });
    } catch { log('stream_error'); }
    finally { await S.releaseAiLock(env.DB, conv.id).catch(() => {}); }
    const st = await state(env, conv.id, before).catch(() => null);
    emit('done', st ? { ok: true, ...st } : { ok: false, error: 'server' });
    const p = aiPerf(timing, Date.now() - timing.t0);
    if (p) await S.addPerf(env.DB, 'ai_stream', p).catch(() => {});
    await w.close().catch(() => {});
  })();
  if (waitUntil) waitUntil(run);
  return new Response(readable, { status: 200, headers: headers(okOrigin, 'text/event-stream; charset=utf-8', { 'X-Accel-Buffering': 'no' }) });
}

export default {
  async fetch(request, env, ctx) {
    try {
      return await handle(request, env, ctx);
    } catch (e) {
      log('error');                                  // no details: they could contain visitor text
      return json(500, { ok: false, error: 'server' });
    }
  },
  // Daily: delete conversations older than RETENTION_DAYS (default 30), old counters and Telegram update ids
  async scheduled(event, env, ctx) {
    if (env.DB) ctx.waitUntil(S.purge(env.DB, num(env, 'RETENTION_DAYS')));
  },
};
