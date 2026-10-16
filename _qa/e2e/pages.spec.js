// Inner pages (/ceremonies/ /tea/ /matcha/ /events/ /contact/ /wholesale/ + /ru/…): SEO, navigation, forms.
const { test, expect } = require('@playwright/test');
const { mockEvents, watchErrors } = require('./helpers');

const H1 = {
  en: { ceremonies: 'Tea ceremonies in Phuket', tea: 'Chinese tea in Phuket', matcha: 'Matcha in Phuket',
        events: 'Tea events in Phuket', contact: 'Visit Moychay Phuket', wholesale: 'Wholesale tea & tea solutions for businesses in Phuket' },
  ru: { ceremonies: 'Чайные церемонии на Пхукете', tea: 'Китайский чай на Пхукете', matcha: 'Матча на Пхукете',
        events: 'Чайные мероприятия на Пхукете', contact: 'Контакты Moychay Phuket', wholesale: 'Чай и чайные решения для бизнеса на Пхукете' },
};

for (const lang of ['en', 'ru']) {
  const lp = lang === 'en' ? '/' : '/ru/';
  for (const slug of Object.keys(H1[lang])) {
    const path = lp + slug + '/';
    test(`${path}: 200, one h1, canonical/hreflang, header kept, no overflow, no errors`, async ({ page }) => {
      const errors = watchErrors(page);
      await mockEvents(page);
      const r = await page.goto(path);
      expect(r.status()).toBe(200);
      await expect(page.locator('h1')).toHaveCount(1);
      await expect(page.locator('h1')).toHaveText(H1[lang][slug]);
      expect(await page.locator('link[rel=canonical]').getAttribute('href')).toBe('https://teaphuket.com' + path);
      expect(await page.locator('link[hreflang=ru]').getAttribute('href')).toBe('https://teaphuket.com/ru/' + slug + '/');
      expect(await page.locator('meta[name=robots]').count()).toBe(0);
      // header: same 4 section links (to the home page) + shop, no new pages in the top menu
      const nav = await page.locator('.hdr .nav a').evaluateAll(as => as.map(a => a.getAttribute('href')));
      expect(nav).toEqual([lp + '#prices', lp + '#teas', lp + '#events', lp + '#find-us', 'https://phuket.moychay.asia/']);
      await expect(page.locator(`.ftr a[href="${path}"]`)).toHaveCount(1);
      await expect(page.locator('.crumbs a')).toHaveAttribute('href', lp);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
      const noAlt = await page.evaluate(() => [...document.images].filter(i => !i.hasAttribute('alt')).length);
      expect(noAlt).toBe(0);
      expect(errors).toEqual([]);
    });
  }

  test(`${lang}: language switch keeps the page`, async ({ page }) => {
    await page.goto(lp + 'matcha/');
    const other = lang === 'en' ? 'ru' : 'en';
    await page.locator(`.lang a[hreflang="${other}"]`).click();
    await expect(page).toHaveURL(new RegExp((other === 'ru' ? '/ru' : '') + '/matcha/$'));
  });

  test(`${lang}: home page links to the new pages in context`, async ({ page }) => {
    await mockEvents(page);
    await page.goto(lp);
    for (const s of ['ceremonies', 'tea', 'matcha', 'events']) {
      expect(await page.locator(`main a[href="${lp}${s}/"]`).count(), s).toBeGreaterThan(0);
    }
  });
}

/* ── Forms ──────────────────────────────────────────────────────── */
const FORMS = [
  { path: '/contact/', kind: 'contact', how: 'whatsapp', submit: 'Send message' },
  { path: '/ru/contact/', kind: 'contact', how: 'telegram', submit: 'Отправить сообщение' },
  { path: '/wholesale/', kind: 'wholesale', how: 'whatsapp', submit: 'Send message' },
  { path: '/ru/wholesale/', kind: 'wholesale', how: 'telegram', submit: 'Отправить сообщение' },
];

