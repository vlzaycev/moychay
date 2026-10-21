// Business knowledge (D1, uploaded with `npm run kb:push`) and live data (events schedule).
// Both are cached inside the Worker isolate for a few minutes: no extra database reads per message.
// The events sheet is external text: markers and tags are removed from it (it cannot add buttons, a handoff
// or fake documents), and a slow Google answer never holds up a reply – the last known schedule is used
// while a fresh copy loads in the background (stale-while-revalidate).
import { knowledge as loadDocs } from './store.js';
import { num, dayKey } from './config.js';
import { publicEvents, eventsCSV, resetEventsCache } from './events.js';

let kbCache = { at: 0, text: '' };
let evCache = { at: 0, text: '' };
const KB_TTL = 5 * 60 * 1000;
const EV_TTL = 10 * 60 * 1000;

export function resetCaches() { kbCache = { at: 0, text: '' }; evCache = { at: 0, text: '' }; evLoading = null; resetEventsCache(); }

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

/* ── events: the same sheet and the same filter as the site's GET /api/events (events.js) ── */

export { parseCSV } from './events.js';

/** Upcoming published events for Cha (next `days` days, max 12) – the fields the site shows, English first. */
export function eventsFromCSV(csv, today, days = 30) {
  return publicEvents(csv, today, { days, max: 12 }).map((e) => ({
    date: e.date, time: e.time, title: e.title.en || e.title.ru, title_ru: e.title.ru,
    price: e.price.en || e.price.ru, text: (e.text.en || e.text.ru).slice(0, 300), link: e.details_url,
  }));
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
  if (!env.EVENTS_SHEET_ID && !env.EVENTS_CSV_URL) return 'The live events schedule is not connected. Do not name any upcoming events.';
  try {
    const list = eventsFromCSV(await eventsCSV(env, { now, fetchImpl }), dayKey(now));
    return list.length
      ? 'Upcoming events at the tea house (Asia/Bangkok time; places are not guaranteed, booking via WhatsApp/Telegram):\n' +
        defang(list.map((e) => `- ${e.date}${e.time ? ' ' + e.time : ''}: ${e.title}${e.title_ru && e.title_ru !== e.title ? ` / ${e.title_ru}` : ''}` +
          `${e.price ? ` – ${e.price}` : ''}${e.text ? `. ${e.text}` : ''}${e.link ? ` (${e.link})` : ''}`).join('\n'))
      : 'No upcoming events are published in the schedule for the next 30 days.';
  } catch {
    return 'The events schedule could not be loaded right now. Do not name any upcoming events; point to /events/ and Instagram.';
  }
}
