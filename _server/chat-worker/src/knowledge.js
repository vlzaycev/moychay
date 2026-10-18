// Business knowledge (D1, uploaded with `npm run kb:push`) and live data (events schedule).
// Both are cached inside the Worker isolate for a few minutes: no extra database reads per message.
// The events sheet is external text: markers and tags are removed from it (it cannot add buttons, a handoff
// or fake documents), and a slow Google answer never holds up a reply – the last known schedule is used
// while a fresh copy loads in the background (stale-while-revalidate).
import { knowledge as loadDocs } from './store.js';
import { num, dayKey } from './config.js';

let kbCache = { at: 0, text: '' };
let evCache = { at: 0, text: '' };
const KB_TTL = 5 * 60 * 1000;
const EV_TTL = 10 * 60 * 1000;

export function resetCaches() { kbCache = { at: 0, text: '' }; evCache = { at: 0, text: '' }; evLoading = null; }

export async function knowledgeText(env, now = Date.now()) {
  if (kbCache.text && now - kbCache.at < KB_TTL) return kbCache.text;
  const docs = await loadDocs(env.DB);
  let text = docs.map((d) => `<document id="${d.id}" title="${d.title.replace(/"/g, "'")}">\n${defang(d.body.trim())}\n</document>`).join('\n\n');
  const max = num(env, 'KB_MAX_CHARS');
  if (text.length > max) text = text.slice(0, max);       // hard cap on prompt size (cost control)
  kbCache = { at: now, text };
  return text;
}

/** External or editable text inside the prompt: no chat markers, no document tags. */
export const defang = (s) => String(s).replace(/\[\[|\]\]/g, '').replace(/<\/?\s*document[^>]*>/gi, '');

/* ── events: the same public Google Sheet the site uses (SITE.EVENTS_SHEET) ── */

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
function toISO(s) {
  s = (s || '').trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : '';
}

export function eventsFromCSV(csv, today, days = 30) {
  const data = parseCSV(csv).filter((r) => r.join('').trim());
  const head = (data.shift() || []).map((h) => h.trim().toLowerCase());
  const limit = new Date(Date.parse(today) + days * 86400000).toISOString().slice(0, 10);
  return data.map((c) => {
    const g = (n) => { const i = head.indexOf(n); return i < 0 ? '' : String(c[i] || '').trim(); };
    return { date: toISO(g('date')), time: g('time'), title: g('title_en') || g('title_ru'), title_ru: g('title_ru'),
      price: g('price_en') || g('price_ru'), text: (g('text_en') || g('text_ru')).slice(0, 300), link: g('link'), show: g('show').toLowerCase() };
  }).filter((e) => e.date && e.title && e.date >= today && e.date <= limit && !['no', 'нет', '0', 'false', 'hide'].includes(e.show))
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)).slice(0, 12);
}

let evLoading = null;
export async function eventsText(env, now = Date.now(), fetchImpl = fetch, waitUntil) {
  const fresh = evCache.text && now - evCache.at < EV_TTL;
  if (fresh) return evCache.text;
  if (!evLoading) evLoading = loadEvents(env, now, fetchImpl).then((text) => { evCache = { at: now, text }; return text; }).finally(() => { evLoading = null; });
  if (evCache.text && waitUntil) { waitUntil(evLoading); return evCache.text; }   // stale copy now, fresh one for the next visitor
  return evLoading;
}

async function loadEvents(env, now, fetchImpl) {
  if (!env.EVENTS_SHEET_ID) return 'The live events schedule is not connected. Do not name any upcoming events.';
  try {
    const r = await fetchImpl(`https://docs.google.com/spreadsheets/d/${encodeURIComponent(env.EVENTS_SHEET_ID)}/export?format=csv`,
      { signal: AbortSignal.timeout(3000) });
    if (!r.ok) throw new Error(String(r.status));
    const list = eventsFromCSV(await r.text(), dayKey(now));
    return list.length
      ? 'Upcoming events at the tea house (Asia/Bangkok time; places are not guaranteed, booking via WhatsApp/Telegram):\n' +
        defang(list.map((e) => `- ${e.date}${e.time ? ' ' + e.time : ''}: ${e.title}${e.title_ru && e.title_ru !== e.title ? ` / ${e.title_ru}` : ''}` +
          `${e.price ? ` – ${e.price}` : ''}${e.text ? `. ${e.text}` : ''}${e.link ? ` (${e.link})` : ''}`).join('\n'))
      : 'No upcoming events are published in the schedule for the next 30 days.';
  } catch {
    return 'The events schedule could not be loaded right now. Do not name any upcoming events; point to /events/ and Instagram.';
  }
}