// Serve the page as if the server endpoint and Turnstile were configured (build.py → cfg_form_endpoint,
// cfg_turnstile_sitekey). Turnstile is replaced by a local stub: no request leaves the machine.
async function enableForm(page, path, { token = 'tok-test' } = {}) {
  await page.route(u => new URL(u).pathname === path, async route => {
    const res = await route.fetch();
    let html = await res.text();
    html = html.replace('data-endpoint="" data-sitekey=""', 'data-endpoint="/api/contact" data-sitekey="1x00000000000000000000AA"')
               .replace(/<fieldset disabled>/, '<fieldset>')
               .replace(/<div class="form-off"[\s\S]*?<\/div>\n    <\/div>\n/, '');
    await route.fulfill({ response: res, body: html });
  });
  await page.route(/challenges\.cloudflare\.com\/turnstile/, route => route.fulfill({ contentType: 'text/javascript', body: `
    window.__ts = { renders: [], resets: 0 };
    window.turnstile = { render(el, o) { __ts.renders.push(o); return 'w' + __ts.renders.length; },
      getResponse() { return ${JSON.stringify(token)}; }, reset() { __ts.resets++; } };
    window.onTurnstileLoad && window.onTurnstileLoad();` }));
}

for (const f of FORMS) {
  test(`${f.path} form: not connected yet → disabled, honest note, messenger link`, async ({ page }) => {
    const posts = [];
    page.on('request', r => { if (r.method() === 'POST' && !/\/cdn-cgi\//.test(r.url())) posts.push(r.url()); });   // Cloudflare's own RUM beacon is not the form
    await page.goto(f.path);
    const form = page.locator(`#${f.kind}-form`);
    await expect(form.locator('[name=name]')).toBeDisabled();
    await expect(form.locator('button[type=submit]')).toBeDisabled();
    await expect(form.locator('.form-off')).toBeVisible();
    await expect(form.locator('.form-off a').first()).toHaveAttribute('href', /wa\.me|t\.me/);
    await expect(form.locator('button[type=submit]')).toHaveText(f.submit);
    expect(posts).toEqual([]);
    expect(await page.evaluate(() => [...document.scripts].some(s => /turnstile/.test(s.src)))).toBe(false);  // no third-party load
  });

  test(`${f.path} form: validation, then success only after the server confirms`, async ({ page }) => {
    await enableForm(page, f.path);
    let body = null, reply = { status: 502, body: '{"ok":false,"error":"delivery"}' };
    await page.route('**/api/contact', async r => { body = r.request().postDataJSON(); await r.fulfill({ ...reply, contentType: 'application/json' }); });
    await page.goto(f.path);
    const form = page.locator(`#${f.kind}-form`);
    const fld = n => form.locator(`[name="${n}"]`);
    await expect(form.locator('[name=name]')).toBeEnabled();
    expect(await fld('contact_value').getAttribute('type')).toBe(f.how === 'whatsapp' ? 'tel' : 'text');

    // empty submit → required errors, focus on the first field, nothing sent
    await form.locator('button[type=submit]').click();
    await expect(fld('name')).toHaveAttribute('aria-invalid', 'true');
    await expect(fld('name')).toBeFocused();
    await expect(form.locator(`#${f.kind}-email-err`)).not.toBeEmpty();
    expect(body).toBeNull();

    await fld('name').fill('Test Guest');
    if (f.kind === 'wholesale') { await fld('company').fill('Test Cafe'); await fld('business_type').selectOption('hotel'); }
    await fld('email').fill('bad-email');
    await fld('contact_value').fill(f.how === 'whatsapp' ? '12' : 'ab');
    await fld('message').fill('Hello, this is a test message');
    await form.locator('button[type=submit]').click();
    await expect(fld('email')).toHaveAttribute('aria-invalid', 'true');
    await expect(fld('contact_value')).toHaveAttribute('aria-invalid', 'true');
    expect(body).toBeNull();

    await fld('email').fill('guest@example.com');
    await fld('contact_value').fill(f.how === 'whatsapp' ? '+66 81 234 5678' : 'moychay_test');   // no "@" required
    await page.waitForTimeout(100);
    // server failure → error, no success message, data kept
    await form.locator('button[type=submit]').click();
    await expect(form.locator('.form-msg')).toHaveClass(/err/);
    await expect(fld('name')).toHaveValue('Test Guest');
    expect(body.turnstile_token).toBe('tok-test');
    expect(await page.evaluate(() => __ts.renders[0])).toMatchObject({ action: f.kind, appearance: 'interaction-only' });
    expect(body).toMatchObject({ inquiry_type: f.kind, contact_method: f.how, page_path: f.path,
      page_language: f.path.startsWith('/ru/') ? 'ru' : 'en', email: 'guest@example.com', website: '' });
    if (f.kind === 'wholesale') { expect(body.company).toBe('Test Cafe'); expect(body.business_type).toBe('hotel'); }

    // server confirms → success, form reset, analytics event without personal data
    reply = { status: 200, body: '{"ok":true}' };
    await form.locator('button[type=submit]').click();
    await expect(form.locator('.form-msg')).not.toHaveClass(/err/);
    await expect(form.locator('.form-msg')).toBeVisible();
    await expect(fld('name')).toHaveValue('');
    const dl = await page.evaluate(() => (window.gtmDataLayer || []).filter(e => /form_submit/.test(e.event)));
    expect(dl).toHaveLength(1);
    expect(dl[0].event).toBe(f.kind === 'wholesale' ? 'wholesale_form_submit' : 'contact_form_submit');
    expect(JSON.stringify(dl[0])).not.toMatch(/Test Guest|guest@example|moychay_test|234 5678|Hello/);
  });
}

test('form: no Turnstile token yet → nothing sent; server limits → honest error, never success', async ({ page }) => {
  await enableForm(page, '/contact/', { token: '' });
  let posts = 0;
  await page.route('**/api/contact', r => { posts++; r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }); });
  await page.goto('/contact/');
  const form = page.locator('#contact-form');
  await form.locator('[name=name]').fill('Test Guest');
  await form.locator('[name=email]').fill('guest@example.com');
  await form.locator('[name=message]').fill('Hello, this is a test message');
  await form.locator('button[type=submit]').click();
  await expect(form.locator('.form-msg')).toHaveClass(/err/);
  await expect(form.locator('.form-msg')).toContainText('security check');
  expect(posts).toBe(0);
});

for (const [status, body, text] of [
  [429, '{"ok":false,"error":"rate_limited"}', 'Too many messages'],
  [400, '{"ok":false,"error":"captcha"}', 'security check'],
  [503, '{"ok":false,"error":"unavailable"}', 'could not be sent'],
  [500, 'not json', 'could not be sent'],
  [422, '{"ok":false,"errors":{"message":"links"}}', 'check the highlighted'],
]) {
  test(`form: server answers ${status} ${body.slice(0, 30)} → error shown, data kept, widget reset`, async ({ page }) => {
    await enableForm(page, '/contact/');
    await page.route('**/api/contact', r => r.fulfill({ status, contentType: 'application/json', body }));
    await page.goto('/contact/');
    const form = page.locator('#contact-form');
    await form.locator('[name=name]').fill('Test Guest');
    await form.locator('[name=email]').fill('guest@example.com');
    await form.locator('[name=message]').fill('Hello, this is a test message');
    await form.locator('button[type=submit]').click();
    await expect(form.locator('.form-msg')).toHaveClass(/err/);
    await expect(form.locator('.form-msg')).toContainText(text);
    await expect(form.locator('[name=name]')).toHaveValue('Test Guest');
    expect(await page.evaluate(() => __ts.resets)).toBe(1);
    expect(await page.evaluate(() => (window.gtmDataLayer || []).some(e => /form_submit/.test(e.event)))).toBe(false);
  });
}

test('form keyboard access: fields reachable by Tab, honeypot skipped', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit', 'Safari does not Tab to buttons by default');
  await enableForm(page, '/contact/');
  await page.goto('/contact/');
  await page.locator('#contact-name').focus();
  const order = [];
  for (let i = 0; i < 5; i++) { order.push(await page.evaluate(() => document.activeElement.name || document.activeElement.tagName)); await page.keyboard.press('Tab'); }
  expect(order).toEqual(['name', 'email', 'contact_value', 'message', 'BUTTON']);
});

