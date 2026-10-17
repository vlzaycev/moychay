// Shared Playwright `test`: on local runs the real Cloudflare Turnstile cannot work (the widget is
// registered for teaphuket.com only), so it is replaced by a silent stub. Production runs load the real one.
const base = require('@playwright/test');

const LOCAL = !process.env.BASE_URL || /127\.0\.0\.1|localhost/.test(process.env.BASE_URL);
const STUB = 'window.turnstile={render:function(){return "w0"},getResponse:function(){return ""},reset:function(){}};window.onTurnstileLoad&&window.onTurnstileLoad();';

const test = base.test.extend({
  page: async ({ page }, use) => {
    if (LOCAL) await page.route(/challenges\.cloudflare\.com\/turnstile/, r => r.fulfill({ contentType: 'text/javascript', body: STUB }));
    await use(page);
  },
});

module.exports = { test, expect: base.expect };
