// AI providers behind one function, so the business logic is not tied to a vendor.
//   AI_PROVIDER = anthropic (default) | openai (any OpenAI-compatible endpoint: AI_BASE_URL) | mock (local dev only)
//   AI_MODEL    = e.g. claude-haiku-5-5
//   AI_API_KEY  = secret (wrangler secret put AI_API_KEY)
// One attempt per message, hard timeout, capped output: no retry loops, no runaway costs.
// Streaming (Anthropic, mock): onDelta(text) gets the answer as it is written, for the browser to show early;
// the stored answer is always the complete, parsed and checked text.
import { num, BUTTONS } from './config.js';

/** Conversation rows → alternating user/assistant messages starting with the visitor. */
export function toChat(rows) {
  const out = [];
  for (const m of rows) {
    let role, text;
    if (m.sender === 'visitor') { role = 'user'; text = m.text; }
    else if (m.sender === 'assistant') { role = 'assistant'; text = m.text; }
    else if (m.sender === 'operator') { role = 'assistant'; text = `[A member of the Moychay team wrote:] ${m.text}`; }
    else continue;                                    // system notices are UI only
    const last = out[out.length - 1];
    if (last && last.role === role) last.content += '\n\n' + text;
    else out.push({ role, content: text });
  }
  while (out.length && out[0].role !== 'user') out.shift();
  return out;
}

const HANDOFF = /\[\[\s*handoff\s*\]\]/i;
const MARKER = /\[\[\s*button\s*:\s*([a-z]+)\s*\]\]/gi;

/** Partial model text → what may be shown while it is still being written: markers are hidden, an unfinished one is held back. */
export function visiblePart(raw) {
  let s = String(raw || '').replace(/\[\[[^\]]*\]\]/g, '');
  const open = s.search(/\[[^\]]*$/);
  if (open >= 0) s = s.slice(0, open);                                       // "[[butt…" – wait for the rest
  return s.replace(/\u2014/g, '–').replace(/\*\*/g, '').replace(/^#+\s*/gm, '').replace(/<[^>]*$/, '').replace(/<\/?[a-z][^>]*>/gi, '').replace(/\s+$/, '');
}

/** Model text → { text, buttons, handoff }. Unknown markers and any HTML-looking tags are removed. */
export function parseAnswer(raw) {
  let text = String(raw || '');
  const handoff = HANDOFF.test(text);
  const buttons = [];
  text = text.replace(MARKER, (_, k) => { k = k.toLowerCase(); if (BUTTONS.includes(k) && !buttons.includes(k) && buttons.length < 3) buttons.push(k); return ''; });
  text = text.replace(/\[\[[^\]]*\]\]/g, '')                  // any other marker
    .replace(/<\/?[a-z][^>]*>/gi, '')                           // no HTML (the browser renders text anyway)
    .replace(/^#+\s*/gm, '').replace(/\*\*(.+?)\*\*/g, '$1')    // no Markdown headings / bold
    .replace(/\u2014/g, '–')                                    // house style: en dash, never the long dash
    .replace(/\n{3,}/g, '\n\n').trim();
  return { text, buttons, handoff };
}

async function anthropic(env, { system, messages, maxTokens, onDelta }, fetchImpl) {
  const stream = typeof onDelta === 'function';
  const r = await fetchImpl('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': env.AI_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: env.AI_MODEL || 'claude-haiku-5-5',
      max_tokens: maxTokens,
      // rules + knowledge are identical for every visitor: cached by the provider (cache reads cost ~10 %)
      system: [
        { type: 'text', text: system.rules },
        { type: 'text', text: system.knowledge, cache_control: { type: 'ephemeral' } },
        { type: 'text', text: system.live },
      ],
      messages,
      ...(stream ? { stream: true } : {}),
    }),
    signal: AbortSignal.timeout(num(env, 'AI_TIMEOUT_MS')),
  });
  if (!r.ok) throw new Error('ai_http_' + r.status);
  const usage = (u) => ({ input: u.input_tokens || 0, output: u.output_tokens || 0, cacheRead: u.cache_read_input_tokens || 0, cacheWrite: u.cache_creation_input_tokens || 0 });
  if (!stream || !r.body || !/event-stream/.test(r.headers.get('content-type') || '')) {
    const j = await r.json();
    const text = (j.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\n');
    if (stream && text) onDelta(text);
    return { text, usage: usage(j.usage || {}) };
  }
  // Server-sent events: message_start (usage) → content_block_delta (text) … → message_delta (output tokens)
  let text = '', u = {}, buf = '';
  const reader = r.body.pipeThrough(new TextDecoderStream()).getReader();
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += value;
    let i;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const block = buf.slice(0, i); buf = buf.slice(i + 2);
      const data = block.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim()).join('');
      if (!data) continue;
      let e; try { e = JSON.parse(data); } catch { continue; }
      if (e.type === 'message_start' && e.message && e.message.usage) u = { ...u, ...e.message.usage };
      else if (e.type === 'content_block_delta' && e.delta && e.delta.type === 'text_delta') { text += e.delta.text; onDelta(text); }
      else if (e.type === 'message_delta' && e.usage) u = { ...u, ...e.usage };
      else if (e.type === 'error') throw new Error('ai_stream_' + String((e.error && e.error.type) || 'error').slice(0, 30));
    }
  }
  return { text, usage: usage(u) };
}

