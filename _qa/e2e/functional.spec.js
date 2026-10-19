// Functional: CTAs, links, language switch, accordions, sticky bar, slideshows, anchors.
const { test, expect } = require('./test');
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
    });

    test('online shop: own section after Our teas, links in header, section and footer', async ({ page }) => {
      const order = await page.evaluate(() => [...document.querySelectorAll('main > section')].map(s => s.id));
      expect(order.indexOf('delivery')).toBe(order.indexOf('teas') + 1);
      expect(order.indexOf('events')).toBe(order.indexOf('delivery') + 1);
      const sec = page.locator('#delivery');
      await expect(sec.locator('h2')).toHaveText(p.lang === 'en' ? 'Your favorite tea, delivered' : 'Любимый чай\u00a0– с доставкой');
      await expect(sec).toContainText(p.lang === 'en' ? '฿2,000' : '2\u00a0000\u00a0฿');
      await expect(sec.locator('a.btn')).toHaveCount(1);
      const links = page.locator('a[data-track="online_shop_click"]');
      const places = await links.evaluateAll(as => as.map(a => a.dataset.place).sort());
      expect(places).toEqual(['footer', 'header', 'header', 'shop_section']);
      for (const a of await links.all()) {
        await expect(a).toHaveAttribute('href', 'https://phuket.moychay.asia/');
        await expect(a).toHaveAttribute('target', '_blank');
        await expect(a).toHaveAttribute('rel', /noopener/);
      }
      // exactly one header shop link is visible at any width
      expect(await page.locator('#hdr a[data-track="online_shop_click"]:visible').count()).toBe(1);
      await expect(page.locator('h1')).toHaveCount(1);
    });

    test('online shop CTA is reachable by keyboard and sends online_shop_click', async ({ page }) => {
      await page.route(/googletagmanager\.com/, r => r.abort());
      await page.goto(p.path);
      await page.evaluate(() => document.querySelectorAll('a[data-track]').forEach(a => a.addEventListener('click', e => e.preventDefault())));
      const cta = page.locator('#delivery a.btn');
      await cta.focus();
      await expect(cta).toBeFocused();
      await page.keyboard.press('Enter');
      const ev = await page.evaluate(() => (window.gtmDataLayer || []).filter(e => e.event === 'online_shop_click'));
      expect(ev).toHaveLength(1);
      expect(ev[0]).toMatchObject({ link_url: 'https://phuket.moychay.asia/', link_location: 'shop_section', page_language: p.lang });
    });

    test('language switch navigates to the other version', async ({ page }) => {
      const other = p.lang === 'en' ? 'ru' : 'en';
      await page.locator(`.lang a[hreflang="${other}"]`).click();
      await page.waitForURL(other === 'ru' ? /\/ru\/$/ : /\/$/);
      await expect(page.locator('html')).toHaveAttribute('lang', other);
      await expect(page.locator('.lang')).toHaveAttribute('data-cur', other);
    });

    test('sticky bar: hidden on hero, shown mid-page, hidden next to a directions button and at the footer', async ({ page }) => {
      const bar = page.locator('#bar');
      await expect(bar).not.toHaveClass(/\bon\b/);
      await page.locator('#teas .tea-list').scrollIntoViewIfNeeded();
      await page.evaluate(() => window.scrollBy(0, 200));
      await expect(bar).toHaveClass(/\bon\b/);
      // button low on the screen, right where the bar would be
      await page.locator('#find-us .btn[data-track="directions"]').evaluate(e => window.scrollTo(0, e.getBoundingClientRect().bottom + scrollY - innerHeight * 0.8));
      await expect(bar).not.toHaveClass(/\bon\b/);        // the same action is already on screen
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await expect(bar).not.toHaveClass(/\bon\b/);        // footer
    });

    test('gallery: one lead photo + 3 more, real proportions, nothing moves by itself', async ({ page }) => {
      const g = page.locator('#gallery');
      await g.scrollIntoViewIfNeeded();
      expect(await g.locator('img').count()).toBe(4);
      const sizes = await g.locator('figure').evaluateAll(fs => fs.map(f => { const r = f.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }));
      // no thumbnail narrower than 140px, lead photo is the largest
      expect(Math.min(...sizes.map(s => s[0]))).toBeGreaterThanOrEqual(140);
      expect(sizes[0][0] * sizes[0][1]).toBe(Math.max(...sizes.map(s => s[0] * s[1])));
      expect(await g.evaluate(e => e.scrollWidth <= e.clientWidth + 1)).toBe(true);
    });

    test('contacts: compact block, all ways to reach us, no embedded map', async ({ page }) => {
      const c = page.locator('#find-us');
      await expect(c.locator('iframe')).toHaveCount(0);
      await expect(c.locator('a[data-track="directions"]')).toHaveAttribute('href', MAPS);
      expect(await c.locator('dd a[data-track]').count()).toBeGreaterThanOrEqual(2);
      const h = await c.evaluate(e => e.getBoundingClientRect().height);
      // phones stack the rows; tablets (600–899) show the heading above two columns (+ the RU payment note)
      const w = page.viewportSize().width;
      expect(h).toBeLessThan(w < 600 ? 1100 : w < 900 ? 760 : 700);
    });

    test('tracked clicks are pushed to the GTM data layer (gtmDataLayer)', async ({ page }) => {
      await page.route(/googletagmanager\.com/, r => r.abort()); // don't hit real GTM from tests
      await page.goto(p.path);
      await page.evaluate(() => document.querySelectorAll('a[data-track]').forEach(a => a.addEventListener('click', e => e.preventDefault())));
      await page.locator('#home a[data-track="directions"]').click();
      await page.locator('#home a.tlink[data-place="hero"]').click();
      const events = await page.evaluate(() => (window.gtmDataLayer || []).filter(e => e.click_place).map(e => e.event + '@' + e.click_place));
      expect(events).toEqual(['directions@hero', (p.lang === 'en' ? 'whatsapp' : 'telegram') + '@hero']);
    });

    test('footer: brand, navigation, contacts and vlad.marketing credit', async ({ page }) => {
      const f = page.locator('footer.ftr');
      await expect(f.locator('.ftr-logo img')).toHaveAttribute('src', /logo\.png$/);
      expect(await f.locator('.soc a').count()).toBeGreaterThanOrEqual(2);
      const nav = await f.locator('nav.ftr-col a').evaluateAll(as => as.map(a => a.getAttribute('href')));
      const lp = p.lang === 'en' ? '/' : '/ru/';
      expect(nav).toEqual(['ceremonies/', 'tea/', 'matcha/', 'events/', 'contact/', 'wholesale/'].map(s => lp + s).concat('https://phuket.moychay.asia/'));
      await expect(f.locator('.ftr-contact a[data-track="directions"]')).toHaveAttribute('href', MAPS);
      await expect(f.locator('.ftr-bottom')).toContainText('Moychay Thai Co. LTD');
      const c = f.locator('a.credit');
      await expect(c).toHaveCount(1);
      await expect(c).toHaveAttribute('href', 'https://vlad.marketing/?utm_source=teaphuket.com&utm_medium=referral&utm_campaign=website_credit');
      await expect(c).toHaveAttribute('target', '_blank');
      await expect(c).toHaveAttribute('rel', 'noopener noreferrer');
      await expect(c).toContainText('vlad.marketing');
      await expect(c).toContainText(p.lang === 'en' ? 'Website & marketing by' : 'Сайт и маркетинг –');
      await expect(c).not.toContainText(/Vlad Zaycev|Зайцев/);
      await c.scrollIntoViewIfNeeded();
      const logo = c.locator('img');
      await expect(logo).toHaveAttribute('src', /vlad-marketing\.svg$/);
      const box = await logo.boundingBox();
      expect(box.width).toBe(box.height);                 // proportions kept
      expect(box.height).toBeGreaterThanOrEqual(18); expect(box.height).toBeLessThanOrEqual(24);
      await expect.poll(() => logo.evaluate(i => i.complete && i.naturalWidth > 0)).toBe(true);
      // credit is smaller than the Moychay logo
      const main = await f.locator('.ftr-logo img').boundingBox();
      expect(box.height).toBeLessThan(main.height);
    });

    test('automated browsers (tests, CI) never hit GA4/GTM, so they do not count as visitors', async ({ page }) => {
      const hits = [];
      page.on('request', r => { if (/googletagmanager\.com|google-analytics\.com|analytics\.google\.com|connect\.facebook\.net|facebook\.com\/tr/.test(r.url())) hits.push(r.url()); });
      await page.goto(p.path, { waitUntil: 'networkidle' });
      await page.locator('#home a[data-track="directions"]').evaluate(a => a.addEventListener('click', e => e.preventDefault()));
      await page.locator('#home a[data-track="directions"]').click();
      expect(hits).toEqual([]);
      expect(await page.evaluate(() => /GTM-[A-Z0-9]+/.test(document.head.innerHTML))).toBe(true); // tag is still on the page for real visitors
    });

    test('Telegram: "write to us" links go to the chat, tea club links go to the channel', async ({ page }) => {
      const pairs = await page.locator('a[href^="https://t.me/"]').evaluateAll(as => as.map(a => [a.dataset.track, a.getAttribute('href'), a.dataset.place]));
      for (const [track, href, place] of pairs) {
        if (track === 'telegram') expect(href, place).toBe('https://t.me/moychay_phuket');
        else expect([track, href], place).toEqual(['telegram_club', 'https://t.me/moychayphuket']);
      }
      if (p.lang === 'ru') {
        await expect(page.locator('#bar .bar-msg')).toHaveAttribute('href', 'https://t.me/moychay_phuket');
        expect(pairs.filter(x => x[0] === 'telegram_club').map(x => x[2]).sort()).toEqual(['events', 'footer']);
      }
    });

    test('each tracked click reaches GTM exactly once (separate gtmDataLayer, no gtag echo)', async ({ page }) => {
      await page.evaluate(() => document.querySelectorAll('a[data-track]').forEach(a => a.addEventListener('click', e => e.preventDefault())));
      await page.locator('#home a[data-track="directions"]').click();
      const r = await page.evaluate(() => ({
        gtm: (window.gtmDataLayer || []).filter(e => e.event === 'directions').length,
        shared: (window.dataLayer || []).filter(e => e && e.event === 'directions').length }));
      expect(r).toEqual({ gtm: 1, shared: 0 });
      const html = await page.content();
      expect(html).toContain("'script','gtmDataLayer','GTM-");
    });

    test('header becomes solid after scrolling', async ({ page }) => {
      await page.evaluate(() => window.scrollTo(0, 400));
      await expect(page.locator('#hdr')).toHaveClass(/solid/);
    });
  });
}

test('promo code: one tap copies MOYCHAY and says so; keyboard reachable', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'clipboard permissions are a Chromium feature in Playwright');
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  for (const [lp, done] of [['/', 'Copied'], ['/ru/', 'Скопировано']]) {
    await page.goto(lp);
    const b = page.locator('#delivery .promo-code');
    await b.scrollIntoViewIfNeeded();
    await b.click();
    await expect(page.locator('#delivery .promo-ok')).toHaveText(done);
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('MOYCHAY');
    await expect(b).toHaveAttribute('type', 'button');
    const box = await b.boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(24);
  }
});
