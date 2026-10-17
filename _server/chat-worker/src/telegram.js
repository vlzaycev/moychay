// Telegram Bot API for live support (a separate bot from the contact forms – see AI_TEA_ASSISTANT_SETUP.md).
// Secrets: TELEGRAM_SUPPORT_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET. Config: TELEGRAM_STAFF_CHAT_ID, TELEGRAM_OPERATOR_IDS.
// All messages are plain text (no parse_mode): visitor text can never become Telegram markup.

export function telegramReady(env) {
  return Boolean(env.TELEGRAM_SUPPORT_BOT_TOKEN && env.TELEGRAM_STAFF_CHAT_ID && env.TELEGRAM_OPERATOR_IDS && env.TELEGRAM_WEBHOOK_SECRET);
}

/** Calls a Bot API method; returns `result` or null. The URL with the token is never logged or returned. */
export async function tg(env, method, payload, fetchImpl = fetch) {
  try {
    // TELEGRAM_API_BASE: only for local testing with a fake Telegram server; production uses the real API
    const base = (env.TELEGRAM_API_BASE || 'https://api.telegram.org').replace(/\/$/, '');
    const r = await fetchImpl(`${base}/bot${env.TELEGRAM_SUPPORT_BOT_TOKEN}/${method}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(8000) });
    const j = await r.json().catch(() => ({}));
    return r.ok && j.ok ? j.result : null;
  } catch {
    return null;
  }
}

export const isOperator = (env, userId) =>
  String(env.TELEGRAM_OPERATOR_IDS || '').split(',').map((s) => s.trim()).filter(Boolean).includes(String(userId));

export const isStaffChat = (env, chatId) => String(chatId) === String(env.TELEGRAM_STAFF_CHAT_ID).trim();

/** Constant-time comparison of the X-Telegram-Bot-Api-Secret-Token header. */
export function validSecret(env, header) {
  const a = String(header || ''), b = String(env.TELEGRAM_WEBHOOK_SECRET || '');
  if (!b || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

// callback_data: "<action>:<conversation id>" – 34 bytes, well under Telegram's 64-byte limit
export const keyboard = (convId, status) => ({
  inline_keyboard: [status === 'human_active'
    ? [{ text: 'Return to AI', callback_data: `a:${convId}` }, { text: 'Close request', callback_data: `c:${convId}` }]
    : [{ text: 'Take over', callback_data: `t:${convId}` }, { text: 'Close request', callback_data: `c:${convId}` }]],
});

export const clip = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