async function openai(env, { system, messages, maxTokens, onDelta }, fetchImpl) {
  const base = (env.AI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
  const r = await fetchImpl(`${base}/chat/completions`, {
    method: 'POST',
    headers: { authorization: `Bearer ${env.AI_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: env.AI_MODEL, max_tokens: maxTokens,
      messages: [{ role: 'system', content: `${system.rules}\n\nKNOWLEDGE\n${system.knowledge}\n\nLIVE DATA\n${system.live}` }, ...messages] }),
    signal: AbortSignal.timeout(num(env, 'AI_TIMEOUT_MS')),
  });
  if (!r.ok) throw new Error('ai_http_' + r.status);
  const j = await r.json();
  const u = j.usage || {};
  const text = j.choices && j.choices[0] && j.choices[0].message ? j.choices[0].message.content || '' : '';
  if (typeof onDelta === 'function' && text) onDelta(text);                  // no streaming here: shown in one piece
  return { text, usage: { input: u.prompt_tokens || 0, output: u.completion_tokens || 0, cacheRead: 0, cacheWrite: 0 } };
}

// Local development and tests only (index.js allows it only with DEV_MODE on localhost): no network, no cost.
async function mock(env, { messages, system, onDelta }) {
  const q = (messages[messages.length - 1] || {}).content || '';
  if (system.translate) return { text: `[${system.translate}] ${q}`, usage: {} };
  const ru = /[а-яё]/i.test(q), th = /[฀-๿]/.test(q);
  let text = ru ? 'Тестовый ответ Ча (mock AI).' : th ? 'คำตอบทดสอบจาก Cha (mock AI)' : 'Test answer from Cha (mock AI).';
  if (/ceremon|церемон|พิธี/i.test(q)) text += '\n[[button:ceremonies]]';
  if (/shop|магазин|ร้านออนไลน์|online/i.test(q)) text += '\n[[button:shop]]';
  if (/mock-handoff/.test(q)) text += '\n[[handoff]]';
  if (/mock-fail/.test(q)) throw new Error('ai_http_500');
  if (typeof onDelta === 'function') {                                       // a few pieces, like a real stream
    const words = text.split(/(?<= )/);
    for (let i = 1; i <= words.length; i++) { onDelta(words.slice(0, i).join('')); await new Promise((r) => setTimeout(r, Number(env.MOCK_STREAM_MS) || 0)); }
  }
  return { text, usage: { input: 100, output: 20, cacheRead: 0, cacheWrite: 0 } };
}

export function aiAvailable(env, dev) {
  if (env.AI_ENABLED === '0') return false;                      // kill switch: chat keeps working, AI is off
  if ((env.AI_PROVIDER || 'anthropic') === 'mock') return Boolean(dev);
  return Boolean(env.AI_API_KEY);
}

export async function complete(env, req, fetchImpl = fetch) {
  const p = env.AI_PROVIDER || 'anthropic';
  if (p === 'mock') return mock(env, req);
  if (p === 'openai') return openai(env, req, fetchImpl);
  return anthropic(env, req, fetchImpl);
}

/** Exact translation of a staff message or a visitor question. Never adds anything. */
export async function translate(env, text, targetName, fetchImpl = fetch) {
  const rules = `You translate messages between a tea house team and its guests. Translate the user's message into ${targetName}.
Keep the meaning exactly: every number, price, date, time, name, address, link and condition must stay unchanged. Do not add, remove, soften or explain anything, do not answer the message, do not add greetings. Output only the translation.`;
  const r = await complete(env, { system: { rules, knowledge: '-', live: '-', translate: targetName },
    messages: [{ role: 'user', content: text }], maxTokens: Math.min(1000, text.length * 3 + 50) }, fetchImpl);
  return { text: String(r.text || '').trim(), usage: r.usage };
}
