// Cha chat widget in the browser. The chat API is faked with page.route (no Worker, no AI, no Telegram):
// these tests cover the widget – loading, layout, accessibility, rendering safety, handoff UI, restore, analytics.
// The Worker itself is covered by _qa/unit/chat.test.mjs.
const { test, expect } = require('./test');
const { mockEvents } = require('./helpers');

const EP = 'http://127.0.0.1:8787/api/chat';

function fakeApi(page, { reply } = {}) {
  const s = { status: 'ai_active', seq: 0, msgs: [], calls: [] };
  const add = (m) => { m.seq = ++s.seq; m.at = Date.now(); s.msgs.push(m); return m; };
  s.add = add;
  page.route(EP + '/**', async (route) => {
    const req = route.request();
    const u = new URL(req.url());
    const action = u.pathname.split('/').pop();
    const body = req.postData() ? JSON.parse(req.postData()) : {};
    s.calls.push({ action, body, auth: req.headers().authorization || '' });
    const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const out = (o) => route.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify({ ok: true, ...o }) });
    const after = (n) => s.msgs.filter((m) => m.seq > n);
    if (action === 'start') return out({ token: 'cs_' + 'a'.repeat(43), status: s.status, messages: [] });
    if (action === 'poll') return out({ status: s.status, messages: after(Number(u.searchParams.get('after') || 0)) });
    if (action === 'send') {
      const before = s.seq;
      add({ sender: 'visitor', text: body.text });
      if (s.status === 'ai_active') add(reply ? reply(body.text) : { sender: 'assistant', text: 'We hold gong fu cha ceremonies daily.', buttons: ['ceremonies', 'shop'] });
      return out({ status: s.status, messages: after(before) });
    }
    if (action === 'human') {
      const before = s.seq;
      s.status = 'human_requested';
      add({ sender: 'system', text: "I've passed your request to the Moychay team.", buttons: ['whatsapp', 'telegram', 'contact'], lead_form: true, event: 'handoff_requested' });
      return out({ status: s.status, messages: after(before) });
    }
    if (action === 'lang') return out({ lang: body.lang });
    return route.fulfill({ status: 404, body: '{}' });
  });
  return s;
}

async function enable(page, { teaserSeen = true } = {}) {
  await page.addInitScript(([ep, seen]) => {
    localStorage.setItem('cha_endpoint', ep);
    if (seen) localStorage.setItem('cha_teaser', '1');
    window.__track = [];
    const wrap = () => {
      if (window.track && !window.track.__w) { const o = window.track; window.track = function () { window.__track.push([...arguments]); return o.apply(this, arguments); }; window.track.__w = 1; }
      else if (!window.track) setTimeout(wrap, 20);
    };
    wrap();
  }, [EP, teaserSeen]);
}

test.beforeEach(async ({ page }) => { await mockEvents(page); });

test('off by default: no chat button, no chat code, no chat requests (production config has no endpoint yet)', async ({ page }) => {
  const reqs = [];
  page.on('request', (r) => { if (/cha\.js|\/api\/chat/.test(r.url())) reqs.push(r.url()); });
  await page.goto('/');
  await page.waitForLoadState('load');
  await page.waitForTimeout(500);
  await expect(page.locator('#cha-launch')).toBeHidden();
  expect(reqs).toEqual([]);
});

test('lazy: the chat code loads on click, not with the page', async ({ page }) => {
  await enable(page);
  fakeApi(page);
  const loads = [];
  page.on('request', (r) => { if (/js\/cha\.js/.test(r.url())) loads.push(r.url()); });
  await page.goto('/');
  await page.waitForLoadState('load');
  await page.waitForTimeout(800);
  expect(loads).toEqual([]);
  await expect(page.locator('#cha-launch')).toBeVisible();
  await page.locator('#cha-launch').click();
  await expect(page.locator('.cha.on')).toBeVisible();
  expect(loads.length).toBe(1);
});

test('launcher never covers the sticky bar buttons', async ({ page }) => {
  await enable(page);
  fakeApi(page);
  await page.goto('/');
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
  await page.waitForTimeout(800);
  const bar = page.locator('#bar.on');
  if (await bar.count()) {
    const l = await page.locator('#cha-launch').boundingBox();
    for (const b of await bar.locator('a').all()) {
      const r = await b.boundingBox();
      if (!r) continue;
      const overlap = l.x < r.x + r.width && l.x + l.width > r.x && l.y < r.y + r.height && l.y + l.height > r.y;
      expect(overlap, 'launcher overlaps a sticky bar button').toBe(false);
    }
  }
});

