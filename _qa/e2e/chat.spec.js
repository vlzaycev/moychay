// Cha chat widget in the browser. The chat API is faked with page.route (no Worker, no AI, no Telegram):
// these tests cover the widget – loading, layout, accessibility, rendering safety, handoff UI, restore, analytics.
// The Worker itself is covered by _qa/unit/chat.test.mjs.
const { test, expect } = require('./test');
const { mockEvents } = require('./helpers');

// same origin as the site, like production: browsers send no Origin header on these GET requests
const EP = '/api/chat';

function fakeApi(page, { reply, stream = false, delay = 0 } = {}) {
  const s = { status: 'ai_active', seq: 0, msgs: [], calls: [] };
  // Playwright's WebKit wipes localStorage when a mocked response sets a Secure cookie on http://localhost
  // (the test server). Production is HTTPS; WebKit runs here without the cookie, Chromium checks it.
  const noCookie = page.context().browser().browserType().name() === 'webkit';
  const add = (m) => { m.seq = ++s.seq; m.at = Date.now(); s.msgs.push(m); return m; };
  s.add = add;
  page.route('**/api/chat/**', async (route) => {
    const req = route.request();
    const u = new URL(req.url());
    const action = u.pathname.split('/').pop();
    const body = req.postData() ? JSON.parse(req.postData()) : {};
    s.calls.push({ action, body, wait: u.searchParams.get('wait'), auth: req.headers().authorization || '', origin: req.headers().origin || '',
      cookie: (await req.headerValue('cookie')) || '' });
    const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const out = (o, h = {}) => route.fulfill({ status: 200, contentType: 'application/json', headers: { ...cors, ...h }, body: JSON.stringify({ ok: true, ...o }) });
    const COOKIE = '__Secure-cha_s=cs_' + 'a'.repeat(43) + '; Path=/api/chat; Max-Age=2592000; HttpOnly; Secure; SameSite=Strict';
    const after = (n) => s.msgs.filter((m) => m.seq > n);
    // like the Worker: the current widget asks for the cookie and gets no token; an old widget would get the token
    if (action === 'start') return body.cookie ? out({ status: s.status, messages: [] }, noCookie ? {} : { 'Set-Cookie': COOKIE }) : out({ token: 'cs_' + 'a'.repeat(43), status: s.status, messages: [] });
    if (action === 'adopt') return out({}, noCookie ? {} : { 'Set-Cookie': COOKIE });
    if (action === 'end') return out({}, { 'Set-Cookie': '__Secure-cha_s=; Path=/api/chat; Max-Age=0; HttpOnly; Secure; SameSite=Strict' });
    if (action === 'poll') return out({ status: s.status, messages: after(Number(u.searchParams.get('after') || 0)) });
    if (action === 'send') {
      const before = s.seq;
      const v = add({ sender: 'visitor', text: body.text });
      if (delay) await new Promise((r) => setTimeout(r, delay));
      if (s.status === 'ai_active') add(reply ? reply(body.text) : { sender: 'assistant', text: 'We hold gong fu cha ceremonies daily.', buttons: ['ceremonies', 'shop'] });
      if (stream && body.stream) {                 // the Worker's server-sent events: visitor → deltas → done
        const a = s.msgs.find((m) => m.seq > v.seq && m.sender === 'assistant');
        const words = a ? a.text.split(/(?<= )/) : [];
        const ev = (e, d) => `event: ${e}\ndata: ${JSON.stringify(d)}\n\n`;
        const body2 = ev('visitor', { message: v }) + words.map((w, i) => ev('delta', i ? { add: w } : { text: w })).join('') +
          ev('delta', { add: '' }) + ev('done', { ok: true, status: s.status, messages: after(before) });
        return route.fulfill({ status: 200, contentType: 'text/event-stream', headers: cors, body: body2 });
      }
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

async function enable(page, { invite = false } = {}) {
  await page.addInitScript(([ep, inv]) => {
    localStorage.setItem('cha_endpoint', ep);
    if (!inv && !sessionStorage.getItem('cha_t0')) sessionStorage.setItem('cha_invite', '1');
    window.__track = [];
    const wrap = () => {
      if (window.track && !window.track.__w) { const o = window.track; window.track = function () { window.__track.push([...arguments]); return o.apply(this, arguments); }; window.track.__w = 1; }
      else if (!window.track) setTimeout(wrap, 20);
    };
    wrap();
  }, [EP, invite]);
}

test.beforeEach(async ({ page }) => { await mockEvents(page); });

test('live config: the chat button is on, but nothing calls the chat API until the visitor uses it', async ({ page }) => {
  const reqs = [];
  page.on('request', (r) => { if (/\/api\/chat/.test(r.url())) reqs.push(r.url()); });
  await page.goto('/');
  await page.waitForLoadState('load');
  await page.waitForTimeout(500);
  await expect(page.locator('#cha-launch')).toBeVisible();
  expect(await page.evaluate(() => window.SITE.CHAT.endpoint)).toBe('/api/chat');
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
    await expect(page.locator('#cha-launch .cha-ask')).toHaveText(ask);
    await expect(page.locator('#cha-launch .cha-ask')).toBeHidden();          // shown only by the invitation
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
    // with a mouse the field is ready to type; on touch screens the keyboard opens only when the visitor taps it
    if (await page.evaluate(() => matchMedia('(pointer:fine)').matches)) await expect(panel.locator('.cha-in')).toBeFocused();
    else await expect(panel.locator('.cha-in')).not.toBeFocused();
    await panel.locator('.cha-in').focus();
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
  await expect(page.locator('.cha-state')).toHaveText('Waiting for our team');
  await expect(page.locator('.cha-human')).toBeHidden();
  await expect(page.locator('.cha-m.s')).toHaveCount(0);                       // no status bubbles in the conversation
  await expect(page.locator('.cha-lead')).toHaveCount(0);                      // contact field only after a long wait
  api.status = 'human_active';
  api.add({ sender: 'system', text: "You're chatting with our team", event: 'handoff_accepted' });
  api.add({ sender: 'operator', text: 'Hi! Igor here, how can I help?' });
  await expect(page.locator('.cha-m.o')).toContainText('Igor here', { timeout: 8000 });
  await expect(page.locator('.cha-m.o .cha-by')).toHaveText('Moychay Phuket Team');            // no names or usernames of staff
  await expect(page.locator('.cha-state')).toHaveText("You're chatting with our team");
  await expect(page.locator('.cha-m.s')).toHaveCount(0);
  await page.reload();
  await page.locator('#cha-launch').click();
  await expect(page.locator('.cha-m.o')).toContainText('Igor here');
  expect(api.calls.filter((c) => c.action === 'start').length).toBe(1);
  const polls = api.calls.filter((c) => c.action === 'poll');
  expect(polls.length).toBeGreaterThan(0);
  // the session travels as the HttpOnly cookie only: no Authorization header, nothing secret in localStorage or in page scripts
  expect(polls.every((c) => !c.auth)).toBe(true);
  // WebKit keeps no Secure cookies on http://localhost (the test server); production is HTTPS. Chromium checks the cookie itself.
  if (test.info().project.name.startsWith('chromium')) expect(polls.every((c) => c.cookie.includes('__Secure-cha_s=cs_'))).toBe(true);
  expect(polls.every((c) => c.origin === '')).toBe(true);                       // what production sees: no Origin on same-origin GET
  expect(api.calls.find((c) => c.action === 'start').body.cookie).toBe(true);
  const stored = await page.evaluate(() => JSON.stringify(localStorage) + document.cookie);
  expect(stored).not.toContain('cs_');
});

test('an older visitor with the token in localStorage: it moves into the cookie once and leaves localStorage', async ({ page }) => {
  await enable(page);
  const api = fakeApi(page);
  api.status = 'human_active';
  api.add({ sender: 'operator', text: 'Earlier reply from the team' });
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('legacy_set')) {
      localStorage.setItem('cha_session', JSON.stringify({ token: 'cs_' + 'b'.repeat(43), status: 'human_active', lang: 'en', at: Date.now() }));
      sessionStorage.setItem('legacy_set', '1');
    }
  });
  await page.goto('/');
  await expect.poll(() => api.calls.filter((c) => c.action === 'adopt').length, { timeout: 15000 }).toBe(1);   // the chat code loads when the page is idle
  const adopt = api.calls.find((c) => c.action === 'adopt');
  expect(adopt.auth).toBe('Bearer cs_' + 'b'.repeat(43));
  await expect.poll(() => page.evaluate(() => localStorage.getItem('cha_session')), { timeout: 15000 }).not.toContain('cs_');
  await page.locator('#cha-launch').click();
  await expect(page.locator('.cha-m.o')).toContainText('Earlier reply from the team');
  const after = api.calls.slice(api.calls.indexOf(adopt) + 1);
  expect(after.length).toBeGreaterThan(0);
  expect(after.every((c) => !c.auth)).toBe(true);
  if (test.info().project.name.startsWith('chromium')) expect(after.every((c) => c.cookie.includes('__Secure-cha_s='))).toBe(true);
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


test('waiting long for the team: one compact offer of messengers and a contact field', async ({ page }) => {
  await page.clock.install();
  await enable(page);
  fakeApi(page);
  await page.goto('/ru/');
  await page.locator('#cha-launch').click();
  await page.locator('.cha-human').click();
  await expect(page.locator('.cha-state')).toHaveText('Ждём сотрудника');
  await page.clock.fastForward(125000);
  await expect(page.locator('.cha-wait')).toHaveCount(1);
  await expect(page.locator('.cha-wait .cha-lead input')).toBeVisible();
  await expect(page.locator('.cha-wait .cha-acts a').first()).toHaveText('Telegram');
});

for (const [path, ask] of [['/', 'Ask Cha'], ['/ru/', 'Спросить Ча']]) {
  test(`invitation on ${path}: "${ask}" after 5 s, once per session, opens the chat`, async ({ page }) => {
    await page.clock.install();
    await enable(page, { invite: true });
    fakeApi(page);
    await page.goto(path);
    await page.clock.fastForward(3000);
    await expect(page.locator('#cha-launch.invite')).toHaveCount(0);
    await page.clock.fastForward(4000);
    await expect(page.locator('#cha-launch.invite .cha-ask')).toBeVisible();
    await expect(page.locator('#cha-launch .cha-ask')).toHaveText(ask);
    await expect(page.locator('.cha-invite-x')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
    await page.locator('#cha-launch').click();
    await expect(page.locator('.cha.on')).toBeVisible();
    await expect(page.locator('#cha-launch.invite')).toHaveCount(0);
    // same session, back on the home page: not shown again
    await page.reload();
    await page.clock.fastForward(8000);
    await expect(page.locator('#cha-launch.invite')).toHaveCount(0);
  });
}

test('invitation: not on inner pages, and it can be dismissed', async ({ page }) => {
  await page.clock.install();
  await enable(page, { invite: true });
  fakeApi(page);
  await page.goto('/tea/');
  await page.clock.fastForward(8000);
  await expect(page.locator('#cha-launch.invite')).toHaveCount(0);
  await page.goto('/');
  await page.clock.fastForward(8000);
  await expect(page.locator('#cha-launch.invite')).toHaveCount(1);
  await page.locator('.cha-invite-x').click();
  await expect(page.locator('#cha-launch.invite')).toHaveCount(0);
  await expect(page.locator('#cha-launch')).toBeVisible();
});

test('phones: the page behind the open chat does not scroll and comes back to the same place', async ({ page }) => {
  test.skip(page.viewportSize().width >= 600, 'phone layout only');
  await enable(page);
  fakeApi(page);
  await page.goto('/');
  await page.evaluate(() => window.scrollTo({ top: 1200, behavior: 'instant' }));
  await page.waitForTimeout(300);
  const y = await page.evaluate(() => scrollY);
  await page.locator('#cha-launch').click();
  await expect(page.locator('.cha.on')).toBeVisible();
  expect(await page.evaluate(() => getComputedStyle(document.body).position)).toBe('fixed');
  await page.locator('.cha-in').focus();
  // the keyboard: the visible area shrinks – the input must stay above it
  await page.setViewportSize({ width: page.viewportSize().width, height: 420 });
  await page.waitForTimeout(400);
  await expect(page.locator('.cha-in')).toBeInViewport();
  const box = await page.locator('#cha-panel').boundingBox();
  expect(box.y + box.height).toBeLessThanOrEqual(421);
  await page.keyboard.press('Escape');
  await expect(page.locator('#cha-panel')).toBeHidden();
  expect(Math.abs(await page.evaluate(() => scrollY) - y)).toBeLessThan(2);
});

test('AI: three dots right away, then the streamed answer; markers never show; the dots are gone after', async ({ page }) => {
  await enable(page);
  const api = fakeApi(page, { stream: true, delay: 900, reply: () => ({ sender: 'assistant', text: 'Our gong fu cha ceremony is 600฿ per person.', buttons: ['ceremonies'] }) });
  await page.goto('/');
  await page.locator('#cha-launch').click();
  await page.locator('.cha-in').fill('ceremony?');
  await page.locator('.cha-in').press('Enter');
  await expect(page.locator('.cha-m.v')).toHaveText('ceremony?');                          // at once, before any answer
  await expect(page.locator('.cha-typing')).toBeVisible();
  await expect(page.locator('.cha-typing')).toHaveAttribute('aria-label', 'Cha is typing');
  await expect(page.locator('.cha-typing i')).toHaveCount(3);
  await expect(page.locator('.cha-m.a').last()).toHaveText('Our gong fu cha ceremony is 600฿ per person.');
  await expect(page.locator('.cha-typing, .cha-m.live')).toHaveCount(0);
  await expect(page.locator('.cha-acts .cha-chip').first()).toHaveText('Tea ceremonies');
  expect(await page.locator('.cha-log').innerText()).not.toMatch(/\[\[/);
  expect(api.calls.find((c) => c.action === 'send').body.stream).toBe(true);
  await expect(page.locator('.cha-m.v')).toHaveCount(1);                                    // no duplicate of the visitor message
});

test('team: after the visitor writes, the dots mean "waiting" (never "typing"), stop after 45 s; a reply clears it', async ({ page }) => {
  await page.clock.install();
  await enable(page);
  const api = fakeApi(page);
  await page.goto('/ru/');
  await page.locator('#cha-launch').click();
  await page.locator('.cha-human').click();
  await expect(page.locator('.cha-state')).toHaveText('Ждём сотрудника');
  api.status = 'human_active';
  api.add({ sender: 'system', text: 'С вами сотрудник', event: 'handoff_accepted' });
  await page.clock.fastForward(5000);
  await expect(page.locator('.cha-state')).toHaveText('С вами сотрудник');
  await page.locator('.cha-in').fill('Добрый день!');
  await page.locator('.cha-in').press('Enter');
  const dots = page.locator('.cha-typing.wait');
  await expect(dots).toBeVisible();
  await expect(dots).toHaveAttribute('aria-label', 'Ожидаем ответ');
  expect(await page.locator('.cha-panel, #cha-panel').innerText()).not.toMatch(/печатает|typing/i);
  await page.clock.fastForward(46000);
  await expect(dots).toHaveCount(0);                                                        // no endless animation
  await expect(page.locator('.cha-note')).toHaveText('Ожидаем ответ');
  api.add({ sender: 'operator', text: 'Здравствуйте! Чем помочь?' });
  await page.clock.fastForward(3000);
  await expect(page.locator('.cha-m.o')).toContainText('Здравствуйте');
  await expect(page.locator('.cha-m.o .cha-by')).toHaveText('Сотрудник Moychay Phuket');
  await expect(page.locator('.cha-note, .cha-typing')).toHaveCount(0);
});

test('team chat: the open panel keeps one long request (wait=20), never a burst of requests', async ({ page }) => {
  await enable(page);
  const api = fakeApi(page);                         // the fake answers at once – the widget must still pace itself
  await page.goto('/');
  await page.locator('#cha-launch').click();
  await page.locator('.cha-human').click();
  await expect(page.locator('.cha-state')).toHaveText('Waiting for our team');
  await page.waitForTimeout(3500);
  const polls = api.calls.filter((c) => c.action === 'poll');
  expect(polls.length).toBeGreaterThan(0);
  expect(polls.length).toBeLessThanOrEqual(6);
  expect(polls.some((c) => c.wait === '20')).toBe(true);
});

test('reduced motion: the dots stand still', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await enable(page);
  fakeApi(page, { delay: 1500 });
  await page.goto('/');
  await page.locator('#cha-launch').click();
  await page.locator('.cha-in').fill('hi');
  await page.locator('.cha-in').press('Enter');
  await expect(page.locator('.cha-typing')).toBeVisible();
  expect(await page.locator('.cha-typing i').first().evaluate((e) => getComputedStyle(e).animationName)).toBe('none');
});
