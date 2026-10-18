// Conversation logic: AI answers, handoff to a person, the Telegram bridge.
// Status machine: ai_active → human_requested → human_active → (returned_to_ai) ai_active | closed.
// While a person is requested or active, the AI never answers in that conversation.
import * as S from './store.js';
import { num, dayKey } from './config.js';
import { t, LANG_NAMES } from './i18n.js';
import { rules, live } from './prompt.js';
import { knowledgeText, eventsText } from './knowledge.js';
import { toChat, parseAnswer, visiblePart, complete, translate, aiAvailable } from './ai.js';
import { tg, tgCall, telegramReady, isOperator, isStaffChat, keyboard, clip } from './telegram.js';
import { leak, REFUSAL } from './guard.js';

const log = (e, x = '') => console.log(`chat:${e}${x ? ' ' + x : ''}`);   // codes only, never message text
const CONTACT_BUTTONS = (lang) => (lang === 'ru' ? ['telegram', 'whatsapp', 'contact'] : ['whatsapp', 'telegram', 'contact']);

// Explicit requests for a person. Deliberately narrow: "600฿ per person" must not call the team.
const WANTS_HUMAN = [
  /\b(human|real person|live (agent|person|chat|support)|operator|(talk|speak|chat) (to|with) (a |an |the |your |some ?one from (the |your )?)?(team|staff|person|manager|human|someone|somebody|admin))\b/i,
  /(живо(й|го|му) (человек|сотрудник|оператор)|оператор|позов\S* (сотрудник|человек|менеджер|администратор|кого-нибудь)|(связ\S*|поговорить|пообщаться) с (сотрудник|человек|менеджер|администратор|командой))/i,
  /(คุยกับ(พนักงาน|เจ้าหน้าที่|คน|ทีม|แอดมิน)|ขอคุยกับ|ติดต่อ(พนักงาน|เจ้าหน้าที่))/,
];
export const wantsHuman = (text) => WANTS_HUMAN.some((r) => r.test(text));

/* ── AI answer ─────────────────────────────────────────────────────────── */

// Text that may contain a credential is never streamed: the complete answer is checked first
const RISKY = /sk-|\d{6,}:|cs_|BEGIN |AKIA|0x4AAAA/;

/**
 * Answers the visitor's last message. opts.onDelta(text) receives the visible part of the answer while it is
 * written (streaming); opts.timing gets the stage times (ms since the request) for the perf log.
 */
export async function answerWithAI(env, conv, { dev, fetchImpl = fetch, now = Date.now(), onDelta, waitUntil, timing = {} }) {
  const day = dayKey(now);
  const clock = timing.t0 ? () => Date.now() - timing.t0 : () => 0;
  // everything the answer needs, read in parallel (one round of waiting instead of four)
  const [usage, rows, kb, ev] = await Promise.all([
    S.usageToday(env.DB, day),
    S.lastMessages(env.DB, conv.id, num(env, 'HISTORY_MESSAGES')),
    knowledgeText(env, now),
    eventsText(env, now, fetchImpl, waitUntil),
  ]);
  const limitDay = num(env, 'AI_DAILY_LIMIT');
  if (!aiAvailable(env, dev) || usage.ai_calls >= limitDay) {
    log('ai_off');
    return [await S.addMessage(env.DB, conv.id, { sender: 'system', text: t('ai_unavailable', conv.lang), meta: { buttons: CONTACT_BUTTONS(conv.lang), event: 'ai_unavailable' } })];
  }
  if (conv.ai_calls >= num(env, 'AI_PER_CONVERSATION')) {
    return [await S.addMessage(env.DB, conv.id, { sender: 'system', text: t('limit', conv.lang), meta: { buttons: CONTACT_BUTTONS(conv.lang) } })];
  }
  if (env.RL_AI && !(await env.RL_AI.limit({ key: 'all' })).success) {         // site-wide AI calls per minute
    return [await S.addMessage(env.DB, conv.id, { sender: 'system', text: t('ai_error', conv.lang), meta: { buttons: ['human'] } })];
  }

  const history = toChat(rows);
  const system = { rules: rules(), knowledge: kb || 'No knowledge documents are loaded. Offer to contact the team.', live: live(conv.lang, ev, now) };
  let shown = '', blocked = false;
  const delta = typeof onDelta === 'function' ? (raw) => {
    if (!timing.ttft) timing.ttft = clock();
    if (blocked) return;
    const v = visiblePart(raw);
    if (RISKY.test(v) || leak(v, env)) { blocked = true; return; }   // the checked final text replaces it
    if (v !== shown) { shown = v; onDelta(v); }
  } : undefined;
  let res;
  timing.ai0 = clock();
  try {
    res = await complete(env, { system, messages: history, maxTokens: num(env, 'AI_MAX_TOKENS'), onDelta: delta }, fetchImpl);
  } catch (e) {
    log('ai_error', String(e.message || '').slice(0, 40));
    await after(waitUntil, S.addUsage(env.DB, day, { errors: 1 }));
    return [await S.addMessage(env.DB, conv.id, { sender: 'system', text: t('ai_error', conv.lang), meta: { buttons: CONTACT_BUTTONS(conv.lang) } })];
  }
  timing.ai1 = clock();
  if (!timing.ttft) timing.ttft = timing.ai1;
  // bookkeeping does not delay the answer
  await after(waitUntil, S.addUsage(env.DB, day, { calls: 1, ...res.usage }).then(() => budgetAlert(env, usage.ai_calls + 1, limitDay, day, fetchImpl)));

  const a = parseAnswer(res.text);
  const why = leak(a.text, env);
  if (why) {                                                     // never stored, never shown
    log('answer_blocked', why);
    a.text = REFUSAL[conv.lang] || REFUSAL.en; a.buttons = []; a.handoff = false;
  }
  const out = [];
  if (a.text) out.push(await S.addMessage(env.DB, conv.id, { sender: 'assistant', text: a.text, meta: a.buttons.length ? { buttons: a.buttons } : null }));
  if (a.handoff) out.push(...(await requestHuman(env, conv, { fetchImpl, waitUntil })));
  if (!out.length) out.push(await S.addMessage(env.DB, conv.id, { sender: 'system', text: t('ai_error', conv.lang), meta: { buttons: CONTACT_BUTTONS(conv.lang) } }));
  return out;
}

