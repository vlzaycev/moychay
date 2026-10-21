const fs = require('fs');
const path = require('path');

const CSV_FIXTURE = fs.readFileSync(path.join(__dirname, 'fixtures', 'events.csv'), 'utf8');
const EXPORT_URL = /docs\.google\.com\/spreadsheets\/.*\/export\?format=csv/;
const EVENTS_URL = /\/api\/events(\?|$)/;
const WORKER_EVENTS = path.join(__dirname, '..', '..', '_server', 'chat-worker', 'src', 'events.js');

/** The site reads GET /api/events (the chat Worker). Tests answer it with the Worker's own filter applied to a fixed sheet,
 *  so what the browser gets is exactly what production would send for that sheet. */
async function mockEvents(page, csv = CSV_FIXTURE, status = 200) {
  const { publicEvents } = await import(WORKER_EVENTS);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date());
  await page.route(EVENTS_URL, (route) => {
    if (status === 0) return route.abort();
    if (status !== 200) return route.fulfill({ status, contentType: 'application/json', body: '{"ok":false,"error":"unavailable"}' });
    return route.fulfill({ status, contentType: 'application/json; charset=utf-8', body: JSON.stringify({ ok: true, events: publicEvents(csv, today) }) });
  });
}

/** Collect uncaught page errors and console errors (third-party noise filtered). */
function watchErrors(page) {
  const errors = [];
  // Turnstile error 110200 = 'domain not allowed': the widget is registered for teaphuket.com only, so it fires on localhost runs
const noise = /googletagmanager|mc\.yandex|facebook|fonts\.g|maps\.google|google\.com\/maps|gstatic|doubleclick|ERR_BLOCKED_BY_CLIENT|favicon|Turnstile\] Error: 110200/i;
  page.on('pageerror', (e) => { if (!noise.test(e.message)) errors.push('pageerror: ' + e.message); });
  page.on('console', (m) => { if (m.type() === 'error' && !noise.test(m.text())) errors.push('console: ' + m.text()); });
  page.on('requestfailed', (r) => {
    const u = r.url();
    if (!noise.test(u) && !EXPORT_URL.test(u) && !EVENTS_URL.test(u) && !/googleusercontent/.test(u)) errors.push('requestfailed: ' + u + ' ' + (r.failure() || {}).errorText);
  });
  return errors;
}

const PAGES = [
  { lang: 'en', path: '/', h1: 'Moychay Phuket', h1sub: 'Tea house & tea ceremonies in Bangtao, Phuket', directions: 'Get directions', msg: /wa\.me\/66817959110/, msgIcon: '#i-wa' },
  { lang: 'ru', path: '/ru/', h1: 'Moychay Phuket', h1sub: 'Чайная и чайные церемонии на Пхукете', directions: 'Проложить маршрут', msg: /t\.me\//, msgIcon: '#i-tg' },
];

module.exports = { mockEvents, watchErrors, PAGES, CSV_FIXTURE, EXPORT_URL, EVENTS_URL };
