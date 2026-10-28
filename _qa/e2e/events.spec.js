// Events block (Google Sheet → chat Worker GET /api/events → cards): ordering, filtering, XSS safety, links, error/empty states.
const { test, expect } = require('./test');
const { mockEvents, PAGES, EVENTS_URL } = require('./helpers');

const HEADER = 'date,time,title_en,title_ru,text_en,text_ru,price_en,price_ru,link,show\n';

for (const p of PAGES) {
  test.describe(`events ${p.lang}`, () => {
    test('past and hidden events filtered, nearest first, price formatted', async ({ page }) => {
      await mockEvents(page);
      await page.goto(p.path + '#events');
      const cards = page.locator('#evRow .evc:not(.evc-skel)');
      await expect(cards).toHaveCount(3);
      const titles = await cards.locator('h3').allTextContents();
      expect(titles.join('|')).not.toMatch(/PAST|ПРОШЕДШЕЕ|HIDDEN|СКРЫТОЕ/);
      // 28.12 (xss row) → 30.12 → 31.12
      expect(titles[1]).toBe(p.lang === 'en' ? 'Sooner event' : 'Раньше');
      expect(titles[2]).toBe(p.lang === 'en' ? 'Later event' : 'Дегустация «Позже»');
      await expect(cards.nth(2).locator('.evc-price')).toHaveText('380฿');
      await expect(cards.first().locator('.evc-when')).toContainText('18:00');
      await expect(page.locator('#evAll')).toHaveAttribute('href', p.lang === 'en' ? '/events/' : '/ru/events/');
      await expect(page.locator('#evAll')).toBeVisible();  // link to the full schedule page
    });

    test('sheet content is rendered as text (no XSS), unsafe links dropped', async ({ page }) => {
      let alerted = false;
      page.on('dialog', async (d) => { alerted = true; await d.dismiss(); });
      await mockEvents(page);
      await page.goto(p.path + '#events');
      const first = page.locator('#evRow .evc').first();
      await expect(first.locator('h3')).toContainText(p.lang === 'en' ? '<img' : '<script>');
      // the javascript: link is dropped – the card offers the messenger instead
      await expect(first.locator('a')).toHaveAttribute('href', p.lang === 'en' ? /^https:\/\/wa\.me\// : /^https:\/\/t\.me\/moychay_phuket$/);
      expect(await page.locator('#evRow script, #evRow img[src="x"]').count()).toBe(0);
      await page.waitForTimeout(500);
      expect(alerted).toBe(false);
    });

    test('"Details" only for a link to the event itself; the Instagram profile becomes "Ask about this event" in the messenger', async ({ page }) => {
      await mockEvents(page, HEADER +
        '2099-12-01,18:00,Profile link,Ссылка на профиль,t,т,Donation,Донат,https://www.instagram.com/moychay.phuket,yes\n' +
        '2099-12-02,18:00,Post link,Ссылка на пост,t,т,,,https://www.instagram.com/p/AbC123/,yes\n' +
        '2099-12-03,18:00,No link,Без ссылки,t,т,380,380,,yes\n');
      const sheetCalls = [];
      page.on('request', (r) => { if (/docs\.google\.com/.test(r.url())) sheetCalls.push(r.url()); });
      await page.goto(p.path + '#events');
      const links = page.locator('#evRow .evc .tlink');
      await expect(links).toHaveCount(3);
      const ask = p.lang === 'en' ? 'Ask about this event' : 'Уточнить детали', more = p.lang === 'en' ? 'Details' : 'Подробнее';
      await expect(links.nth(0)).toHaveText(ask);
      await expect(links.nth(1)).toHaveText(more);
      await expect(links.nth(1)).toHaveAttribute('href', 'https://www.instagram.com/p/AbC123/');
      await expect(links.nth(2)).toHaveText(ask);
      for (const i of [0, 2]) {
        await expect(links.nth(i)).toHaveAttribute('href', p.lang === 'en' ? /^https:\/\/wa\.me\/66817959110\?text=Hi!/ : 'https://t.me/moychay_phuket');
        await expect(links.nth(i)).toHaveAttribute('data-track', p.lang === 'en' ? 'whatsapp' : 'telegram');
        await expect(links.nth(i)).not.toHaveAttribute('href', /instagram\.com\/moychay\.phuket/);
      }
      if (p.lang === 'en') expect(decodeURIComponent(await links.nth(0).getAttribute('href'))).toContain('Profile link');
      // the longer label still fits its card on a 375 px phone (it wraps under the price instead of running off the edge)
      const fit = await links.evaluateAll((ls) => ls.map((l) => l.getBoundingClientRect().right - l.closest('.evc').getBoundingClientRect().right));
      for (const d of fit) expect(d).toBeLessThanOrEqual(1);
      expect(sheetCalls, 'the browser never reads the Google Sheet itself').toEqual([]);
    });

    test('empty sheet → friendly message, no "show all" button', async ({ page }) => {
      await mockEvents(page, HEADER);
      await page.goto(p.path + '#events');
      await expect(page.locator('#evRow .ev-empty')).toBeVisible();
      await expect(page.locator('#evAll')).toBeHidden();
    });

    test('more than 6 events → home shows 6, the events page shows all with schema.org Event', async ({ page }) => {
      const rows = Array.from({ length: 9 }, (_, i) => `2099-11-${String(i + 10)},18:00,Event ${i + 1},Событие ${i + 1},t,т,${i ? 380 : 'Donation'},${i ? 380 : 'Донат'},https://www.instagram.com/moychay.phuket,yes`);
      await mockEvents(page, HEADER + rows.join('\n'));
      await page.goto(p.path + '#events');
      await expect(page.locator('#evRow .evc:visible')).toHaveCount(6);
      await page.locator('#evAll').click();
      await expect(page).toHaveURL(new RegExp(p.path + 'events/$'));
      await expect(page.locator('#evRow .evc:visible')).toHaveCount(9);
      const ld = JSON.parse(await page.locator('#ev-ld').textContent())['@graph'];
      expect(ld).toHaveLength(9);
      expect(ld[1]).toMatchObject({ '@type': 'Event', startDate: '2099-11-11T18:00:00+07:00',
        offers: { price: 380, priceCurrency: 'THB' }, location: { name: 'Moychay Phuket' } });
      expect(ld[0].offers).toBeUndefined();               // "Donation" → no invented price
    });

    test('event without photo (image = none) renders cleanly', async ({ page }) => {
      await mockEvents(page, HEADER.replace('show', 'show,image') + '2099-11-01,18:00,No photo,Без фото,t,т,,,,yes,none');
      await page.goto(p.path + '#events');
      const card = page.locator('#evRow .evc').first();
      await expect(card).toHaveClass(/no-ph/);
      await expect(card.locator('img')).toHaveCount(0);
      await expect(card.locator('.evc-ph')).toBeHidden();
    });

    test('cards in a row line up: dates on one line, price/link row on one line', async ({ page }) => {
      const long = 'A much longer description that wraps onto several lines so this card is taller than its neighbours in the row.';
      await mockEvents(page, HEADER +
        `16.10.2099,18:00,Tea detective,Tea Detective,${long},${long},Donation,Донат,https://example.com/a,\n` +
        '17.10.2099,18:00,A very long aged tea tasting title that wraps onto two or three lines,Дегустация «Выдержанный чай» с очень длинным названием на несколько строк,Short.,Коротко.,380,380,https://example.com/b,\n' +
        '23.10.2099,19:00,DJ tea,DJ TEA,,,0,0,https://example.com/c,\n');
      await page.goto(p.path + '#events');
      const cards = page.locator('#evRow .evc:not(.evc-skel)');
      await expect(cards).toHaveCount(3);
      await expect(cards.first().locator('img')).toHaveAttribute('src', /events\/tea-detective-700\.webp/);
      await expect(cards.nth(2).locator('.evc-price')).toHaveText(p.lang === 'en' ? 'Free' : 'Бесплатно');
      if (page.viewportSize().width < 900) return; // one card per row on smaller screens
      const pos = await cards.evaluateAll(cs => cs.map(c => {
        const r = s => c.querySelector(s).getBoundingClientRect();
        return { ph: Math.round(r('.evc-ph').height), when: Math.round(r('.evc-when').top), h3: Math.round(r('h3').top),
          text: Math.round(r('.evc-text').top), foot: Math.round(r('.evc-foot').bottom),
          price: Math.round(r('.evc-price').top + r('.evc-price').height / 2),
          priceLeft: Math.round(r('.evc-price').left - c.getBoundingClientRect().left),
          linkRight: Math.round(c.getBoundingClientRect().right - r('.tlink').right) };
      }));
      for (const k of ['ph', 'when', 'h3', 'text', 'foot', 'price']) expect(new Set(pos.map(x => x[k])).size, k).toBe(1);
      for (const x of pos) { expect(Math.abs(x.priceLeft)).toBeLessThanOrEqual(1); expect(Math.abs(x.linkRight)).toBeLessThanOrEqual(1); }  // price left, Details right
    });

    test('network error → friendly message instead of endless skeleton', async ({ page }) => {
      await mockEvents(page, '', 0);
      await page.goto(p.path + '#events');
      await expect(page.locator('#evRow .ev-empty')).toBeVisible();
      await expect(page.locator('#evRow .evc-skel')).toHaveCount(0);
    });

    test('events API unavailable (503) → friendly message', async ({ page }) => {
      await mockEvents(page, 'oops', 500);
      await page.goto(p.path + '#events');
      await expect(page.locator('#evRow .ev-empty')).toBeVisible();
    });
  });
}

test('@live events API responds and renders without errors', async ({ page }) => {
  test.skip(!!process.env.NO_LIVE, 'live events check disabled');
  // start waiting before navigation: the page requests the schedule immediately on load
  const resP = page.waitForResponse(r => EVENTS_URL.test(r.url()), { timeout: 25000 }).catch(() => null);
  await page.goto('/#events');
  const res = await resP;
  expect(res, 'no response from /api/events').not.toBeNull();
  await expect(page.locator('#evRow .evc-skel')).toHaveCount(0, { timeout: 20000 });
  const n = await page.locator('#evRow .evc').count();
  const empty = await page.locator('#evRow .ev-empty').count();
  expect(n + empty).toBeGreaterThan(0);
});
