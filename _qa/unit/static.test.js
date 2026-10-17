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
  assert.equal(locs.length, 14);
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
