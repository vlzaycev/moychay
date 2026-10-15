// Inner pages (/ceremonies/ /tea/ /matcha/ /events/ /contact/ /wholesale/ + /ru/…): SEO, navigation, forms.
const { test, expect } = require('@playwright/test');
const { mockEvents, watchErrors } = require('./helpers');

const H1 = {
  en: { ceremonies: 'Tea ceremonies in Phuket', tea: 'Chinese tea in Phuket', matcha: 'Matcha in Phuket',
        events: 'Tea events in Phuket', contact: 'Visit Moychay Phuket', wholesale: 'Wholesale tea for businesses in Phuket' },
  ru: { ceremonies: 'Чайные церемонии на Пхукете', tea: 'Китайский чай на Пхукете', matcha: 'Матча на Пхукете',
        events: 'Чайные мероприятия на Пхукете', contact: 'Контакты Moychay Phuket', wholesale: 'Оптовые поставки чая на Пхукете' },
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
    for (const s of ['ceremonies', 'tea', 'matcha', 'events', 'contact']) {
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

// Serve the page as if the server endpoint were configured (build.py → cfg_form_endpoint)
async function enableForm(page, path) {
  await page.route(u => new URL(u).pathname === path, async route => {
    const res = await route.fetch();
    let html = await res.text();
    html = html.replace('data-endpoint=""', 'data-endpoint="/api/contact"').replace(/<fieldset disabled>/, '<fieldset>')
               .replace(/<div class="form-off"[\s\S]*?<\/div>\n    <\/div>\n/, '');
    await route.fulfill({ response: res, body: html });
  });
}

for (const f of FORMS) {
  test(`${f.path} form: not connected yet → disabled, honest note, messenger link`, async ({ page }) => {
    const posts = [];
    page.on('request', r => { if (r.method() === 'POST') posts.push(r.url()); });
    await page.goto(f.path);
    const form = page.locator(`#${f.kind}-form`);
    await expect(form.locator('[name=name]')).toBeDisabled();
    await expect(form.locator('button[type=submit]')).toBeDisabled();
    await expect(form.locator('.form-off')).toBeVisible();
    await expect(form.locator('.form-off a').first()).toHaveAttribute('href', /wa\.me|t\.me/);
    await expect(form.locator('button[type=submit]')).toHaveText(f.submit);
    expect(posts).toEqual([]);
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
    if (f.kind === 'wholesale') await fld('company').fill('Test Cafe');
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
    expect(body).toMatchObject({ inquiry_type: f.kind, contact_method: f.how, page_path: f.path,
      page_language: f.path.startsWith('/ru/') ? 'ru' : 'en', email: 'guest@example.com', website: '' });
    if (f.kind === 'wholesale') expect(body.company).toBe('Test Cafe');

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

test('form keyboard access: fields reachable by Tab, honeypot skipped', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit', 'Safari does not Tab to buttons by default');
  await enableForm(page, '/contact/');
  await page.goto('/contact/');
  await page.locator('#contact-name').focus();
  const order = [];
  for (let i = 0; i < 5; i++) { order.push(await page.evaluate(() => document.activeElement.name || document.activeElement.tagName)); await page.keyboard.press('Tab'); }
  expect(order).toEqual(['name', 'email', 'contact_value', 'message', 'BUTTON']);
});
