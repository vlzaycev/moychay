// Server-side validation of contact / wholesale enquiries from teaphuket.com.
// Pure functions, no I/O: used by the Worker and by the unit tests (_qa/unit/contact.test.mjs).

export const LIMITS = { name: 100, company: 150, email: 200, contact_value: 64, message: 3000, page_path: 200 };
export const MIN_FILL_MS = 3000;   // a human needs more than 3 s to fill the form

const EMAIL = /^[^\s@<>()"',;:]+@[^\s@<>()"',;:]+\.[^\s@<>()"',;:]{2,}$/;

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

function clean(v, max) {
  // strip control characters (keep line breaks in messages), trim, cut to the limit
  return String(v ?? '').replace(/[\u0000-\u0009\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max);
}

/**
 * @returns {{ok:true, data:object} | {ok:false, spam?:true, errors:object}}
 * errors: { field: code } with codes matching the site's i18n keys: required, email, phone, tg, short
 */
export function validate(body, now = Date.now()) {
  if (!body || typeof body !== 'object') return { ok: false, errors: { form: 'invalid' } };

  // Bots: the hidden "website" field is filled, or the form was sent faster than a human could type
  if (clean(body.website, 200) || (Number(body.elapsed_ms) || 0) < MIN_FILL_MS) return { ok: false, spam: true, errors: {} };

  const kind = body.inquiry_type === 'wholesale' ? 'wholesale' : 'contact';
  const lang = body.page_language === 'ru' ? 'ru' : 'en';
  const method = body.contact_method === 'telegram' ? 'telegram' : 'whatsapp';
  const d = {
    inquiry_type: kind,
    name: clean(body.name, LIMITS.name),
    company: kind === 'wholesale' ? clean(body.company, LIMITS.company) : '',
    email: clean(body.email, LIMITS.email).toLowerCase(),
    contact_method: method,
    contact_value: clean(body.contact_value, LIMITS.contact_value),
    message: clean(body.message, LIMITS.message),
    page_language: lang,
    page_path: /^\/[\w\-/]*$/.test(String(body.page_path || '')) ? String(body.page_path).slice(0, LIMITS.page_path) : '/',
    submitted_at: new Date(now).toISOString(),   // server time is the source of truth
  };

  const errors = {};
  if (!d.name) errors.name = 'required';
  if (kind === 'wholesale' && !d.company) errors.company = 'required';
  if (!d.email) errors.email = 'required';
  else if (!EMAIL.test(d.email)) errors.email = 'email';
  if (d.contact_value) {
    const v = method === 'whatsapp' ? normalizeWhatsapp(d.contact_value) : normalizeTelegram(d.contact_value);
    if (!v) errors.contact_value = method === 'whatsapp' ? 'phone' : 'tg';
    else d.contact_value = v;
  }
  if (!d.message) errors.message = 'required';
  else if (d.message.length < 5) errors.message = 'short';

  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, data: d };
}
