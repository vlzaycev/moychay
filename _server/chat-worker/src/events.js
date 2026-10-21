// Events schedule from Google Sheets: one place that reads the sheet for both the site (GET /api/events) and Cha.
// The browser never sees the sheet itself – only published, upcoming events and only these fields:
// date, time, title, text, price (EN/RU), details_url, image. Hidden rows (show = no) and any other column
// (notes, contacts, internal prices) never leave the Worker.
//
// Source: EVENTS_CSV_URL (a "Publish to web" CSV of a public tab – lets the sheet itself stay private)
// or EVENTS_SHEET_ID (the sheet's CSV export – needs "anyone with the link").

const HIDE = ['no', 'нет', '0', 'false', 'hide'];
const CSV_TTL = 10 * 60 * 1000;
let csvCache = { at: 0, text: '' };
let csvLoading = null;

export function resetEventsCache() { csvCache = { at: 0, text: '' }; csvLoading = null; }

export function parseCSV(t) {
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) {
      if (c === '"' && t[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

// "2026-10-20", "20.10.2026", "20/10/2026" → ISO date
export function toISO(s) {
  s = (s || '').trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : '';
}

/** A link worth a "Details" button: https, and not just the tea house's Instagram profile. */
export function detailsUrl(s) {
  s = (s || '').trim();
  let u;
  try { u = new URL(s); } catch { return ''; }
  if (u.protocol !== 'https:') return '';
  if (/(^|\.)instagram\.com$/.test(u.hostname) && /^\/[A-Za-z0-9._]+\/?$/.test(u.pathname)) return '';   // a profile, not a post
  return u.href;
}

// "letters", "events/letters.webp", "people/5_people" or an https image URL; anything else is dropped
function cleanImage(s) {
  s = (s || '').trim();
  if (/^(none|no|нет|-)$/i.test(s)) return 'none';
  if (/^https:\/\/[^\s"'<>]+$/.test(s)) return s;
  return /^[A-Za-z0-9/_.-]{1,80}$/.test(s) && !s.includes('..') ? s : '';
}

const clip = (s, n) => (s.length > n ? s.slice(0, n) : s);

/** Published, upcoming events (Asia/Bangkok `today`), nearest first, only the public fields. */
export function publicEvents(csv, today, { days = 0, max = 50 } = {}) {
  const data = parseCSV(csv).filter((r) => r.join('').trim());
  const head = (data.shift() || []).map((h) => h.trim().toLowerCase());
  const limit = days ? new Date(Date.parse(today) + days * 86400000).toISOString().slice(0, 10) : '9999-12-31';
  return data.map((c) => {
    const g = (n) => { const i = head.indexOf(n); return i < 0 ? '' : clip(String(c[i] || '').trim(), 600); };
    return {
      date: toISO(g('date')), time: clip(g('time'), 20),
      title: { en: g('title_en'), ru: g('title_ru') }, text: { en: g('text_en'), ru: g('text_ru') },
      price: { en: clip(g('price_en'), 40), ru: clip(g('price_ru'), 40) },
      details_url: detailsUrl(g('details_url') || g('link')), image: cleanImage(g('image')),
      show: g('show').toLowerCase(),
    };
  }).filter((e) => e.date && (e.title.en || e.title.ru) && e.date >= today && e.date <= limit && !HIDE.includes(e.show))
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)).slice(0, max)
    .map(({ show, ...e }) => e);
}

function sourceUrl(env) {
  if (env.EVENTS_CSV_URL && /^https:\/\/docs\.google\.com\/spreadsheets\/d\/e\/[A-Za-z0-9_-]+\/pub\?/.test(env.EVENTS_CSV_URL)) return env.EVENTS_CSV_URL;
  if (env.EVENTS_SHEET_ID) return `https://docs.google.com/spreadsheets/d/${encodeURIComponent(env.EVENTS_SHEET_ID)}/export?format=csv`;
  return '';
}

/** The sheet as CSV text, cached in the isolate; a stale copy is served while a fresh one loads. Throws if never loaded. */
export async function eventsCSV(env, { now = Date.now(), fetchImpl = fetch, waitUntil } = {}) {
  if (csvCache.text && now - csvCache.at < CSV_TTL) return csvCache.text;
  const url = sourceUrl(env);
  if (!url) throw new Error('not_configured');
  if (!csvLoading) {
    csvLoading = fetchImpl(url, { signal: AbortSignal.timeout(4000) })
      .then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.text(); })
      .then((text) => { csvCache = { at: now, text }; return text; })
      .finally(() => { csvLoading = null; });
  }
  if (csvCache.text) { if (waitUntil) waitUntil(csvLoading.catch(() => {})); return csvCache.text; }
  return csvLoading;
}
