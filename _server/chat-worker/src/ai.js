// AI providers behind one function, so the business logic is not tied to a vendor.
//   AI_PROVIDER = anthropic (default) | openai (any OpenAI-compatible endpoint: AI_BASE_URL) | mock (local dev only)
//   AI_MODEL    = e.g. claude-haiku-5-5
//   AI_API_KEY  = secret (wrangler secret put AI_API_KEY)
// One attempt per message, hard timeout, capped output: no retry loops, no runaway costs.
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

/** Model text → { text, buttons, handoff }. Unknown markers and any HTML-looking tags are removed. */
export function parseAnswer(raw) {
  let text = String(raw || '');
  const handoff = HANDOFF.test(text);
  const buttons = [];
  text = text.replace(MARKER, (_, k) => { k = k.toLowerCase(); if (BUTTONS.includes(k) && !buttons.includes(k) && buttons.length < 3) buttons.push(k); return ''; });
  text = text.replace(/\[\[[^\]]*\]\]/g, '')                  // any other marker
    .replace(/<\/?[a-z][^>]*>/gi, '')                           // no HTML (the browser renders text anyway)
    .replace(/^#+\s*/gm, '').replace(/\*\*(.+?)\*\*/g, '$1')    // no Markdown headings / bold
    .replace(/\n{3,}/g, '\n\n').trim();
  return { text, buttons, handoff };
}

async function anthropic(env, { system, messages, maxTokens }, fetchImpl) {
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
    }),
    signal: AbortSignal.timeout(num(env, 'AI_TIMEOUT_MS')),
  });
  if (!r.ok) throw new Error('ai_http_' + r.status);
  const j = await r.json();
  const u = j.usage || {};
  return { text: (j.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\n'),
    usage: { input: u.input_tokens || 0, output: u.output_tokens || 0, cacheRead: u.cache_read_input_tokens || 0, cacheWrite: u.cache_creation_input_tokens || 0 } };
}

async function openai(env, { system, messages, maxTokens }, fetchImpl) {
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
  return { text: j.choices && j.choices[0] && j.choices[0].message ? j.choices[0].message.content || '' : '',
    usage: { input: u.prompt_tokens || 0, output: u.completion_tokens || 0, cacheRead: 0, cacheWrite: 0 } };
}

// Local development and tests only (index.js allows it only with DEV_MODE on localhost): no network, no cost.
function mock(env, { messages, system }) {
  const q = (messages[messages.length - 1] || {}).content || '';
  if (system.translate) return { text: `[${system.translate}] ${q}`, usage: {} };
  const ru = /[а-яё]/i.test(q), th = /[฀-๿]/.test(q);
  let text = ru ? 'Тестовый ответ Ча (mock AI).' : th ? 'คำตอบทดสอบจาก Cha (mock AI)' : 'Test answer from Cha (mock AI).';
  if (/ceremon|церемон|พิธี/i.test(q)) text += '\n[[button:ceremonies]]';
  if (/shop|магазин|ร้านออนไลน์|online/i.test(q)) text += '\n[[button:shop]]';
  if (/mock-handoff/.test(q)) text += '\n[[handoff]]';
  if (/mock-fail/.test(q)) throw new Error('ai_http_500');
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
