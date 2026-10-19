// Limits and settings. Anything that may need tuning in production is also readable from
// Worker variables (wrangler.toml [vars]) – see num() – so no code change is needed.
import ASSISTANT from '../../../_content/assistant/assistant.json' with { type: 'json' };

export { ASSISTANT };
export const LANGS = ['en', 'ru', 'th'];
export const STATUSES = ['ai_active', 'human_requested', 'human_active', 'closed'];
export const ALLOWED_ORIGINS = ['https://teaphuket.com'];
export const SITE = 'https://teaphuket.com';

export const DEFAULTS = {
  MAX_BODY: 8 * 1024,          // bytes per request
  MAX_TEXT: 1000,              // characters per visitor message
  MAX_CONTACT: 120,            // "leave a contact" field
  HISTORY_MESSAGES: 12,        // messages of the conversation sent to the model
  AI_MAX_TOKENS: 450,          // max answer length
  AI_TIMEOUT_MS: 20000,
  AI_LOCK_MS: 30000,           // one AI request at a time per conversation
  AI_PER_CONVERSATION: 30,     // AI answers per conversation
  HUMAN_IDLE_HOURS: 12,        // no team activity for this long: the visitor is back with Cha (F-03)
  AI_DAILY_LIMIT: 1000,        // AI calls per day for the whole site (hard stop)
  AI_DAILY_WARN: 0.8,          // Telegram alert to staff at 80 % of the daily limit
  STARTS_PER_IP_DAY: 10,       // new conversations per visitor IP per day
  MESSAGES_PER_IP_DAY: 150,    // visitor messages per IP per day
  KB_MAX_CHARS: 60000,         // knowledge sent to the model (~15k tokens max)
  RETENTION_DAYS: ASSISTANT.retention_days || 30,
};

/** Numeric setting: Worker variable if set and valid, otherwise the default. */
export function num(env, key) {
  const v = Number(env && env[key]);
  return Number.isFinite(v) && v > 0 ? v : DEFAULTS[key];
}

// Buttons the assistant may attach to an answer. The browser maps each key to a fixed URL –
// the model never produces links that become clickable buttons.
export const BUTTONS = ['ceremonies', 'tea', 'matcha', 'events', 'wholesale', 'contact', 'shop', 'directions', 'whatsapp', 'telegram'];

export const dayKey = (now = Date.now()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now));

export const bangkokNow = (now = Date.now()) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Bangkok', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(now));

/** Local development only: mock AI and no Turnstile, never on the real domain. */
export function devMode(env, url) {
  return env.DEV_MODE === '1' && /^(127\.0\.0\.1|localhost)$/.test(new URL(url).hostname);
}
