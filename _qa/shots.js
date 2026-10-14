// usage: node shots.js <baseUrl> <outDir>
const { chromium } = require('@playwright/test');
const [,, base, out] = process.argv;
(async () => {
  const b = await chromium.launch();
  for (const [name, vp, mobile] of [['mobile-390', { width: 390, height: 844 }, true], ['desktop-1440', { width: 1440, height: 900 }, false]]) {
    for (const [lang, path] of [['en', '/'], ['ru', '/ru/']]) {
      const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile });
      const p = await ctx.newPage();
      await p.route(/googletagmanager|google-analytics/, r => r.abort());
      await p.goto(base + path, { waitUntil: 'networkidle' });
      await p.evaluate(async () => {
        document.querySelectorAll('img[loading="lazy"]').forEach(i => i.loading = 'eager');
        for (let y = 0; y < document.body.scrollHeight; y += 500) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 80)); }
        window.scrollTo(0, 0);
        document.querySelectorAll('.rv').forEach(e => e.classList.add('in'));
      });
      await p.waitForTimeout(1500);
      await p.addStyleTag({ content: '.hdr,.bar{position:absolute!important} .rv{opacity:1!important;transform:none!important}' });
      await p.screenshot({ path: `${out}/${name}-${lang}.png`, fullPage: true });
      await ctx.close();
    }
  }
  await b.close();
})();