/* ── Growth iteration: B2B page, ceremonies, blog drafts ─────────── */
for (const lang of ['en', 'ru']) {
  const lp = lang === 'en' ? '/' : '/ru/';
  test(`${lp}wholesale/: B2B sections, no prices or discounts, partners hidden while empty`, async ({ page }) => {
    await page.goto(lp + 'wholesale/');
    for (const id of ['who', 'formats', 'products', 'how', 'terms', 'faq', 'request']) await expect(page.locator('#' + id)).toHaveCount(1);
    await expect(page.locator('#who .seg li')).toHaveCount(5);
    await expect(page.locator('#formats .offer li')).toHaveCount(5);
    await expect(page.locator('#how .steps li')).toHaveCount(4);
    await expect(page.locator('#partners')).toHaveCount(0);
    const text = await page.locator('main').innerText();
    expect(text).not.toMatch(/\d+\s?%|\d[\d\s,]*\s?฿|minimum order|минимальн/i);
    await expect(page.locator('a[data-track="wholesale_contact_click"]')).toHaveAttribute('href', '#request');
    await expect(page.locator('#wholesale-business_type option')).toHaveCount(7);
  });

  test(`${lp}ceremonies/: comparison table and link to business ceremonies`, async ({ page }) => {
    await page.goto(lp + 'ceremonies/');
    await expect(page.locator('#compare tbody tr')).toHaveCount(3);
    await expect(page.locator('#private a')).toHaveAttribute('href', lp + 'wholesale/#experiences');
  });

  test(`${lp}: matcha drinks are no longer listed as a ceremony`, async ({ page }) => {
    await mockEvents(page);
    await page.goto(lp);
    await expect(page.locator('#prices .menu-i')).toHaveCount(3);
    await expect(page.locator('#prices .menu-extra a')).toHaveAttribute('href', lp + 'matcha/');
  });

  test(`${lp}blog/ drafts: local preview works, is noindex, and nothing is published`, async ({ page, request }) => {
    expect((await request.get(lp + 'blog/')).status()).toBe(404);
    const r = await page.goto('/_preview' + lp + 'blog/');
    expect(r.status()).toBe(200);
    await expect(page.locator('meta[name=robots]')).toHaveAttribute('content', 'noindex');
    const links = page.locator('.posts h2 a');
    expect(await links.count()).toBeGreaterThanOrEqual(3);
    await links.first().click();
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('.draft')).toBeVisible();
    await expect(page.locator('.prose h2').first()).toBeVisible();
    const ld = JSON.parse(await page.locator('script[type="application/ld+json"]').textContent())['@graph'];
    expect(ld[0]['@type']).toBe('BlogPosting');
    expect(ld[0].datePublished).toBeUndefined();          // no invented dates
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
  });
}