for (const [path, name, sub, greet, human, quick, ask] of [
  ['/', 'Cha', 'Here to help', "Hi! I'm Cha, Moychay Phuket's virtual tea guide. Looking for tea, a ceremony, or directions? Just ask!", 'Talk to a person', ['Choose tea', 'Tea ceremonies', 'Find us'], 'Ask Cha'],
  ['/ru/', 'Ча', 'Помогу с чаем и визитом', 'Привет! Я Ча, виртуальный консультант Moychay Phuket. Помогу выбрать чай, узнать о церемониях или найти нашу чайную. Что подсказать?', 'Связаться с человеком', ['Выбрать чай', 'Церемонии', 'Как нас найти'], 'Спросить Ча'],
]) {
  test(`panel ${path}: clean header, page language, greeting, 3 quick actions, keyboard`, async ({ page }) => {
    await enable(page);
    fakeApi(page);
    await page.goto(path);
    await expect(page.locator('#cha-launch')).toHaveAttribute('aria-label', ask);
    if (page.viewportSize().width >= 600) await expect(page.locator('#cha-launch .cha-ask')).toHaveText(ask);
    else await expect(page.locator('#cha-launch .cha-ask')).toBeHidden();
    await page.locator('#cha-launch').click();
    const panel = page.locator('#cha-panel');
    await expect(panel).toHaveAttribute('role', 'dialog');
    await expect(page.locator('#cha-launch')).toHaveAttribute('aria-expanded', 'true');
    await expect(panel.locator('.cha-log')).toHaveAttribute('aria-live', 'polite');
    await expect(panel.locator('.cha-name')).toHaveText(name);
    await expect(panel.locator('.cha-sub')).toHaveText(sub);
    await expect(panel.locator('.cha-m.a').first()).toHaveText(greet);
    await expect(panel.locator('.cha-quick .cha-chip')).toHaveText(quick);
    // the greeting, the three quick actions and the input fit the first screen of the chat
    for (const sel of ['.cha-m.a', '.cha-quick', '.cha-in', '.cha-human']) await expect(panel.locator(sel).first()).toBeInViewport();
    await expect(panel.locator('.cha-human')).toHaveText(human);
    // no language switch, no notice block, no privacy / AI links inside the widget
    await expect(panel.locator('.cha-langs, .cha-note, a[href*="privacy"]')).toHaveCount(0);
    const text = await panel.innerText();
    expect(text).not.toMatch(/AI[- ]?(assistant|помощник|tea assistant)|Privacy|Конфиденциальн|ไทย|\bTH\b|concierge|консьерж/i);
    expect(await panel.locator('.cha-hd').innerText()).not.toMatch(/assistant|concierge|\bAI\b|\bbot\b|ассистент|бот/i);
    await expect(panel.locator('.cha-in')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
    await expect(page.locator('#cha-launch')).toBeFocused();
  });
}

test('messages: answer with fixed-URL buttons, HTML shown as text, only known links clickable', async ({ page }) => {
  await enable(page);
  fakeApi(page, { reply: () => ({ sender: 'assistant', text: '<img src=x onerror="window.__xss=1"> See https://teaphuket.com/tea/ and https://evil.example/phish', buttons: ['shop', 'directions'] }) });
  await page.goto('/');
  await page.locator('#cha-launch').click();
  await page.locator('.cha-in').fill('Which tea?');
  await page.locator('.cha-in').press('Enter');
  const ans = page.locator('.cha-m.a').nth(1);
  await expect(ans).toContainText('<img src=x');
  expect(await page.evaluate(() => window.__xss)).toBeUndefined();
  await expect(ans.locator('img')).toHaveCount(0);
  await expect(ans.locator('a')).toHaveCount(1);
  await expect(ans.locator('a')).toHaveAttribute('href', 'https://teaphuket.com/tea/');
  await expect(ans.locator('a')).toHaveAttribute('rel', /noopener/);
  await expect(page.locator('.cha-acts a', { hasText: 'Online shop' })).toHaveAttribute('href', 'https://phuket.moychay.asia/');
  await expect(page.locator('.cha-acts a', { hasText: 'Get directions' })).toHaveAttribute('href', /maps\.app\.goo\.gl/);
});

test('switching EN → RU on the site: the widget follows the page, the conversation stays; analytics get event names only', async ({ page }) => {
  await enable(page);
  const api = fakeApi(page);
  await page.goto('/');
  await page.locator('#cha-launch').click();
  await page.locator('.cha-in').fill('my secret question about oolong');
  await page.locator('.cha-in').press('Enter');
  await expect(page.locator('.cha-m.a').nth(1)).toBeVisible();
  await expect(page.locator('.cha-quick')).toHaveCount(0);           // start buttons go away once the chat has begun
  await expect(page.locator('.cha-human')).toBeVisible();            // "Talk to a person" stays
  await page.locator('.cha-acts a[href$="ceremonies/"]').first().evaluate((a) => a.addEventListener('click', (e) => e.preventDefault()));
  await page.locator('.cha-acts a[href$="ceremonies/"]').first().click();
  const tr = await page.evaluate(() => window.__track);
  const names = tr.map((x) => x[0]);
  for (const n of ['chat_open', 'chat_started', 'chat_message_sent', 'chat_ceremony_click']) expect(names).toContain(n);
  expect(JSON.stringify(tr)).not.toContain('oolong');
  // the visitor switches the site language
  await page.goto('/ru/');
  await page.locator('#cha-launch').click();
  await expect(page.locator('.cha-sub')).toHaveText('Помогу с чаем и визитом');
  await expect(page.locator('.cha-human')).toHaveText('Связаться с человеком');
  await expect(page.locator('.cha-m.v')).toContainText('my secret question about oolong');   // not translated, not lost
  await expect(page.locator('.cha-m.a').first()).toContainText('Привет! Я Ча, виртуальный консультант');
  expect(api.calls.some((c) => c.action === 'lang' && c.body.lang === 'ru')).toBe(true);
  await page.locator('.cha-in').fill('А матча есть?');
  await page.locator('.cha-in').press('Enter');
  await expect.poll(() => api.calls.filter((c) => c.action === 'send').at(-1)?.body.lang).toBe('ru');
});

test('handoff: waiting state, team reply appears without reload, conversation restores after reload', async ({ page }) => {
  await enable(page);
  const api = fakeApi(page);
  await page.goto('/ceremonies/');
  await page.locator('#cha-launch').click();
  await page.locator('.cha-human').click();          // "Talk to a person"
  await expect(page.locator('.cha-state')).toContainText('Waiting for the team');
  await expect(page.locator('.cha-human')).toBeHidden();
  await expect(page.locator('.cha-lead input')).toBeVisible();
  api.status = 'human_active';
  api.add({ sender: 'system', text: 'A Moychay Phuket team member has joined the chat.', event: 'handoff_accepted' });
  api.add({ sender: 'operator', text: 'Hi! Igor here, how can I help?' });
  await expect(page.locator('.cha-m.o')).toContainText('Igor here', { timeout: 8000 });
  await expect(page.locator('.cha-state')).toContainText('A Moychay Phuket team member is in the chat');
  await page.reload();
  await page.locator('#cha-launch').click();
  await expect(page.locator('.cha-m.o')).toContainText('Igor here');
  expect(api.calls.filter((c) => c.action === 'start').length).toBe(1);
  expect(api.calls.filter((c) => c.action === 'poll').every((c) => c.auth === 'Bearer cs_' + 'a'.repeat(43))).toBe(true);
});

test('fits the screen: no horizontal scroll, input and send button visible', async ({ page }) => {
  await enable(page);
  fakeApi(page);
  await page.goto('/');
  await page.locator('#cha-launch').click();
  await expect(page.locator('.cha.on')).toBeVisible();
  const vw = page.viewportSize().width;
  const p = await page.locator('#cha-panel').boundingBox();
  expect(p.x).toBeGreaterThanOrEqual(0);
  expect(p.x + p.width).toBeLessThanOrEqual(vw + 1);
  await expect(page.locator('.cha-in')).toBeInViewport();
  await expect(page.locator('.cha-send')).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
});
