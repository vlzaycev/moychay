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
const PAGES = { en: 'index.html', ru: 'ru/index.html' };

test('build is reproducible: _build/build.py output == committed HTML', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-build-'));
  fs.cpSync(path.join(ROOT, '_build'), path.join(tmp, '_build'), { recursive: true });
  execFileSync('python3', [path.join(tmp, '_build', 'build.py')], { stdio: 'pipe' });
  for (const f of Object.values(PAGES)) {
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
      const target = path.resolve(base, r);
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
  const en = shape(read(PAGES.en)), ru = shape(read(PAGES.ru));
  assert.equal(en.ids, ru.ids);
  assert.equal(en.sections, ru.sections);
  // RU has 1 extra Telegram club link in events + 2 extra footer icons (Yandex Maps, Telegram)
  assert.equal(ru.tracked - en.tracked, 3);
});

test('robots.txt, sitemap.xml and CNAME are valid', () => {
  assert.match(read('robots.txt'), /Sitemap: https:\/\/teaphuket\.com\/sitemap\.xml/);
  const sm = read('sitemap.xml');
  assert.match(sm, /<loc>https:\/\/teaphuket\.com\/<\/loc>/);
  assert.match(sm, /<loc>https:\/\/teaphuket\.com\/ru\/<\/loc>/);
  assert.equal(read('CNAME').trim(), 'teaphuket.com');
});

test('JSON-LD parses and has required LocalBusiness fields', () => {
  for (const f of Object.values(PAGES)) {
    const m = read(f).match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    const ld = JSON.parse(m[1]);
    for (const k of ['name', 'address', 'geo', 'openingHoursSpecification', 'telephone', 'url', 'hasMap', 'sameAs']) assert.ok(ld[k], `${f}: ${k}`);
  }
});

test('no secrets / tokens committed in tracked files', () => {
  const files = execFileSync('git', ['ls-files'], { cwd: ROOT }).toString().split('\n')
    .filter(f => f && !/\.(jpg|png|ico|webp)$/.test(f) && !f.startsWith('_qa/'));
  const pat = /(github_pat_[A-Za-z0-9_]{20,}|ghp_[A-Za-z0-9]{30,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{35}|-----BEGIN [A-Z ]*PRIVATE KEY-----|xox[bp]-[0-9A-Za-z-]{10,})/;
  const hits = files.filter(f => pat.test(fs.readFileSync(path.join(ROOT, f), 'utf8')));
  assert.deepEqual(hits, []);
});

test('Google Tag Manager and Search Console verification are on both pages', () => {
  for (const f of Object.values(PAGES)) {
    const html = read(f);
    const head = html.slice(0, html.indexOf('</head>'));
    assert.match(head, /gtm\.js\?id='\+i\+dl[\s\S]*'GTM-[A-Z0-9]+'/, `${f}: GTM snippet in <head>`);
    assert.ok(head.indexOf('Google Tag Manager') < head.indexOf('<title>'), `${f}: GTM must be high in <head>`);
    assert.match(html, /<body>\n<!-- Google Tag Manager \(noscript\) -->/, `${f}: GTM noscript right after <body>`);
    assert.match(head, /<meta name="google-site-verification" content="[\w-]{20,}">/, `${f}: GSC tag`);
  }
});

test('404 page and web manifest are valid', () => {
  const nf = read('404.html');
  assert.match(nf, /<meta name="robots" content="noindex">/);
  for (const m of nf.matchAll(/(?:src|href)="(\/[^"]*)"/g)) {
    const f = path.join(ROOT, m[1]);
    assert.ok(m[1] === '/' || m[1] === '/ru/' || fs.existsSync(f), `404.html references missing ${m[1]}`);
  }
  const man = JSON.parse(read('site.webmanifest'));
  for (const i of man.icons) assert.ok(fs.existsSync(path.join(ROOT, i.src)), i.src);
});
