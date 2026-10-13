// Smoke: both pages load, key content present, no JS errors, no horizontal scroll.
const { test, expect } = require('@playwright/test');
const { mockEvents, watchErrors, PAGES } = require('./helpers');

for (const p of PAGES) {
  test.describe(`smoke ${p.lang}`, () => {
    test('loads with 200, correct lang/title/h1', async ({ page }) => {
      await mockEvents(page);
      const res = await page.goto(p.path);
      expect(res.status()).toBe(200);
      await expect(page.locator('html')).toHaveAttribute('lang', p.lang);
      await expect(page.locator('h1')).toHaveCount(1);
      await expect(page.locator('h1')).toHaveText(p.h1);
      expect((await page.title()).length).toBeGreaterThan(10);
    });

    test('no JS errors or failed first-party requests', async ({ page }) => {
      const errors = watchErrors(page);
      await mockEvents(page);
      await page.goto(p.path, { waitUntil: 'load' });
      // scroll the whole page so lazy images / observers fire
      await page.evaluate(async () => {
        for (let y = 0; y < document.body.scrollHeight; y += 600) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 60)); }
      });
      await page.waitForTimeout(800);
      expect(errors, errors.join('\n')).toEqual([]);
    });

    test('no horizontal scroll', async ({ page }) => {
      await mockEvents(page);
      await page.goto(p.path);
      const { sw, cw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
      expect(sw, `scrollWidth ${sw} > clientWidth ${cw}`).toBeLessThanOrEqual(cw + 1);
    });

    test('all images on page load (no broken images)', async ({ page }) => {
      await mockEvents(page);
      await page.goto(p.path);
      await page.evaluate(() => document.querySelectorAll('img[loading="lazy"]').forEach(i => { i.loading = 'eager'; }));
      await page.evaluate(async () => {
        for (let y = 0; y < document.body.scrollHeight; y += 700) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 40)); }
      });
      await page.waitForLoadState('networkidle').catch(() => {});
      const broken = await page.evaluate(() => [...document.images]
        // slideshow slides wait in data-src until shown (files themselves are checked by unit/static.test.js)
        .filter(i => i.getAttribute('src') && i.complete && i.naturalWidth === 0 && getComputedStyle(i).display !== 'none')
        .map(i => i.currentSrc || i.src));
      expect(broken).toEqual([]);
    });
  });
}
