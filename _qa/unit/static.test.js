// Static checks (no browser): build reproducibility, assets, parity EN/RU, SEO files, secrets.
// Run: node --test unit/
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const SLUGS = ['', 'ceremonies/', 'tea/', 'matcha/', 'events/', 'contact/', 'wholesale/'];
const HOME = { en: 'index.html', ru: 'ru/index.html' };
const PAGES = Object.fromEntries(SLUGS.flatMap(s => [['en:' + s, s + 'index.html'], ['ru:' + s, 'ru/' + s + 'index.html']]));
const graph = (html) => JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1])['@graph'];

test('build is reproducible: _build/build.py output == committed HTML', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-build-'));
  fs.cpSync(path.join(ROOT, '_build'), path.join(tmp, '_build'), { recursive: true });
  if (fs.existsSync(path.join(ROOT, '_content'))) fs.cpSync(path.join(ROOT, '_content'), path.join(tmp, '_content'), { recursive: true });
  // start from the committed output: <lastmod> is kept for pages whose HTML did not change
  for (const f of [...Object.values(PAGES), 'sitemap.xml']) {
    fs.mkdirSync(path.dirname(path.join(tmp, f)), { recursive: true });
    fs.copyFileSync(path.join(ROOT, f), path.join(tmp, f));
  }
  execFileSync('python3', [path.join(tmp, '_build', 'build.py')], { stdio: 'pipe' });
  for (const f of [...Object.values(PAGES), '404.html', 'sitemap.xml']) {
    assert.equal(fs.readFileSync(path.join(tmp, f), 'utf8'), read(f), `${f} differs from build output — someone edited HTML by hand or forgot to rebuild`);
  }
});

test('no unfilled {{placeholders}} in published HTML', () => {
  for (const f of Object.values(PAGES)) assert.doesNotMatch(read(f), /\{\{\w+\}\}/, f);
});

