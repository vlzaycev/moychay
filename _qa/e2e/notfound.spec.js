// 404 page: GitHub Pages serves /404.html with HTTP 404 for every unknown URL (also under /ru/).
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const BODY = fs.readFileSync(path.join(__dirname, '..', '..', '404.html'));

// emulate GitHub Pages for unknown paths
async function serve404(page) {
  await page.route(/\/(missing|old-page|ru\/missing|ru\/a\/b\/c)(\/|$)/, r =>
    r.fulfill({ status: 404, body: BODY, contentType: 'text/html; charset=utf-8' }));
}

const CASES = [
  { url: '/missing', lang: 'en', h1: 'This page has gone cold.', btn: 'Back to home', home: '/' },
  { url: '/old-page', lang: 'en', h1: 'This page has gone cold.', btn: 'Back to home', home: '/' },
  { url: '/ru/missing', lang: 'ru', h1: 'Кажется, этот чай уже выпили.', btn: 'На главную', home: '/ru/' },
  { url: '/ru/a/b/c', lang: 'ru', h1: 'Кажется, этот чай уже выпили.', btn: 'На главную', home: '/ru/' },
];

for (const c of CASES) {
  test(`404 ${c.url}: status, language, header, footer, back button`, async ({ page }) => {
    await serve404(page);
    const resp = await page.goto(c.url);
    expect(resp.status()).toBe(404);
    expect(new URL(page.url()).pathname).toBe(c.url);           // no redirect
    await expect(page.locator('html')).toHaveAttribute('lang', c.lang);
    await expect(page.locator('.nf-code')).toHaveText('404');
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('h1')).toHaveText(c.h1);
    await expect(page.locator('.lang')).toHaveAttribute('data-cur', c.lang);
    await expect(page.locator('footer a.credit')).toHaveCount(1);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
    await expect(page.locator('link[rel="canonical"], link[rel="alternate"]')).toHaveCount(0);
    for (const a of await page.locator('#hdr .nav a:not([target])').all())
      expect(await a.getAttribute('href')).toMatch(new RegExp('^' + c.home + '#'));
    const btn = page.locator('.nf a.btn');
    await expect(btn).toHaveText(c.btn);
    await expect(btn).toHaveAttribute('href', c.home);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
    await btn.click();
    await page.waitForURL(u => new URL(u).pathname === c.home);
    await expect(page.locator('html')).toHaveAttribute('lang', c.lang);
  });
}
