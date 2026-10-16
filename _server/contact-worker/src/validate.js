// Server-side validation of contact / wholesale enquiries from teaphuket.com.
// Pure functions, no I/O: used by the Worker and by the unit tests (_qa/unit/contact.test.mjs).
// Nothing from the client is trusted: unknown fields, wrong types and oversize values are rejected, not trimmed.

export const LIMITS = { name: 100, company: 150, email: 254, contact_value: 64, message: 3000, page_path: 100 };
export const MIN_MESSAGE = 5;
export const MAX_LINKS = 3;                 // more links than this in one message looks like spam
export const MIN_FILL_MS = 3000;            // soft signal only: sent by the client, Turnstile is the real check

const FIELDS = new Set(['inquiry_type', 'name', 'company', 'email', 'contact_method', 'contact_value', 'message',
  'page_language', 'page_path', 'submitted_at', 'elapsed_ms', 'website', 'turnstile_token', 'business_type']);
// optional on the wholesale form; the site sends the key, the Telegram message shows the label
export const BUSINESS_TYPES = { restaurant: 'Ресторан / кафе', hotel: 'Отель / курорт', spa: 'SPA / wellness',
  fitness: 'Фитнес / йога', real_estate: 'Недвижимость', other: 'Другое' };

const EMAIL = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*\.[A-Za-z]{2,63}$/;
// control characters (line breaks are allowed only in the message), bidi overrides and zero-width characters:
// they can hide or reorder text in the Telegram notification
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/;
const INVISIBLE = /[​-‏‪-‮⁠-⁤⁦-⁩﻿]/g;
const URLS = /(https?:\/\/|www\.)\S+/gi;
const HAS_URL = /(https?:\/\/|www\.)\S+/i;

// WhatsApp: international format, digits only after an optional "+", 8–15 digits (E.164)
export function normalizeWhatsapp(v) {
  const d = String(v || '').replace(/[\s().-]/g, '');
  return /^\+?[1-9]\d{7,14}$/.test(d) ? '+' + d.replace(/^\+/, '') : null;
}

// Telegram username: 5–32 chars, Latin letters, digits and "_", starts with a letter.
// "@" and a t.me/ link are accepted and stripped; the result is stored without "@".
export function normalizeTelegram(v) {
  const u = String(v || '').trim().replace(/^(https?:\/\/)?t\.me\//i, '').replace(/^@/, '');
  return /^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(u) ? u : null;
}

/**
 * @returns {{ok:true, data:object} | {ok:false, spam?:true, errors:object}}
 * errors: { field: code } – codes match the site's i18n keys: required, email, phone, tg, short, too_long, links, invalid
 */
export function validate(body, now = Date.now()) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, errors: { form: 'invalid' } };
  for (const k of Object.keys(body)) if (!FIELDS.has(k)) return { ok: false, errors: { form: 'invalid' } };
  for (const [k, v] of Object.entries(body)) {
    if (k === 'elapsed_ms') { if (typeof v !== 'number') return { ok: false, errors: { form: 'invalid' } }; }
    else if (typeof v !== 'string') return { ok: false, errors: { form: 'invalid' } };
  }

  // Bots: the hidden "website" field is filled, or the form was sent faster than a human could type
  if (body.website || (body.elapsed_ms || 0) < MIN_FILL_MS) return { ok: false, spam: true, errors: {} };

  if (!['contact', 'wholesale'].includes(body.inquiry_type)) return { ok: false, errors: { form: 'invalid' } };
  if (!['en', 'ru'].includes(body.page_language)) return { ok: false, errors: { form: 'invalid' } };
  if (!['whatsapp', 'telegram'].includes(body.contact_method)) return { ok: false, errors: { form: 'invalid' } };
  const kind = body.inquiry_type;

  const errors = {};
  const text = (name, { multiline = false } = {}) => {
    let v = String(body[name] ?? '').normalize('NFC').replace(INVISIBLE, '').replace(/\r\n?/g, '\n');
    v = multiline ? v.replace(/\n{3,}/g, '\n\n').trim() : v.trim();
    if (v.length > LIMITS[name]) errors[name] = 'too_long';
    else if (CONTROL.test(v) || (!multiline && /\n/.test(v))) errors[name] = 'invalid';
    return v;
  };

  const d = {
    inquiry_type: kind,
    name: text('name'),
    company: kind === 'wholesale' ? text('company') : '',
    business_type: String(body.business_type || ''),
    email: text('email').toLowerCase(),
    contact_method: body.contact_method,
    contact_value: text('contact_value'),
    message: text('message', { multiline: true }),
    page_language: body.page_language,
    page_path: String(body.page_path || ''),
    submitted_at: new Date(now).toISOString(),   // server time is the source of truth
  };
  // the form lives only on /contact/ and /wholesale/ (+ /ru/): path, kind and language must agree
  const m = d.page_path.match(/^\/(ru\/)?(contact|wholesale)\/$/);
  if (!m || m[2] !== kind || (m[1] ? 'ru' : 'en') !== d.page_language) return { ok: false, errors: { form: 'invalid' } };

  if (d.business_type && (kind !== 'wholesale' || !Object.hasOwn(BUSINESS_TYPES, d.business_type))) errors.business_type = 'invalid';
  if (!errors.name && !d.name) errors.name = 'required';
  if (!errors.name && HAS_URL.test(d.name)) errors.name = 'invalid';
  if (kind === 'wholesale' && !errors.company && !d.company) errors.company = 'required';
  if (!errors.email && !d.email) errors.email = 'required';
  else if (!errors.email && !EMAIL.test(d.email)) errors.email = 'email';
  if (!errors.contact_value && d.contact_value) {
    const v = d.contact_method === 'whatsapp' ? normalizeWhatsapp(d.contact_value) : normalizeTelegram(d.contact_value);
    if (!v) errors.contact_value = d.contact_method === 'whatsapp' ? 'phone' : 'tg';
    else d.contact_value = v;
  }
  if (!errors.message && !d.message) errors.message = 'required';
  else if (!errors.message && d.message.length < MIN_MESSAGE) errors.message = 'short';
  else if (!errors.message && (d.message.match(URLS) || []).length > MAX_LINKS) errors.message = 'links';

  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, data: d };
}
