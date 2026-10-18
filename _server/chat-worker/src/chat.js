// Conversation logic: AI answers, handoff to a person, the Telegram bridge.
// Status machine: ai_active → human_requested → human_active → (returned_to_ai) ai_active | closed.
// While a person is requested or active, the AI never answers in that conversation.
import * as S from './store.js';
import { num, dayKey } from './config.js';
import { t, LANG_NAMES } from './i18n.js';
import { rules, live } from './prompt.js';
import { knowledgeText, eventsText } from './knowledge.js';
import { toChat, parseAnswer, complete, translate, aiAvailable } from './ai.js';
import { tg, telegramReady, isOperator, isStaffChat, keyboard, clip } from './telegram.js';

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

export async function answerWithAI(env, conv, { dev, fetchImpl = fetch, now = Date.now() }) {
  const day = dayKey(now);
  const usage = await S.usageToday(env.DB, day);
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

  const history = toChat(await S.lastMessages(env.DB, conv.id, num(env, 'HISTORY_MESSAGES')));
  const system = { rules: rules(), knowledge: (await knowledgeText(env, now)) || 'No knowledge documents are loaded. Offer to contact the team.',
    live: live(conv.lang, await eventsText(env, now, fetchImpl), now) };
  let res;
  try {
    res = await complete(env, { system, messages: history, maxTokens: num(env, 'AI_MAX_TOKENS') }, fetchImpl);
  } catch (e) {
    log('ai_error', String(e.message || '').slice(0, 40));
    await S.addUsage(env.DB, day, { errors: 1 });
    return [await S.addMessage(env.DB, conv.id, { sender: 'system', text: t('ai_error', conv.lang), meta: { buttons: CONTACT_BUTTONS(conv.lang) } })];
  }
  await S.addUsage(env.DB, day, { calls: 1, ...res.usage });
  await budgetAlert(env, usage.ai_calls + 1, limitDay, day, fetchImpl);

  const a = parseAnswer(res.text);
  const out = [];
  if (a.text) out.push(await S.addMessage(env.DB, conv.id, { sender: 'assistant', text: a.text, meta: a.buttons.length ? { buttons: a.buttons } : null }));
  if (a.handoff) out.push(...(await requestHuman(env, conv, { fetchImpl })));
  if (!out.length) out.push(await S.addMessage(env.DB, conv.id, { sender: 'system', text: t('ai_error', conv.lang), meta: { buttons: CONTACT_BUTTONS(conv.lang) } }));
  return out;
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
//  • TELEGRAM_TOPICS=1 – the group is a forum: each conversation gets its own topic, and any message
//    an operator writes in that topic goes to the visitor (the bot must be an admin to see them);
//  • otherwise – Reply to any bot message about the conversation (privacy mode lets the bot see replies only).
const topics = (env) => env.TELEGRAM_TOPICS === '1';

/** Sends a message about a conversation to the staff group (its topic, or as a reply in the thread) and links it. */
async function staffSend(env, conv, payload, fetchImpl) {
  const where = topics(env) && conv.tg_thread_id ? { message_thread_id: conv.tg_thread_id }
    : conv.tg_root_message_id && !payload.reply_markup ? { reply_parameters: { message_id: conv.tg_root_message_id, allow_sending_without_reply: true } } : {};
  const sent = await tg(env, 'sendMessage', { chat_id: env.TELEGRAM_STAFF_CHAT_ID, disable_web_page_preview: true, ...where, ...payload }, fetchImpl);
  if (sent) await S.linkTelegram(env.DB, env.TELEGRAM_STAFF_CHAT_ID, sent.message_id, conv.id);   // a reply to any of them routes back
  return sent;
}

async function ensureTopic(env, conv, fetchImpl) {
  if (!topics(env)) return conv;
  if (conv.tg_thread_id) {
    await tg(env, 'reopenForumTopic', { chat_id: env.TELEGRAM_STAFF_CHAT_ID, message_thread_id: conv.tg_thread_id }, fetchImpl);
    return conv;
  }
  const t = await tg(env, 'createForumTopic', { chat_id: env.TELEGRAM_STAFF_CHAT_ID, name: `${conv.code} – ${conv.lang.toUpperCase()}` }, fetchImpl);
  if (!t || !t.message_thread_id) { log('topic_failed'); return conv; }       // falls back to replies in the main chat
  await S.setStatus(env.DB, conv.id, conv.status, { tg_thread_id: t.message_thread_id });
  return { ...conv, tg_thread_id: t.message_thread_id };
}

export async function requestHuman(env, conv, { fetchImpl = fetch } = {}) {
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
  text += topics(env) && conv.tg_thread_id ? '\n\nWrite in this topic to answer the visitor on the website.'
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
  return [await S.addMessage(env.DB, conv.id, { sender: 'system', text: t('handoff_requested', conv.lang), meta: { event: 'handoff_requested' } })];
}

/** A visitor message while a person is requested/active goes to the staff group (its topic or the reply thread). */
export async function forwardToStaff(env, conv, text, { fetchImpl = fetch, label = 'Visitor' } = {}) {
  let body = topics(env) && conv.tg_thread_id ? `${label}:\n${clip(text, 3000)}` : `${conv.code} (${conv.lang.toUpperCase()}), ${label.toLowerCase()}:\n${clip(text, 3000)}`;
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

export async function handleUpdate(env, u, { fetchImpl = fetch } = {}) {
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
      await tg(env, 'editMessageReplyMarkup', { chat_id: q.message.chat.id, message_id: q.message.message_id, reply_markup: keyboard(conv.id, 'human_active') }, fetchImpl);
      await answer(topics(env) && conv.tg_thread_id ? 'You are in. Write in this topic.' : 'You are in. Reply to the bot messages to answer.');
      await staffSend(env, conv, { text: `${conv.code}: taken by ${who}` }, fetchImpl);
      return 'taken';
    }
    if (act === 'c' || act === 'a') {
      const closing = act === 'c';
      await S.setStatus(env.DB, conv.id, closing ? 'closed' : 'ai_active');
      await S.closeHandoff(env.DB, conv.id, closing ? 'closed' : 'returned_to_ai');
      await S.addMessage(env.DB, conv.id, { sender: 'system', text: t(closing ? 'closed' : 'returned_to_ai', conv.lang), meta: { event: closing ? 'closed' : 'returned_to_ai' } });
      await tg(env, 'editMessageReplyMarkup', { chat_id: q.message.chat.id, message_id: q.message.message_id, reply_markup: { inline_keyboard: [] } }, fetchImpl);
      await answer(closing ? 'Closed' : 'Returned to the AI');
      await staffSend(env, conv, { text: `${conv.code}: ${closing ? 'closed' : 'returned to the AI'} by ${who}` }, fetchImpl);
      if (closing && topics(env) && conv.tg_thread_id) await tg(env, 'closeForumTopic', { chat_id: env.TELEGRAM_STAFF_CHAT_ID, message_thread_id: conv.tg_thread_id }, fetchImpl);
      return closing ? 'closed' : 'returned';
    }
    await answer('Unknown action');
    return 'unknown';
  }

  const m = u.message;
  if (!m || !m.chat) return 'ignored';
  // Setup helper: an operator writes /chatid in a group – the bot answers with that group's id (needed for TELEGRAM_STAFF_CHAT_ID)
  if (typeof m.text === 'string' && /^\/chatid(@\w+)?$/.test(m.text.trim()) && isOperator(env, m.from && m.from.id)) {
    await tg(env, 'sendMessage', { chat_id: m.chat.id, text: `chat id: ${m.chat.id}${m.chat.is_forum ? ' (topics on)' : ''}`,
      ...(m.message_thread_id ? { message_thread_id: m.message_thread_id } : {}) }, fetchImpl);
    return 'chatid';
  }
  if (!isStaffChat(env, m.chat.id)) return 'ignored';                                   // only the staff group
  // Which conversation? Its topic (forum mode), or the bot message this one replies to
  let conv = null;
  if (topics(env) && m.is_topic_message && Number.isInteger(m.message_thread_id)) conv = await S.convByThread(env.DB, m.message_thread_id);
  if (!conv && m.reply_to_message && !(m.reply_to_message.forum_topic_created)) conv = await S.convByTelegram(env.DB, m.chat.id, m.reply_to_message.message_id);
  if (!conv) return 'ignored';                                                          // normal group talk
  if (!isOperator(env, m.from && m.from.id)) {
    if (m.from && m.from.is_bot) return 'ignored';
    await tg(env, 'sendMessage', { chat_id: m.chat.id, text: 'Only authorised team members can answer website visitors.',
      ...(m.message_thread_id ? { message_thread_id: m.message_thread_id } : {}),
      reply_parameters: { message_id: m.message_id, allow_sending_without_reply: true } }, fetchImpl);
    return 'forbidden';
  }
  const text = typeof m.text === 'string' ? m.text.trim() : '';
  if (!text) {
    if (!MEDIA.some((k) => m[k])) return 'ignored';                                      // service messages (topic created, pinned…)
    await tg(env, 'sendMessage', { chat_id: m.chat.id, text: 'Only text messages can be sent to the website chat.',
      ...(m.message_thread_id ? { message_thread_id: m.message_thread_id } : {}),
      reply_parameters: { message_id: m.message_id, allow_sending_without_reply: true } }, fetchImpl);
    return 'not_text';
  }
  if (text.startsWith('/')) return 'ignored';                                          // bot commands are not for visitors
  // Writing is enough to take the conversation over (no separate "Take over" click needed)
  if (conv.status !== 'human_active') await operatorJoins(env, conv, m.from);

  let shown = clip(text, 3000), meta = null;
  const staffWroteRussian = /[а-яё]/i.test(text);
  if (env.TRANSLATE === '1' && conv.lang !== 'ru' && staffWroteRussian) {
    const tr = await translate(env, text, LANG_NAMES[conv.lang] || 'English', fetchImpl).catch(() => null);
    if (tr && tr.text) {
      shown = clip(tr.text, 3000);
      meta = { translated: t('translated', conv.lang) };
      await tg(env, 'sendMessage', { chat_id: m.chat.id, text: `Sent to the visitor (${conv.lang.toUpperCase()}, automatic translation):\n${shown}`,
        ...(m.message_thread_id ? { message_thread_id: m.message_thread_id } : {}),
        reply_parameters: { message_id: m.message_id, allow_sending_without_reply: true } }, fetchImpl);
    }
  }
  await S.addMessage(env.DB, conv.id, { sender: 'operator', text: shown, meta });
  await S.linkTelegram(env.DB, m.chat.id, m.message_id, conv.id);      // replies to this message route too
  await tg(env, 'setMessageReaction', { chat_id: m.chat.id, message_id: m.message_id, reaction: [{ type: 'emoji', emoji: '👍' }] }, fetchImpl);
  log('operator_message');
  return 'delivered';
}