// Work that must finish but nobody waits for (usage counters, Telegram reactions): after the response when possible
function after(waitUntil, p) {
  const q = Promise.resolve(p).catch(() => log('background_error'));
  if (waitUntil) waitUntil(q); else return q;
}

// One Telegram alert per day when AI usage reaches the warning share of the daily limit
async function budgetAlert(env, calls, limit, day, fetchImpl) {
  const warnAt = Math.floor(limit * (Number(env.AI_DAILY_WARN) || 0.8));
  if (calls !== warnAt || !telegramReady(env)) return;
  if ((await S.bump(env.DB, `alert:${day}`, 2 * 86400000)) > 1) return;
  await tg(env, 'sendMessage', { chat_id: env.TELEGRAM_STAFF_CHAT_ID,
    text: `Cha: ${calls} of ${limit} AI answers used today. At the limit the AI switches off until tomorrow (the chat and live support keep working).` }, fetchImpl);
}

/* ── handoff ───────────────────────────────────────────────────────────── */

// Two ways to talk to visitors from the staff group:
//  • TELEGRAM_TOPICS=1 – the group is a forum: each conversation gets its own topic, and any message an
//    operator writes in that topic goes to that visitor only. Routing key: (group id, topic id) → conversation.
//    Messages in "General" or in other topics never reach a visitor (except a Reply to a bot message, below).
//  • always – a Reply to any bot message about a conversation reaches that visitor (tg_links table).
const topics = (env) => env.TELEGRAM_TOPICS === '1';
const inTopic = (env, conv) => topics(env) && conv.tg_thread_id && String(conv.tg_chat_id) === String(env.TELEGRAM_STAFF_CHAT_ID);
const LOST_TOPIC = /thread not found|topic_deleted|topic_closed|message thread/i;

/** Sends a message about a conversation to the staff group (its topic, or as a reply in the thread) and links it. */
async function staffSend(env, conv, payload, fetchImpl) {
  const where = (c) => (inTopic(env, c) ? { message_thread_id: c.tg_thread_id }
    : c.tg_root_message_id && !payload.reply_markup ? { reply_parameters: { message_id: c.tg_root_message_id, allow_sending_without_reply: true } } : {});
  let r = await tgCall(env, 'sendMessage', { chat_id: env.TELEGRAM_STAFF_CHAT_ID, disable_web_page_preview: true, ...where(conv), ...payload }, fetchImpl);
  if (!r.ok && inTopic(env, conv) && LOST_TOPIC.test(r.error)) {
    // the topic was closed or deleted by hand: reopen it, or start a new one, and send again
    log('topic_recover');
    conv = await ensureTopic(env, conv, fetchImpl, { fresh: /deleted|not found/i.test(r.error) });
    r = await tgCall(env, 'sendMessage', { chat_id: env.TELEGRAM_STAFF_CHAT_ID, disable_web_page_preview: true, ...where(conv), ...payload }, fetchImpl);
  }
  if (r.ok) await S.linkTelegram(env.DB, env.TELEGRAM_STAFF_CHAT_ID, r.result.message_id, conv.id);   // a reply to any of them routes back
  return r.ok ? r.result : null;
}