test('every local asset referenced by the pages exists', () => {
  const missing = [];
  for (const [lang, f] of Object.entries(PAGES)) {
    const html = read(f);
    const base = path.dirname(path.join(ROOT, f));
    const refs = new Set();
    for (const m of html.matchAll(/(?:src|href)="([^"#?]+)"/g)) refs.add(m[1]);
    for (const m of html.matchAll(/srcset="([^"]+)"/g)) m[1].split(',').forEach(s => refs.add(s.trim().split(/\s+/)[0]));
    for (const r of refs) {
      if (/^(https?:|mailto:|tel:|data:|\/\/)/.test(r)) continue;
      const target = r.startsWith('/') ? path.join(ROOT, r) : path.resolve(base, r);
      const ok = fs.existsSync(target) && (fs.statSync(target).isFile() || fs.existsSync(path.join(target, 'index.html')));
      if (!ok) missing.push(`${lang}: ${r}`);
    }
  }
  assert.deepEqual(missing, []);
});

test('EN and RU pages have the same structure (ids, sections, links count)', () => {
  const shape = (html) => ({
    ids: [...html.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]).join(','),
    sections: (html.match(/<section/g) || []).length,
    tracked: (html.match(/data-track=/g) || []).length,
  });
  for (const s of SLUGS) {
    const a = shape(read(PAGES['en:' + s])), b = shape(read(PAGES['ru:' + s]));
    assert.equal(a.ids, b.ids, s); assert.equal(a.sections, b.sections, s);
  }
  const en = shape(read(HOME.en)), ru = shape(read(HOME.ru));
  // RU extra: Telegram club link in events, Telegram in contacts, 2 footer icons (Yandex Maps, Telegram)
  assert.equal(ru.tracked - en.tracked, 4);
});

test('robots.txt, sitemap.xml and CNAME are valid', () => {
  assert.match(read('robots.txt'), /Sitemap: https:\/\/teaphuket\.com\/sitemap\.xml/);
  const sm = read('sitemap.xml');
  assert.match(sm, /<loc>https:\/\/teaphuket\.com\/<\/loc>/);
  const locs = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
  assert.equal(locs.length, 16);                    // 7 pages × EN/RU + privacy policy EN/RU
  for (const u of ['https://teaphuket.com/privacy/', 'https://teaphuket.com/ru/privacy/']) assert.ok(locs.includes(u), u);
  for (const s of SLUGS) for (const u of ['https://teaphuket.com/' + s, 'https://teaphuket.com/ru/' + s]) assert.ok(locs.includes(u), u);
  assert.doesNotMatch(sm, /404/);
  assert.equal(read('CNAME').trim(), 'teaphuket.com');
});

test('JSON-LD parses and has required LocalBusiness fields', () => {
  for (const f of [...Object.values(HOME), 'contact/index.html', 'ru/contact/index.html']) {
    const ld = graph(read(f)).find(n => n['@id'] === 'https://teaphuket.com/#teahouse');
    for (const k of ['name', 'address', 'geo', 'openingHoursSpecification', 'telephone', 'url', 'hasMap', 'sameAs']) assert.ok(ld[k], `${f}: ${k}`);
  }
});

test('inner pages: BreadcrumbList, unique titles, one h1, self canonical', () => {
  const titles = new Set();
  for (const [key, f] of Object.entries(PAGES)) {
    const html = read(f), [lang, slug] = key.split(':');
    const title = html.match(/<title>([^<]+)<\/title>/)[1];
    assert.ok(!titles.has(title), `duplicate title ${title}`); titles.add(title);
    assert.equal((html.match(/<h1[\s>]/g) || []).length, 1, f);
    const url = 'https://teaphuket.com/' + (lang === 'ru' ? 'ru/' : '') + slug;
    assert.match(html, new RegExp(`<link rel="canonical" href="${url}">`), f);
    assert.match(html, new RegExp(`hreflang="en" href="https://teaphuket.com/${slug}"`), f);
    assert.match(html, new RegExp(`hreflang="ru" href="https://teaphuket.com/ru/${slug}"`), f);
    assert.doesNotMatch(html, /noindex/, f);
    if (slug) assert.ok(graph(html).some(n => n['@type'] === 'BreadcrumbList'), f);
  }
});

test('no secrets / tokens committed in tracked files', () => {
  const files = execFileSync('git', ['ls-files'], { cwd: ROOT }).toString().split('\n')
    .filter(f => f && !/\.(jpg|png|ico|webp)$/.test(f) && !f.startsWith('_qa/'));
  const pat = /(github_pat_[A-Za-z0-9_]{20,}|ghp_[A-Za-z0-9]{30,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{35}|-----BEGIN [A-Z ]*PRIVATE KEY-----|xox[bp]-[0-9A-Za-z-]{10,})/;
  const hits = files.filter(f => pat.test(fs.readFileSync(path.join(ROOT, f), 'utf8')));
  assert.deepEqual(hits, []);
});

test('Google Tag Manager and Search Console verification are on every page', () => {
  for (const f of Object.values(PAGES)) {
    const html = read(f);
    const head = html.slice(0, html.indexOf('</head>'));
    assert.match(head, /gtm\.js\?id='\+i\+dl[\s\S]*'GTM-[A-Z0-9]+'/, `${f}: GTM snippet in <head>`);
    assert.ok(head.indexOf('Google Tag Manager') < head.indexOf('<title>'), `${f}: GTM must be high in <head>`);
    assert.match(html, /<body>\n<!-- Google Tag Manager \(noscript\) -->/, `${f}: GTM noscript right after <body>`);
    assert.match(head, /<meta name="google-site-verification" content="[\w-]{20,}">/, `${f}: GSC tag`);
    assert.match(head, /<meta name="facebook-domain-verification" content="2xbz3ulgnxnpw9oo6wmnhndoz5n8xl">/, `${f}: Meta domain verification`);
    assert.match(head, /PIXEL_ID:\s+"2041380899914040"/, `${f}: Meta Pixel ID`);
    assert.match(html, /<noscript><img [^>]*facebook\.com\/tr\?id=2041380899914040&amp;ev=PageView&amp;noscript=1"><\/noscript>/, `${f}: Pixel noscript`);
  }
});

test('404 page and web manifest are valid', () => {
  const nf = read('404.html');
  assert.match(nf, /<meta name="robots" content="noindex">/);
  for (const m of nf.matchAll(/(?:src|href)="(\/[^"]*)"/g)) {
    const [file, hash] = m[1].split('#');
    const f = path.join(ROOT, file, file.endsWith('/') ? 'index.html' : '');
    assert.ok(fs.existsSync(f), `404.html references missing ${m[1]}`);
    if (hash) assert.match(read(path.relative(ROOT, f)), new RegExp(`id="${hash}"`), `404.html anchor ${m[1]} not found`);
  }
  const man = JSON.parse(read('site.webmanifest'));
  for (const i of man.icons) assert.ok(fs.existsSync(path.join(ROOT, i.src)), i.src);
});

test('favicon: square files at stable root URLs, ICO has 16/32/48, every page links the same set', () => {
  const png = (f) => { const b = fs.readFileSync(path.join(ROOT, f)); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };
  for (const [f, n] of [['img/favicon-32.png', 32], ['img/favicon-96.png', 96], ['img/icon-192.png', 192], ['img/icon-512.png', 512], ['apple-touch-icon.png', 180]])
    assert.deepEqual(png(f), [n, n], f);
  const ico = fs.readFileSync(path.join(ROOT, 'favicon.ico'));
  assert.deepEqual([...Array(ico.readUInt16LE(4))].map((_, i) => ico[6 + 16 * i]), [16, 32, 48]);
  assert.match(read('favicon.svg'), /^<svg[^>]+viewBox="0 0 512 512"/);
  assert.doesNotMatch(read('robots.txt'), /Disallow:\s*\/(img\/|favicon|$)/m);
  for (const f of [...Object.values(PAGES), '404.html', 'privacy/index.html', 'ru/privacy/index.html']) {
    const icons = [...read(f).matchAll(/<link rel="(?:icon|apple-touch-icon)"[^>]*href="([^"]+)"/g)].map(m => m[1].replace(/^(\.\.\/)+|^\//, ''));
    assert.deepEqual(icons, ['favicon.ico', 'favicon.svg', 'img/favicon-96.png', 'apple-touch-icon.png'], f);
  }
});

test('blog: drafts never published – no /blog/ output, not in sitemap or footer, preview is noindex and git-ignored', () => {
  const md = fs.readdirSync(path.join(ROOT, '_content', 'blog')).filter(f => f.endsWith('.md'));
  const published = md.filter(f => /\nstatus:\s*published/.test(read('_content/blog/' + f)));
  const sm = read('sitemap.xml');
  // _preview/ is git-ignored, so build a fresh copy instead of relying on a local one (CI has none)
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-preview-'));
  fs.cpSync(path.join(ROOT, '_build'), path.join(tmp, '_build'), { recursive: true });
  fs.cpSync(path.join(ROOT, '_content'), path.join(tmp, '_content'), { recursive: true });
  execFileSync('python3', [path.join(tmp, '_build', 'build.py')], { stdio: 'pipe' });
  for (const f of md) {
    const slug = f.split('.')[0], lang = f.split('.')[1];
    const pub = published.includes(f);
    const out = (lang === 'ru' ? 'ru/' : '') + 'blog/' + slug + '/index.html';
    assert.equal(fs.existsSync(path.join(ROOT, out)), pub, out);
    assert.equal(sm.includes('/blog/' + slug + '/'), pub, 'sitemap ' + slug);
    const prev = fs.readFileSync(path.join(tmp, '_preview', out), 'utf8');
    assert.match(prev, /<meta name="robots" content="noindex">/, 'preview noindex ' + out);
  }
  if (!published.length) {
    assert.ok(!fs.existsSync(path.join(ROOT, 'blog')), 'no empty blog index');
    assert.doesNotMatch(read('index.html'), /href="\/blog\/"/, 'no footer link to an empty blog');
  }
  assert.match(read('.gitignore'), /^_preview\/$/m);
});

test('blog: a published article without a real date is refused by the build', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-blog-'));
  fs.mkdirSync(path.join(tmp, '_content', 'blog'), { recursive: true });
  fs.cpSync(path.join(ROOT, '_build'), path.join(tmp, '_build'), { recursive: true });
  fs.writeFileSync(path.join(tmp, '_content', 'blog', 'x-test.en.md'),
    '---\ntitle: T\nslug: x-test\ndescription: D\nlanguage: en\ncategory: guide\nstatus: published\n---\nText\n');
  assert.throws(() => execFileSync('python3', ['-c', 'import sys; sys.path.insert(0, "_build"); import blog; blog.load()'], { cwd: tmp, stdio: 'pipe' }),
    /published_at/);
});

test('Moychay brand: official pattern asset, tokens, logo safe space, motto casing', () => {
  const svg = read('img/brand/moychay-pattern.svg');
  assert.match(svg, /viewBox="0 0 96\.378 68\.031"/);       // the brandbook tiling cell, not a redraw
  assert.match(svg, /fill="#C7A06A"/);
  const html = read('index.html');
  for (const tok of ['--mc-green:#289B38', '--mc-green-dark:#375A3C', '--mc-green-light:#90C685', '--mc-black:#02090D', '--mc-gold:#C7A06A'])
    assert.ok(html.includes(tok), tok);
  assert.match(html, /--pattern:url\(img\/brand\/moychay-pattern\.svg\)/);
  assert.match(read('ru/index.html'), /--pattern:url\(\.\.\/img\/brand\/moychay-pattern\.svg\)/);
  assert.match(html, /\.hdr-logo img\{height:38px/);
  assert.match(html, /\n\}\n\*\{box-sizing:border-box\}/, ':root block closes cleanly before the base rules');
  assert.doesNotMatch(html, /\}\},Inter/);
  assert.match(html, /class="motto">in tea we trust</);
  assert.doesNotMatch(read('_config.yml') + execFileSync('git', ['ls-files'], { cwd: ROOT }).toString(), /\.pdf/i, 'no brandbook PDF in the repo');
});