/* ── Contacts, shop terms, tea master ─────────────────────────────── */
for (const lang of ['en', 'ru']) {
  const lp = lang === 'en' ? '/' : '/ru/';
  test(`${lp}: phone and email are clickable, shop terms are current`, async ({ page }) => {
    await mockEvents(page);
    await page.goto(lp);
    for (const sel of ['#find-us', '.ftr']) {
      await expect(page.locator(`${sel} a[href="tel:+66817959110"]`)).toHaveCount(1);
      await expect(page.locator(`${sel} a[href="mailto:info@phuket.moychay.asia"]`)).toHaveCount(1);
    }
    await expect(page.locator('#delivery .lead')).toContainText('DHL');
    await expect(page.locator('#delivery .lead')).toContainText('MOYCHAY');
    await expect(page.locator('#delivery .lead')).toContainText('2000฿');
    const ld = JSON.parse(await page.locator('script[type="application/ld+json"]').textContent())['@graph'][0];
    expect(ld).toMatchObject({ telephone: '+66817959110', email: 'info@phuket.moychay.asia', parentOrganization: { name: 'Moychay' } });
    await page.locator('#find-us a[href^="tel:"]').evaluate(a => a.addEventListener('click', e => e.preventDefault()));
    await page.locator('#find-us a[href^="tel:"]').click();
    const dl = await page.evaluate(() => (window.gtmDataLayer || []).map(e => e.event + '@' + e.click_place));
    expect(dl).toContain('phone_call@find');
  });

  test(`${lp}ceremonies/: tea master block with real photo`, async ({ page }) => {
    await page.goto(lp + 'ceremonies/');
    const m = page.locator('#tea-master');
    await expect(m.locator('.master-role strong')).toHaveText(lang === 'en' ? 'Igor' : 'Игорь');
    await expect(m).toContainText(lang === 'en' ? 'Astrakhan' : 'Астрахан');
    const img = m.locator('img');
    await img.scrollIntoViewIfNeeded();
    await expect.poll(() => img.evaluate(i => i.complete && i.naturalWidth > 0)).toBe(true);
    await expect(m.locator('.info')).toHaveCount(0);                 // no invented experience / approach
  });
}

