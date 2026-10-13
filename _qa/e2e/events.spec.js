// Events block (Google Sheet → cards): ordering, filtering, XSS safety, error/empty states.
const { test, expect } = require('@playwright/test');
const { mockEvents, PAGES, EXPORT_URL } = require('./helpers');

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
      await expect(cards.nth(2).locator('.evc-price')).toHaveText('380 ฿');
      await expect(page.locator('.ev-nav')).toBeVisible();
    });

    test('sheet content is rendered as text (no XSS), unsafe links dropped', async ({ page }) => {
      let alerted = false;
      page.on('dialog', async (d) => { alerted = true; await d.dismiss(); });
      await mockEvents(page);
      await page.goto(p.path + '#events');
      const first = page.locator('#evRow .evc').first();
      await expect(first.locator('h3')).toContainText(p.lang === 'en' ? '<img' : '<script>');
      await expect(first.locator('a')).toHaveCount(0); // javascript: link not rendered
      expect(await page.locator('#evRow script, #evRow img[src="x"]').count()).toBe(0);
      await page.waitForTimeout(500);
      expect(alerted).toBe(false);
    });

    test('empty sheet → friendly message, arrows hidden', async ({ page }) => {
      await mockEvents(page, HEADER);
      await page.goto(p.path + '#events');
      await expect(page.locator('#evRow .ev-empty')).toBeVisible();
      await expect(page.locator('.ev-nav')).toBeHidden();
    });

    test('network error → friendly message instead of endless skeleton', async ({ page }) => {
      await mockEvents(page, '', 0);
      await page.goto(p.path + '#events');
      await expect(page.locator('#evRow .ev-empty')).toBeVisible();
      await expect(page.locator('#evRow .evc-skel')).toHaveCount(0);
    });

    test('HTTP 500 from Google → friendly message', async ({ page }) => {
      await mockEvents(page, 'oops', 500);
      await page.goto(p.path + '#events');
      await expect(page.locator('#evRow .ev-empty')).toBeVisible();
    });
  });
}

test('@live real Google Sheet responds and renders without errors', async ({ page }) => {
  test.skip(!!process.env.NO_LIVE, 'live sheet check disabled');
  // start waiting before navigation: the page requests the sheet immediately on load
  const resP = page.waitForResponse(r => EXPORT_URL.test(r.url()) || /googleusercontent/.test(r.url()), { timeout: 25000 }).catch(() => null);
  await page.goto('/#events');
  const res = await resP;
  expect(res, 'no response from Google Sheets export').not.toBeNull();
  await expect(page.locator('#evRow .evc-skel')).toHaveCount(0, { timeout: 20000 });
  const n = await page.locator('#evRow .evc').count();
  const empty = await page.locator('#evRow .ev-empty').count();
  expect(n + empty).toBeGreaterThan(0);
});