test('privacy policy: EN/RU pages, linked from every footer, covers the chat, PDPA and the processors', () => {
  for (const [f, lp] of [['privacy/index.html', '/'], ['ru/privacy/index.html', '/ru/']]) {
    const h = read(f);
    assert.match(h, /PDPA/);
    for (const w of ['30', 'PDPC', 'info@phuket.moychay.asia']) assert.ok(h.includes(w), `${f}: ${w}`);
    // PDPA section 23: controller and contacts, purposes and legal bases, data and retention, recipients, transfers, rights
    for (const id of ['controller', 'data', 'purposes', 'required', 'chat', 'recipients', 'transfers', 'retention', 'cookies', 'security', 'rights'])
      assert.match(h, new RegExp(`<h2 id="${id}">`), `${f}: section ${id}`);
    assert.match(h, /0835566044401/, `${f}: registration number`);
    assert.match(h, /Moychay Thai Co\., Ltd\./);
    for (const s of ['24\\(3\\)', '24\\(5\\)', '24\\(6\\)', '28–29']) assert.match(h, new RegExp(s), `${f}: ${s}`);
    // recipients are named by category (what PDPA asks for), not by company: no map of our infrastructure in public
    const rec = h.slice(h.indexOf('<h2 id="recipients">'), h.indexOf('<h2 id="transfers">'));
    assert.equal((rec.match(/<li>/g) || []).length, 7, `${f}: 7 categories of recipients`);
    const text = h.slice(h.indexOf('<h2 id="controller">'), h.indexOf('</main>'));
    assert.doesNotMatch(text, /Anthropic|Cloudflare|GitHub|Google|Yandex|Яндекс|Meta Pixel|Meta Platforms|Turnstile|Telegram-чат|staff Telegram/, f);
    // internal company data from the registration certificate stays private
    assert.doesNotMatch(h, /วิกันดา|ชูใหม|4,000,000|ทุนจดทะเบียน|registered capital|уставн/i, f);
    assert.match(h, new RegExp(`<link rel="canonical" href="https://teaphuket.com${lp}privacy/">`));
  }
  for (const f of [...Object.values(PAGES), 'privacy/index.html', 'ru/privacy/index.html']) {
    const lp = f.startsWith('ru/') ? '/ru/' : '/';
    assert.ok(read(f).includes(`class="ftr-legal" href="${lp}privacy/"`), `${f}: footer privacy link`);
  }
});

