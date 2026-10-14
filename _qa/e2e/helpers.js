const fs = require('fs');
const path = require('path');

const CSV_FIXTURE = fs.readFileSync(path.join(__dirname, 'fixtures', 'events.csv'), 'utf8');
const EXPORT_URL = /docs\.google\.com\/spreadsheets\/.*\/export\?format=csv/;

/** Serve a fixed events sheet instead of the live Google Sheet (deterministic tests). */
async function mockEvents(page, body = CSV_FIXTURE, status = 200) {
  await page.route(EXPORT_URL, (route) =>
    status === 0 ? route.abort() : route.fulfill({ status, body, contentType: 'text/csv; charset=utf-8' }));
}

/** Collect uncaught page errors and console errors (third-party noise filtered). */
function watchErrors(page) {
  const errors = [];
  const noise = /googletagmanager|mc\.yandex|facebook|fonts\.g|maps\.google|google\.com\/maps|gstatic|doubleclick|ERR_BLOCKED_BY_CLIENT|favicon/i;
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !noise.test(m.text())) errors.push('console: ' + m.text()); });
  page.on('requestfailed', (r) => {
    const u = r.url();
    if (!noise.test(u) && !EXPORT_URL.test(u) && !/googleusercontent/.test(u)) errors.push('requestfailed: ' + u + ' ' + (r.failure() || {}).errorText);
  });
  return errors;
}

const PAGES = [
  { lang: 'en', path: '/', h1: 'Moychay Phuket', h1sub: 'Tea house & tea ceremonies in Bangtao, Phuket', directions: 'Get directions', msg: /wa\.me\/66817959110/, msgIcon: '#i-wa' },
  { lang: 'ru', path: '/ru/', h1: 'Moychay Phuket', h1sub: 'Чайная и чайные церемонии на Пхукете', directions: 'Проложить маршрут', msg: /t\.me\//, msgIcon: '#i-tg' },
];

module.exports = { mockEvents, watchErrors, PAGES, CSV_FIXTURE, EXPORT_URL };