async function ensureTopic(env, conv, fetchImpl, { fresh = false } = {}) {
  if (!topics(env)) return conv;
  if (inTopic(env, conv) && !fresh) {
    await tg(env, 'reopenForumTopic', { chat_id: env.TELEGRAM_STAFF_CHAT_ID, message_thread_id: conv.tg_thread_id }, fetchImpl);
    return conv;
  }
  const t = await tg(env, 'createForumTopic', { chat_id: env.TELEGRAM_STAFF_CHAT_ID, name: `${conv.code} – ${conv.lang.toUpperCase()}` }, fetchImpl);
  if (!t || !Number.isInteger(t.message_thread_id)) { log('topic_failed'); return { ...conv, tg_thread_id: null }; }   // falls back to replies
  await S.setStatus(env.DB, conv.id, conv.status, { tg_chat_id: String(env.TELEGRAM_STAFF_CHAT_ID), tg_thread_id: t.message_thread_id });
  return { ...conv, tg_chat_id: String(env.TELEGRAM_STAFF_CHAT_ID), tg_thread_id: t.message_thread_id };
}

/** "Talk to a person": one friendly line from Cha, the request with context in Telegram, and the waiting status. */
export async function requestHuman(env, conv, { fetchImpl = fetch, ack = false } = {}) {
  conv = await S.conversationById(env.DB, conv.id);
  if (conv.status === 'human_requested' || conv.status === 'human_active') return [];
  if (!telegramReady(env)) {
    log('handoff_no_telegram');
    return [await S.addMessage(env.DB, conv.id, { sender: 'system', text: t('handoff_failed', conv.lang), meta: { buttons: CONTACT_BUTTONS(conv.lang), event: 'handoff_failed' } })];
  }
  const rows = await S.lastMessages(env.DB, conv.id, 8);
  const lastQ = [...rows].reverse().find((m) => m.sender === 'visitor');
  const transcript = rows.filter((m) => m.sender !== 'system')
    .map((m) => `${m.sender === 'visitor' ? 'Visitor' : m.sender === 'operator' ? 'Team' : 'Cha'}: ${clip(m.text, 300)}`).join('\n');
  let text = `New support request\nSession: ${conv.code}\nLanguage: ${conv.lang.toUpperCase()}\nCurrent page: ${conv.start_page}\n\n` +
    `Question:\n${lastQ ? clip(lastQ.text, 1000) : '(no question yet)'}`;
  if (lastQ && env.TRANSLATE === '1' && !/[а-яё]/i.test(lastQ.text)) {
    const tr = await translate(env, lastQ.text, 'Russian', fetchImpl).catch(() => null);
    if (tr && tr.text) text += `\n\nПеревод:\n${clip(tr.text, 1000)}`;
  }
  if (transcript) text += `\n\nRecent messages:\n${clip(transcript, 1500)}`;
  conv = await ensureTopic(env, conv, fetchImpl);
  text += inTopic(env, conv) ? '\n\nJust write in this topic – every message goes to this visitor on the website.'
    : '\n\nAnswer with Reply (swipe left on this message) – the reply goes to the visitor on the website.';

  const sent = await staffSend(env, conv, { text, reply_markup: keyboard(conv.id, 'human_requested') }, fetchImpl);
  if (!sent) {
    log('handoff_telegram_failed');
    return [await S.addMessage(env.DB, conv.id, { sender: 'system', text: t('handoff_failed', conv.lang), meta: { buttons: CONTACT_BUTTONS(conv.lang), event: 'handoff_failed' } })];
  }
  await S.setStatus(env.DB, conv.id, 'human_requested', { tg_root_message_id: sent.message_id });
  await S.openHandoff(env.DB, conv.id);
  await S.addUsage(env.DB, dayKey(), { handoffs: 1 });
  log('handoff');
  const out = [];
  // the visitor pressed the button or asked in words without the AI: Cha still answers like a person would
  if (ack) out.push(await S.addMessage(env.DB, conv.id, { sender: 'assistant', text: t('handoff_ack', conv.lang) }));
  out.push(await S.addMessage(env.DB, conv.id, { sender: 'system', text: t('handoff_requested', conv.lang), meta: { event: 'handoff_requested' } }));
  return out;
}