test('Yandex Metrica: official counter on every page, skipped for bots; Webvisor never records chat or form input', () => {
  for (const f of [...Object.values(PAGES), '404.html', 'privacy/index.html', 'ru/privacy/index.html']) {
    const h = read(f);
    assert.match(h, /YM_ID:\s+"113664767"/, f);
    assert.match(h, /mc\.yandex\.ru\/metrika\/tag\.js\?id=' \+ S\.YM_ID/, f);
    assert.match(h, /if \(S\.YM_ID && !bot\)/, f);
    assert.match(h, /webvisor: true, clickmap: true, ecommerce: 'dataLayer'/, f);
    assert.match(h, /<noscript><div><img src="https:\/\/mc\.yandex\.ru\/watch\/113664767"/, f);
    assert.equal((h.match(/metrika\/tag\.js/g) || []).length, 1, f);
  }
  for (const f of ['contact/index.html', 'ru/contact/index.html', 'wholesale/index.html', 'ru/wholesale/index.html']) {
    const h = read(f);
    assert.match(h, /<form class="form ym-hide-content"/, f);
    const fields = h.match(/<(input|textarea|select)\b(?![^>]*type="hidden")[^>]*>/g).filter((x) => !/name="website"/.test(x));
    assert.ok(fields.length >= 3 && fields.every((x) => /ym-disable-keys/.test(x)), f);
  }
  const cha = read('js/cha.js');
  assert.match(cha, /cha-log ym-hide-content/);
  assert.match(cha, /cha-in ym-disable-keys/);
  assert.match(read('privacy/index.html'), /What you type into the chat and the forms is excluded/);
  assert.match(read('ru/privacy/index.html'), /Текст, который вы вводите в чат и формы, в эти записи не попадает/);
});

test('SBP: one wording "Принимаем рубли по СБП" with the official mark, RU only, never about the online shop', () => {
  const logo = read('_build/assets/sbp.svg');
  const colours = ['#5B57A2', '#D90751', '#FAB718', '#ED6F26', '#63B22F', '#1487C9', '#017F36', '#984995'];
  for (const c of colours) assert.ok(logo.includes(c), `logo colour ${c}`);
  // EN never mentions SBP
  for (const f of Object.values(PAGES).filter((f) => !f.startsWith('ru/')).concat('privacy/index.html'))
    assert.doesNotMatch(read(f), /СБП|Систем[аы] быстрых платежей|\bSBP\b|class="sbp/, f);
  // RU: once by each price list / contacts / wholesale and once in the footer – not by every price
  const expect = { 'ru/index.html': 3, 'ru/ceremonies/index.html': 2, 'ru/events/index.html': 2, 'ru/matcha/index.html': 2,
    'ru/wholesale/index.html': 2, 'ru/contact/index.html': 2, 'ru/tea/index.html': 1, 'ru/privacy/index.html': 1 };
  for (const [f, n] of Object.entries(expect)) {
    const h = read(f);
    const lines = h.match(/<p class="sbp[^"]*">[\s\S]*?<\/p>/g) || [];
    assert.equal(lines.length, n, `${f}: SBP lines`);
    for (const m of lines) {
      assert.match(m, /^<p class="sbp[^"]*"><svg class="pay-logo" viewBox="0 0 97 120"[^>]*aria-hidden="true">[\s\S]*<\/svg><span>Принимаем рубли по СБП<\/span><\/p>$/, `${f}: the one wording`);
      for (const c of colours) assert.ok(m.includes(c), `${f}: logo colour ${c}`);
    }
    assert.match(h, /<div class="ftr-col ftr-contact">[\s\S]*?<p class="sbp sbp-ftr">/, `${f}: footer`);
    assert.doesNotMatch(h, /При оплате в чайной|доступна оплата|Оплата в чайной|Принимаем оплату по СБП|class="pay"/, `${f}: no old wordings`);
    assert.match(h, /\.sbp \.pay-logo\{width:15px;height:18px/, `${f}: the size of the contact icons`);
  }
  assert.match(read('ru/ceremonies/index.html'), /<\/ul><p class="sbp">/, 'once under the list of formats');
  assert.ok(!fs.existsSync(path.join(ROOT, 'img/brand/sbp.svg')), 'the mark lives in _build/assets only');
  assert.doesNotMatch(read('ru/ceremonies/index.html'), /\d\s?(₽|руб)/, 'prices stay in baht');
});

test('online shop block: plain sentences from commerce.py, code as bold text, no badges or widgets', () => {
  const cm = fs.readFileSync(path.join(ROOT, '_build/commerce.py'), 'utf8');
  const enabled = /^PROMO_ENABLED = True/m.test(cm);
  for (const [f, h2, cta, ship, promo] of [
    ['index.html', 'Your favorite tea, delivered', 'Shop tea online', 'Delivery across Thailand is free on orders from 2000฿. International orders are shipped via DHL.', 'Get 10% off your first order with code <b>MOYCHAY</b>.'],
    ['ru/index.html', 'Любимый чай – с доставкой', 'Купить чай онлайн', 'Доставка по Таиланду – бесплатно от 2000฿. Международные заказы отправляем через DHL.', 'Скидка 10% на первый заказ по промокоду <b>MOYCHAY</b>.'],
    ['tea/index.html', null, 'Shop tea online', 'Delivery across Thailand is free on orders from 2000฿.', 'with code <b>MOYCHAY</b>'],
    ['ru/tea/index.html', null, 'Купить чай онлайн', 'бесплатно от 2000฿.', 'по промокоду <b>MOYCHAY</b>']]) {
    const h = read(f);
    const blk = h.slice(h.indexOf('<div class="shop-copy'), h.indexOf('</section>', h.indexOf('<div class="shop-copy')));
    if (h2) assert.ok(blk.includes(`<h2 id="shop-h">${h2}</h2>`), `${f}: h2`);
    assert.ok(blk.includes(ship), `${f}: delivery`);
    if (enabled) assert.ok(blk.includes(promo), `${f}: promo sentence`);
    else assert.doesNotMatch(blk.replace(/<[^>]+>/g, ' '), /\d+\s?%/, `${f}: no percentage until confirmed`);
    assert.doesNotMatch(blk, /<button|<ul|<li|promo-|perk|data-copy|shop-note|–10%|i-truck|i-copy/, `${f}: no badges, lists or copy widgets`);
    assert.match(blk, /href="https:\/\/phuket\.moychay\.asia\/" target="_blank" rel="noopener" data-track="online_shop_click"/, `${f}: CTA keeps the conversion`);
    assert.ok(blk.includes(cta), `${f}: CTA text`);
    assert.doesNotMatch(blk, /more than 200|более 200/, `${f}: no long list of shop facts`);
  }
  const kb = read('_content/assistant/site/payment-and-offers.md');
  assert.match(kb, /SBP is NOT available in the online shop/);
  assert.match(kb, /2000 THB/);
  assert.ok(enabled ? /10% off the first order/.test(kb) : /never state a percentage/.test(kb));
});

test('Moychay network: 7 cities incl. Utrecht, the same on every page and for Cha (one source: network.py)', () => {
  const en = 'Amsterdam, Barcelona, Yerevan, Tbilisi, Phuket, Atlanta and Utrecht';
  const ru = 'Амстердам, Барселона, Ереван, Тбилиси, Пхукет, Атланта и Утрехт';
  for (const [f, list] of [['index.html', en], ['wholesale/index.html', en], ['ru/index.html', ru], ['ru/wholesale/index.html', ru]]) {
    const h = read(f);
    assert.match(h, new RegExp(`<b>7</b><span>[^<]*${list}</span>`), `${f}: 7 cities`);
    assert.doesNotMatch(h, /<b>6<\/b>|6 cities|6 городов/, f);
  }
  for (const f of ['index.html', 'tea/index.html']) assert.ok(read(f).includes('tea clubs in Barcelona, Yerevan, Tbilisi, Phuket, Atlanta and Utrecht.'), f);
  for (const f of ['ru/index.html', 'ru/tea/index.html']) assert.ok(read(f).includes('чайные клубы – в Барселоне, Ереване, Тбилиси, на Пхукете, в Атланте и Утрехте.'), f);
  for (const f of ['home.md', 'tea.md', 'wholesale.md']) {
    const kb = read('_content/assistant/site/' + f);
    assert.match(kb, /Utrecht/, f);
    assert.doesNotMatch(kb, /6 cities|and Atlanta\b/, f);
  }
});

test('"Your quiet place" ends with one editorial paragraph, not a list', () => {
  for (const [f, text] of [['index.html', 'We have more than 200 teas, a collection of antique teaware, board games and a cosy reading corner. Some of the teaware is for sale – the tea master will help you choose. We speak English, Russian and Thai.'],
    ['ru/index.html', 'У нас больше 200 сортов чая, коллекция антикварной посуды, настольные игры и уютный уголок для чтения. Часть посуды можно приобрести – чайный мастер поможет выбрать. Мы говорим на русском, английском и тайском.']]) {
    const h = read(f);
    const blk = h.slice(h.indexOf('id="why-visit"'), h.indexOf('id="gallery"'));
    assert.ok(blk.includes(`<p id="highlights">${text}</p>`), f);
    assert.doesNotMatch(blk, /<ul|<li|class="facts"/, `${f}: no list`);
    assert.equal((blk.match(/можно купить|можно приобрести|for sale/g) || []).length, 1, `${f}: "for sale" is said once`);
  }
  assert.doesNotMatch(read('index.html'), /\.facts\{/, 'no leftover list styles');
});
