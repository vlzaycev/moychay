// SEO & metadata checks on the rendered pages.
const { test, expect } = require('@playwright/test');
const { mockEvents, PAGES } = require('./helpers');

test.describe.configure({ mode: 'parallel' });

for (const p of PAGES) {
  test(`seo ${p.lang}: title, description, canonical, hreflang, OG, JSON-LD, headings`, async ({ page }) => {
    await mockEvents(page);
    await page.goto(p.path);
    const meta = await page.evaluate(() => {
      const q = (s, a = 'content') => document.querySelector(s)?.getAttribute(a) || '';
      return {
        title: document.title,
        desc: q('meta[name="description"]'),
        canonical: q('link[rel="canonical"]', 'href'),
        hreflang: [...document.querySelectorAll('link[rel="alternate"][hreflang]')].map(l => l.hreflang + '=' + l.href),
        ogImage: q('meta[property="og:image"]'), ogTitle: q('meta[property="og:title"]'), ogUrl: q('meta[property="og:url"]'),
        viewport: q('meta[name="viewport"]'),
        ld: [...document.querySelectorAll('script[type="application/ld+json"]')].map(s => s.textContent),
        headings: [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].map(h => h.tagName),
        imgsNoAlt: [...document.images].filter(i => !i.hasAttribute('alt')).length,
      };
    });
    expect(meta.title.length).toBeGreaterThan(20);
    expect(meta.title.length).toBeLessThanOrEqual(65);
    expect(meta.desc.length).toBeGreaterThan(70);
    expect(meta.desc.length).toBeLessThanOrEqual(170);
    expect(meta.canonical).toBe(p.lang === 'en' ? 'https://teaphuket.com/' : 'https://teaphuket.com/ru/');
    expect(meta.hreflang).toEqual(expect.arrayContaining([
      'en=https://teaphuket.com/', 'ru=https://teaphuket.com/ru/', 'x-default=https://teaphuket.com/']));
    expect(meta.ogImage).toBe('https://teaphuket.com/img/og.jpg');
    expect(meta.ogUrl).toBe(meta.canonical);
    expect(meta.viewport).toContain('width=device-width');
    expect(meta.ld.length).toBe(1);
    const graph = JSON.parse(meta.ld[0])['@graph'];
    expect(graph.find(n => n['@type'] === 'WebSite').url).toBe('https://teaphuket.com/');
    const ld = graph.find(n => n['@id'] === 'https://teaphuket.com/#teahouse');
    expect([].concat(ld['@type'])).toContain('CafeOrCoffeeShop');
    expect(ld.address.addressCountry).toBe('TH');
    expect(ld.openingHoursSpecification[0].opens).toBe('11:00');
    expect([].concat(ld.hasMap).length).toBeGreaterThanOrEqual(2);
    expect(ld.geo.latitude).toBeCloseTo(7.993, 2);
    expect(meta.headings.filter(h => h === 'H1').length).toBe(1);
    expect(meta.headings[0]).toBe('H1');
    expect(meta.imgsNoAlt).toBe(0);
  });
}