/** A visitor message while a person is requested/active goes to the staff group (its topic or the reply thread). */
export async function forwardToStaff(env, conv, text, { fetchImpl = fetch, label = 'Visitor' } = {}) {
  const owner = conv.status === 'human_active' && conv.operator_name ? `, for ${conv.operator_name}` : '';
  let body = inTopic(env, conv) ? `${label}:\n${clip(text, 3000)}` : `${conv.code} (${conv.lang.toUpperCase()}${owner}), ${label.toLowerCase()}:\n${clip(text, 3000)}`;
  if (env.TRANSLATE === '1' && !/[а-яё]/i.test(text)) {
    const tr = await translate(env, text, 'Russian', fetchImpl).catch(() => null);
    if (tr && tr.text) body += `\n\nПеревод:\n${clip(tr.text, 1000)}`;
  }
  return Boolean(await staffSend(env, conv, { text: body }, fetchImpl));
}

/* ── Telegram webhook ──────────────────────────────────────────────────── */

async function operatorJoins(env, conv, from) {
  await S.setStatus(env.DB, conv.id, 'human_active', { operator_id: String(from.id), operator_name: clip(String(from.first_name || 'Team'), 40) });
  await S.acceptHandoff(env.DB, conv.id, from.id);
  await S.addMessage(env.DB, conv.id, { sender: 'system', text: t('operator_joined', conv.lang), meta: { event: 'handoff_accepted' } });
}

const MEDIA = ['photo', 'video', 'document', 'voice', 'audio', 'sticker', 'animation', 'video_note', 'location', 'contact'];
const here = (m) => (m.is_topic_message && m.message_thread_id ? { message_thread_id: m.message_thread_id } : {});

