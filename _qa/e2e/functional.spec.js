// Functional: CTAs, links, language switch, accordions, sticky bar, slideshows, anchors.
const { test, expect } = require('@playwright/test');
const { mockEvents, PAGES } = require('./helpers');

const MAPS = 'https://maps.app.goo.gl/uuZkb3YwtNMGQhy18';
const ANCHORS = ['home', 'highlights', 'why-visit', 'gallery', 'about', 'prices', 'teas', 'events', 'delivery', 'faq', 'find-us', 'visit', 'contacts'];

for (const p of PAGES) {
  test.describe(`functional ${p.lang}`, () => {
    test.beforeEach(async ({ page }) => { await mockEvents(page); await page.goto(p.path); });

    test('every directions button goes to Google Maps, opens in new tab, has Maps icon', async ({ page }) => {
      const btns = page.locator('a[data-track="directions"].btn');
      expect(await btns.count()).toBe(3); // hero, contacts, sticky – no duplicates
      for (const b of await btns.all()) {
        await expect(b).toHaveAttribute('href', MAPS);
        await expect(b).toHaveAttribute('target', '_blank');
        await expect(b).toHaveAttribute('rel', /noopener/);
        await expect(b.locator('use')).toHaveAttribute('href', '#i-gm');
        await expect(b).toContainText(p.directions);
      }
    });

    test('messenger links use the right messenger for the language', async ({ page }) => {
      const hero = page.locator('#home a[data-place="hero"].tlink');
      await expect(hero).toHaveAttribute('href', p.msg);
      await expect(hero.locator('use')).toHaveAttribute('href', p.msgIcon);
      await expect(page.locator('#bar .bar-msg')).toHaveAttribute('href', p.msg);
    });

    test('all links have valid href; external ones open safely', async ({ page }) => {
      const bad = await page.evaluate(() => [...document.querySelectorAll('a[href]')].filter(a => {
        const h = a.getAttribute('href');
        if (!h || h === '#' || /^javascript:/i.test(h)) return true;
        if (a.target === '_blank' && !/noopener/.test(a.rel)) return true;
        if (h.startsWith('#') && !document.getElementById(h.slice(1))) return true;
        return false;
      }).map(a => a.outerHTML.slice(0, 120)));
      expect(bad).toEqual([]);
    });

    test('every anchor used for ads exists exactly once', async ({ page }) => {
      for (const id of ANCHORS) await expect(page.locator(`[id="${id}"]`), `#${id}`).toHaveCount(1);
    });

    test('ids on page are unique', async ({ page }) => {
      const dup = await page.evaluate(() => {
        const seen = {}; document.querySelectorAll('[id]').forEach(e => { seen[e.id] = (seen[e.id] || 0) + 1; });
        return Object.keys(seen).filter(k => seen[k] > 1);
      });
      expect(dup).toEqual([]);
    });

    test('FAQ accordion: only one item open at a time', async ({ page }) => {
      const qs = page.locator('.faq-q');
      await qs.nth(0).click();
      await expect(qs.nth(0)).toHaveAttribute('aria-expanded', 'true');
      await qs.nth(2).click();
      await expect(qs.nth(2)).toHaveAttribute('aria-expanded', 'true');
      await expect(qs.nth(0)).toHaveAttribute('aria-expanded', 'false');
      await expect(page.locator('.faq-list li.open')).toHaveCount(1);
      await qs.nth(2).click();
      await expect(page.locator('.faq-list li.open')).toHaveCount(0);
    });

    test('tea catalogue lists all 10 categories as plain text, no numbering', async ({ page }) => {
      const items = page.locator('#teas .tea-list li');
      await expect(items).toHaveCount(10);
      for (const t of await items.locator('h3').allTextContents()) expect(t).not.toMatch(/^\s*\d/);
      await expect(page.locator('#teas a[data-track="catalog"]')).toHaveAttribute('href', 'https://phuket.moychay.asia/');
    });

    test('language switch navigates to the other version', async ({ page }) => {
      const other = p.lang === 'en' ? 'ru' : 'en';
      await page.locator(`.lang a[hreflang="${other}"]`).click();
      await page.waitForURL(other === 'ru' ? /\/ru\/$/ : /\/$/);
      await expect(page.locator('html')).toHaveAttribute('lang', other);
      await expect(page.locator('.lang')).toHaveAttribute('data-cur', other);
    });

    test('sticky bar: hidden on hero, shown mid-page, hidden at Find us', async ({ page }) => {
      const bar = page.locator('#bar');
      await expect(bar).not.toHaveClass(/\bon\b/);
      await page.locator('#teas .tea-list').scrollIntoViewIfNeeded();
      await page.evaluate(() => window.scrollBy(0, 200));
      await expect(bar).toHaveClass(/\bon\b/);
      await page.locator('#find-us').evaluate(e => window.scrollTo(0, e.offsetTop));
      await expect(bar).not.toHaveClass(/\bon\b/);
    });

    test('gallery shows real photos without autoplay; swipeable strip on mobile', async ({ page }) => {
      const g = page.locator('#gallery');
      await g.scrollIntoViewIfNeeded();
      expect(await g.locator('img').count()).toBe(6);
      const desktop = page.viewportSize().width >= 900;
      const scrollable = await g.evaluate(e => e.scrollWidth > e.clientWidth + 10);
      expect(scrollable).toBe(!desktop);
      const before = await g.evaluate(e => e.scrollLeft);
      await page.waitForTimeout(3500);
      expect(await g.evaluate(e => e.scrollLeft)).toBe(before); // nothing moves by itself
    });

    test('tracked clicks are pushed to the GTM dataLayer', async ({ page }) => {
      await page.route(/googletagmanager\.com/, r => r.abort()); // don't hit real GTM from tests
      await page.goto(p.path);
      await page.evaluate(() => document.querySelectorAll('a[data-track]').forEach(a => a.addEventListener('click', e => e.preventDefault())));
      await page.locator('#home a[data-track="directions"]').click();
      await page.locator('#home a.tlink[data-place="hero"]').click();
      const events = await page.evaluate(() => (window.dataLayer || []).filter(e => e.click_place).map(e => e.event + '@' + e.click_place));
      expect(events).toEqual(['directions@hero', (p.lang === 'en' ? 'whatsapp' : 'telegram') + '@hero']);
    });

    test('header becomes solid after scrolling', async ({ page }) => {
      await page.evaluate(() => window.scrollTo(0, 400));
      await expect(page.locator('#hdr')).toHaveClass(/solid/);
    });
  });
}