/* Nothing sticks out of the screen. overflow-x:clip hides overflow instead of scrolling it,
   so the page-width check alone misses buttons cut off at the edge. */
for (const path of ['/', '/ru/', '/ceremonies/', '/ru/ceremonies/', '/tea/', '/matcha/', '/events/', '/contact/', '/wholesale/', '/ru/wholesale/']) {
  test(`${path}: no element wider than the screen; base CSS intact`, async ({ page }) => {
    await page.route(/docs\.google\.com/, r => r.abort());
    await page.goto(path);
    const res = await page.evaluate(() => {
      const W = document.documentElement.clientWidth;
      const skip = '.phero-ph,.cer-ph,.teas-ph,.shop-ph,.about-ph,.gallery,.map,.master-ph,.tbl,.hero-bg';
      const bad = [...document.querySelectorAll('main *, footer *, #bar *')]
        .filter(e => { const r = e.getBoundingClientRect(); return r.width && r.right > W + 1 && !e.closest(skip); })
        .map(e => e.tagName + '.' + e.className);
      return { bad: [...new Set(bad)].slice(0, 5), sizing: getComputedStyle(document.querySelector('.btn')).boxSizing };
    });
    expect(res.sizing).toBe('border-box');
    expect(res.bad).toEqual([]);
  });
}

/* The sticky bar (hours | in tea we trust | directions) appears while scrolling on every page */
for (const path of ['/', '/ru/', '/ceremonies/', '/tea/', '/matcha/', '/events/', '/contact/', '/wholesale/', '/ru/contact/', '/ru/matcha/']) {
  test(`${path}: sticky bar shows up while scrolling`, async ({ page }) => {
    await mockEvents(page);
    await page.goto(path);
    const seen = await page.evaluate(async () => {
      const H = document.documentElement.scrollHeight;
      for (let y = 0; y < H; y += 120) {
        scrollTo(0, y); await new Promise(r => setTimeout(r, 80));
        if (document.getElementById('bar').classList.contains('on')) return true;
      }
      return false;
    });
    expect(seen).toBe(true);
  });
}