export async function handleUpdate(env, u, { fetchImpl = fetch, waitUntil, t0 = Date.now() } = {}) {
  if (!Number.isInteger(u.update_id) || !(await S.firstUpdate(env.DB, u.update_id))) return 'duplicate';

  if (u.callback_query) {
    const q = u.callback_query;
    const answer = (text) => tg(env, 'answerCallbackQuery', { callback_query_id: q.id, text }, fetchImpl);
    if (!q.message || !isStaffChat(env, q.message.chat.id) || !isOperator(env, q.from && q.from.id)) {
      await answer('Not allowed');
      return 'forbidden';
    }
    const [act, id] = String(q.data || '').split(':');
    const conv = await S.conversationById(env.DB, id);
    if (!conv) { await answer('This chat has expired'); return 'unknown'; }
    const who = clip(String(q.from.first_name || 'operator'), 40);
    if (act === 't') {
      if (conv.status === 'human_active') { await answer(`Already taken by ${conv.operator_name || 'a colleague'}`); return 'taken'; }
      await operatorJoins(env, conv, q.from);
      await answer(inTopic(env, conv) ? 'You are in. Just write in this topic.' : 'You are in. Reply to the bot messages to answer.');
      await after(waitUntil, Promise.all([
        tg(env, 'editMessageReplyMarkup', { chat_id: q.message.chat.id, message_id: q.message.message_id, reply_markup: keyboard(conv.id, 'human_active') }, fetchImpl),
        staffSend(env, conv, { text: `${conv.code}: taken by ${who}` }, fetchImpl)]));
      return 'taken';
    }
    if (act === 'c' || act === 'a') {
      if (conv.status === 'closed' || (act === 'a' && conv.status === 'ai_active')) { await answer('Already done'); return 'noop'; }
      const closing = act === 'c';
      await S.setStatus(env.DB, conv.id, closing ? 'closed' : 'ai_active');
      await S.closeHandoff(env.DB, conv.id, closing ? 'closed' : 'returned_to_ai');
      await S.addMessage(env.DB, conv.id, { sender: 'system', text: t(closing ? 'closed' : 'returned_to_ai', conv.lang), meta: { event: closing ? 'closed' : 'returned_to_ai' } });
      await answer(closing ? 'Closed' : 'Returned to the AI');
      await after(waitUntil, (async () => {
        await tg(env, 'editMessageReplyMarkup', { chat_id: q.message.chat.id, message_id: q.message.message_id, reply_markup: { inline_keyboard: [] } }, fetchImpl);
        await staffSend(env, conv, { text: `${conv.code}: ${closing ? 'closed' : 'returned to the AI'} by ${who}` }, fetchImpl);
        if (closing && inTopic(env, conv)) await tg(env, 'closeForumTopic', { chat_id: env.TELEGRAM_STAFF_CHAT_ID, message_thread_id: conv.tg_thread_id }, fetchImpl);
      })());
      return closing ? 'closed' : 'returned';
    }
    await answer('Unknown action');
    return 'unknown';
  }

  const m = u.message;
  if (!m || !m.chat) return 'ignored';
  // Setup helper: an operator writes /chatid in a group – the bot answers with that group's id (needed for TELEGRAM_STAFF_CHAT_ID)
  if (typeof m.text === 'string' && /^\/chatid(@\w+)?$/.test(m.text.trim()) && isOperator(env, m.from && m.from.id)) {
    await tg(env, 'sendMessage', { chat_id: m.chat.id, text: `chat id: ${m.chat.id}${m.chat.is_forum ? ' (topics on)' : ''}`, ...here(m) }, fetchImpl);
    return 'chatid';
  }
  if (!isStaffChat(env, m.chat.id)) return 'ignored';                                   // only the staff group
  // Which conversation? The topic (group id + topic id), else the bot message this one replies to.
  // Never "the latest visitor": a message in General or an unknown topic reaches nobody.
  let conv = null;
  if (topics(env) && m.is_topic_message && Number.isInteger(m.message_thread_id)) conv = await S.convByThread(env.DB, m.chat.id, m.message_thread_id);
  if (!conv && m.reply_to_message && !m.reply_to_message.forum_topic_created) conv = await S.convByTelegram(env.DB, m.chat.id, m.reply_to_message.message_id);
  if (!conv) return 'ignored';                                                          // normal group talk
  if (!isOperator(env, m.from && m.from.id)) {
    if (m.from && m.from.is_bot) return 'ignored';
    await tg(env, 'sendMessage', { chat_id: m.chat.id, text: 'Only authorised team members can answer website visitors.', ...here(m),
      reply_parameters: { message_id: m.message_id, allow_sending_without_reply: true } }, fetchImpl);
    return 'forbidden';
  }
  const text = typeof m.text === 'string' ? m.text.trim() : '';
  if (!text) {
    if (!MEDIA.some((k) => m[k])) return 'ignored';                                      // service messages (topic created, pinned…)
    await tg(env, 'sendMessage', { chat_id: m.chat.id, text: 'Only text messages can be sent to the website chat.', ...here(m),
      reply_parameters: { message_id: m.message_id, allow_sending_without_reply: true } }, fetchImpl);
    return 'not_text';
  }
  if (text.startsWith('/')) return 'ignored';                                          // bot commands are not for visitors
  // Writing is enough to take the conversation over (no separate "Take over" click needed);
  // a colleague writing into a chat someone else took keeps the owner, the visitor sees "the team" either way
  if (conv.status !== 'human_active') await operatorJoins(env, conv, m.from);

  let shown = clip(text, 3000), meta = null;
  const staffWroteRussian = /[а-яё]/i.test(text);
  if (env.TRANSLATE === '1' && conv.lang !== 'ru' && staffWroteRussian) {
    const tr = await translate(env, text, LANG_NAMES[conv.lang] || 'English', fetchImpl).catch(() => null);
    if (tr && tr.text) {
      shown = clip(tr.text, 3000);
      meta = { translated: t('translated', conv.lang) };
      await tg(env, 'sendMessage', { chat_id: m.chat.id, text: `Sent to the visitor (${conv.lang.toUpperCase()}, automatic translation):\n${shown}`, ...here(m),
        reply_parameters: { message_id: m.message_id, allow_sending_without_reply: true } }, fetchImpl);
    }
  }
  await S.addMessage(env.DB, conv.id, { sender: 'operator', text: shown, meta });      // from here the visitor's browser can get it
  const stored = Date.now();
  log('operator_message');
  await after(waitUntil, Promise.all([
    S.linkTelegram(env.DB, m.chat.id, m.message_id, conv.id),                         // replies to this message route too
    tg(env, 'setMessageReaction', { chat_id: m.chat.id, message_id: m.message_id, reaction: [{ type: 'emoji', emoji: '👍' }] }, fetchImpl),
    S.addPerf(env.DB, 'tg', { total: stored - t0, pre: Number.isInteger(m.date) ? Math.max(0, t0 - m.date * 1000) : null }),
  ]));
  return 'delivered';
}
