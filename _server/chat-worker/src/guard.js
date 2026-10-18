// Server-side protection of internal information – it does not rely on the model obeying its instructions.
//  1. The model never receives secrets: its context is the rules, the PUBLIC knowledge base (site pages and
//     hand-written public facts, checked by kb-build.mjs), the public events sheet and this conversation only.
//  2. Every answer is checked before it is stored or shown: anything that looks like a key/token, any secret
//     configured in the Worker, or a verbatim piece of the instructions is replaced by a short polite refusal.
//  3. Streaming: the browser shows text while it is written, so the same check runs on every piece (see index.js).
import { rules } from './prompt.js';

const SECRET_KEYS = ['AI_API_KEY', 'TELEGRAM_SUPPORT_BOT_TOKEN', 'TELEGRAM_WEBHOOK_SECRET', 'TURNSTILE_SECRET', 'HASH_SALT', 'TELEGRAM_BOT_TOKEN'];

// Shapes of credentials, whatever their source
const PATTERNS = [
  /sk-(?:ant|proj|live|test)?-?[A-Za-z0-9_-]{20,}/i,          // API keys (Anthropic, OpenAI, Stripe-like)
  /\b\d{8,10}:[A-Za-z0-9_-]{30,}\b/,                          // Telegram bot token
  /\bcs_[A-Za-z0-9_-]{43}\b/,                                  // a visitor session token
  /\b(?:ghp|gho|github_pat)_[A-Za-z0-9_]{20,}/,               // GitHub tokens
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/,                             // AWS-style key ids
  /\b0x4AAAA[A-Za-z0-9_-]{10,}/,                               // Turnstile secret keys
];

// Verbatim pieces of the instructions: every run of 8 words (the tone examples and the suggested refusal
// and quoted sample phrases are meant to be said, so they are left out). 4+ matching runs (≈ 11 words verbatim)
// = the answer quotes the instructions; a short common phrase like "booking happens via WhatsApp" is not enough.
const W = 8;
let shingles = null;
const norm = (s) => String(s).toLowerCase().replace(/[^a-zа-яё0-9฀-๿]+/gi, ' ').trim();
const runs = (s) => { const w = norm(s).split(' ').filter(Boolean), out = []; for (let i = 0; i + W <= w.length; i++) out.push(w.slice(i, i + W).join(' ')); return out; };
function ruleShingles() {
  if (!shingles) {
    const allowed = new Set(Object.values(REFUSAL).flatMap(runs));
    const text = rules().split('Examples of the tone')[0].replace(/«[^»]*»|"[^"]*"/g, ' | ');
    shingles = new Set(text.split('|').flatMap(runs).filter((x) => !allowed.has(x)));
  }
  return shingles;
}

/** Why an answer must not be shown, or '' if it is fine. Never returns the matched text. */
export function leak(text, env = {}) {
  const s = String(text || '');
  if (!s) return '';
  for (const k of SECRET_KEYS) {
    const v = env[k];
    if (typeof v === 'string' && v.length >= 8 && s.includes(v)) return 'secret';
  }
  if (PATTERNS.some((r) => r.test(s))) return 'credential';
  const set = ruleShingles();
  let hits = 0;
  for (const r of runs(s)) if (set.has(r) && ++hits >= 4) return 'instructions';
  return '';
}

export const REFUSAL = {
  en: "We don't share internal information, but I'm happy to help with tea, ceremonies or your visit.",
  ru: 'Внутреннюю информацию мы не публикуем. Но с удовольствием помогу с чаем, церемониями или посещением чайной.',
  th: 'ขออภัยค่ะ เราไม่เปิดเผยข้อมูลภายใน แต่ยินดีช่วยเรื่องชา พิธีชงชา หรือการมาเยี่ยมร้านค่ะ',
};
