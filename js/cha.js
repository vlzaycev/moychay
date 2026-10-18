/* Cha – AI tea assistant by Moychay Phuket. Built into /js/cha.js by _build/build.py (do not edit the output).
   Loaded only after a click on the launcher or when the page is idle – never blocks rendering.
   All text from the server is rendered with textContent; links become clickable only for known domains. */
(function () {
  'use strict';
  var A = {"name": {"en": "Cha", "ru": "Ча"}, "title": {"en": "Here to help", "ru": "Помогу с чаем и визитом"}, "ask": {"en": "Ask Cha", "ru": "Спросить Ча"}, "greeting": {"en": "Hi! I'm Cha, Moychay Phuket's virtual tea guide. Looking for tea, a ceremony, or directions? Just ask!", "ru": "Привет! Я Ча, виртуальный консультант Moychay Phuket. Помогу выбрать чай, узнать о церемониях или найти нашу чайную. Что подсказать?"}, "quick": {"en": [["choose", "Choose tea"], ["ceremonies", "Tea ceremonies"], ["visit", "Find us"]], "ru": [["choose", "Выбрать чай"], ["ceremonies", "Церемонии"], ["visit", "Как нас найти"]]}, "quick_prompts": {"en": {"ceremonies": "Tell me about your tea ceremonies.", "visit": "Where are you and how do I get there?", "choose": "Help me choose a tea.", "shop": "How can I order tea online?"}, "ru": {"ceremonies": "Расскажите о ваших чайных церемониях.", "visit": "Где вы находитесь и как до вас добраться?", "choose": "Помогите выбрать чай.", "shop": "Как заказать чай онлайн?"}}, "retention_days": 30};
  var CSS = ".cha{position:fixed;z-index:70;right:24px;bottom:calc(16px + var(--bar-h,0px) + env(safe-area-inset-bottom,0px));width:min(400px,calc(100vw - 48px));height:min(560px,calc(100vh - var(--bar-h,0px) - 120px));min-height:360px;display:flex;flex-direction:column;background:var(--paper,#EFE8DC);color:var(--ink,#221D19);border:1px solid var(--line-l,rgba(58,44,34,.18));border-radius:18px;box-shadow:0 18px 48px rgba(33,28,25,.28);font:400 15px/1.5 Inter,system-ui,-apple-system,\"Segoe UI\",Roboto,sans-serif;overflow:hidden;opacity:0;transform:translateY(12px);transition:opacity .2s,transform .25s var(--ease,ease),bottom .3s}.cha.on{opacity:1;transform:none}.cha[hidden]{display:none}.cha *{box-sizing:border-box}:where(.cha) button{font:inherit;color:inherit;background:none;border:0;padding:0;cursor:pointer}.cha :focus-visible{outline:2px solid var(--mc-green-dark,#375A3C);outline-offset:2px}.cha-hd{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:10px;padding:8px 6px 8px 14px;background:var(--sand,#E4D8C5);border-bottom:1px solid var(--line-l,rgba(58,44,34,.18))}.cha-mark{width:34px;height:34px;border-radius:50%;display:grid;place-items:center;background:var(--mc-green-dark,#375A3C);color:#fff;font:500 13px/1 var(--head,Inter),sans-serif;letter-spacing:-.01em}.cha-who{min-width:0}.cha-name{display:block;font:500 15.5px/1.2 var(--head,Inter),sans-serif}.cha-sub{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;font-size:12px;line-height:1.3;color:var(--ink-2,rgba(34,29,25,.76))}.cha-x{width:44px;height:44px;display:grid;place-items:center;border-radius:50%}.cha-x:hover{background:rgba(34,29,25,.08)}.cha-x svg{width:20px;height:20px;stroke:currentColor;stroke-width:1.8;fill:none;stroke-linecap:round}.cha-state{padding:7px 16px;font-size:13px;line-height:1.35;background:#E3EBDD;color:#2C4A31;border-bottom:1px solid rgba(55,90,60,.18)}.cha-state[hidden]{display:none}.cha-log{flex:1;overflow-y:auto;overscroll-behavior:contain;padding:12px 12px 6px;display:flex;flex-direction:column;gap:8px;-webkit-overflow-scrolling:touch}.cha-m{max-width:84%;padding:7px 12px;border-radius:15px;font-size:14.5px;line-height:1.45;white-space:pre-wrap;overflow-wrap:anywhere;word-break:normal}.cha-m a{color:inherit;text-decoration:underline;text-underline-offset:2px}.cha-m.v{align-self:flex-end;background:var(--mc-green-dark,#375A3C);color:#fff;border-bottom-right-radius:6px}.cha-m.a,.cha-m.o{align-self:flex-start;background:#F8F4EC;border:1px solid rgba(58,44,34,.1);border-bottom-left-radius:5px}.cha-m.o{border-color:rgba(55,90,60,.35)}.cha-by{display:block;margin-bottom:2px;font-size:12px;font-weight:600;color:#2C4A31}.cha-tr{display:block;margin-top:4px;font-size:11.5px;color:var(--ink-2,rgba(34,29,25,.76))}.cha-m.s{align-self:center;max-width:94%;padding:2px 6px;text-align:center;font-size:12.5px;color:var(--ink-2,rgba(34,29,25,.76));background:none}.cha-m.pending{opacity:.6}.cha-m.failed{outline:1px dashed #9B2C17}.cha-acts{display:flex;flex-wrap:wrap;gap:6px;align-self:flex-start;max-width:94%}.cha-acts.c{align-self:center;justify-content:center}.cha-chip{display:inline-flex;align-items:center;min-height:34px;padding:5px 12px;border:1px solid rgba(55,90,60,.45);border-radius:999px;font-size:13.5px;font-weight:500;line-height:1.2;color:#2C4A31;background:transparent;text-decoration:none;transition:background .15s,border-color .15s}.cha-chip:hover{background:rgba(55,90,60,.08);border-color:var(--mc-green-dark,#375A3C)}.cha-typing{align-self:flex-start;display:flex;gap:4px;padding:12px 14px;background:#FBF8F2;border:1px solid var(--line-l,rgba(58,44,34,.14));border-radius:16px}.cha-typing i{width:6px;height:6px;border-radius:50%;background:rgba(34,29,25,.45);animation:cha-dot 1.2s infinite}.cha-typing i:nth-child(2){animation-delay:.15s}.cha-typing i:nth-child(3){animation-delay:.3s}@keyframes cha-dot{0%,60%,100%{opacity:.3;transform:none}30%{opacity:1;transform:translateY(-2px)}}.cha-lead{align-self:stretch;display:flex;gap:6px;margin:2px 0}.cha-lead input{flex:1;min-width:0;height:40px;padding:0 12px;border:1px solid rgba(58,44,34,.3);border-radius:999px;background:#FBF8F2;font:inherit;font-size:16px;color:inherit}.cha-ts{display:flex;justify-content:center}.cha-ts:empty{display:none}.cha-ft{padding:6px 10px calc(8px + env(safe-area-inset-bottom,0px));border-top:1px solid var(--line-l,rgba(58,44,34,.18));background:var(--paper,#EFE8DC)}.cha-human{display:inline-flex;align-items:center;min-height:32px;margin:0 0 6px 2px;padding:4px 12px;border:1px solid rgba(55,90,60,.35);border-radius:999px;font-size:13px;font-weight:600;color:#2C4A31}.cha-human[hidden]{display:none}.cha-human:hover{background:rgba(55,90,60,.08)}.cha-form{display:flex;align-items:flex-end;gap:8px}.cha-in{flex:1;min-width:0;max-height:120px;min-height:44px;padding:10px 14px;resize:none;border:1px solid rgba(58,44,34,.3);border-radius:22px;background:#FBF8F2;font:inherit;font-size:16px;line-height:1.35;color:inherit;overflow-y:auto}.cha-in::placeholder{color:rgba(34,29,25,.55);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.cha-in:focus{outline:none;border-color:var(--mc-green-dark,#375A3C);box-shadow:0 0 0 1px var(--mc-green-dark,#375A3C)}.cha-send{flex:none;width:44px;height:44px;border-radius:50%;display:grid;place-items:center;background:var(--mc-green-dark,#375A3C);color:#fff}.cha-send:disabled{opacity:.45;cursor:default}.cha-send svg{width:20px;height:20px;stroke:currentColor;stroke-width:2;fill:none;stroke-linecap:round;stroke-linejoin:round}.cha-err{margin:6px 4px 0;font-size:12.5px;color:#9B2C17}.cha-err:empty{display:none}.cha-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}@media (max-width:599px){.cha{inset:var(--cha-top,12dvh) 0 auto 0;width:100%;height:var(--cha-h,88dvh);min-height:0;border:0;border-radius:18px 18px 0 0;box-shadow:0 0 0 100vmax rgba(33,28,25,.38);transform:translateY(24px)}.cha.kb{border-radius:0}}html.cha-lock,html.cha-lock body{overflow:hidden}@media (prefers-reduced-motion:reduce){.cha,.cha-typing i{transition:none;animation:none}}";
  var STORE = 'cha_session', TEASER = 'cha_teaser';
  var URLS = { shop: 'https://phuket.moychay.asia/', directions: 'https://maps.app.goo.gl/uuZkb3YwtNMGQhy18',
    whatsapp: 'https://wa.me/66817959110', telegram: 'https://t.me/moychay_phuket' };
  var SAFE_HOSTS = /^(teaphuket\.com|phuket\.moychay\.asia|wa\.me|t\.me|maps\.app\.goo\.gl|(www\.)?google\.com|(www\.)?instagram\.com)$/;

  var UI = {
    en: { open: 'Chat with Cha', close: 'Close chat', placeholder: 'Ask about tea or your visit…', send: 'Send',
      human: 'Talk to a person',
      waiting: 'Waiting for the team. You can close this window – the reply will stay here.', active: 'A Moychay Phuket team member is in the chat.', closed: 'This chat is closed.',
      typing: 'Cha is typing', team: 'Moychay Phuket team', newChat: 'Start a new chat', teaser: 'Hi! Questions about tea, ceremonies or your visit? Ask Cha.',
      leadPh: 'WhatsApp, Telegram or email', leadBtn: 'Send', err: "Couldn't send. Check your connection and try again.", retry: 'Retry',
      rate: 'Too many messages. Please wait a minute.', busy: 'Please wait for the answer.', captcha: 'Please complete the security check.',
      unavailable: 'The chat is unavailable right now. Please message us on WhatsApp or Telegram.', lang: 'Language', newMsg: 'New message',
      buttons: { ceremonies: 'Tea ceremonies', tea: 'Our teas', matcha: 'Matcha', events: 'Events', wholesale: 'For business', contact: 'Contact page',
        shop: 'Online shop', directions: 'Get directions', whatsapp: 'WhatsApp', telegram: 'Telegram', human: 'Talk to a person' } },
    ru: { open: 'Чат с Ча', close: 'Закрыть чат', placeholder: 'Спросите о чае или визите…', send: 'Отправить',
      human: 'Связаться с человеком',
      waiting: 'Ждём ответа команды. Окно можно закрыть – ответ сохранится здесь.', active: 'В чате сотрудник Moychay Phuket.', closed: 'Чат завершён.',
      typing: 'Ча печатает', team: 'Сотрудник Moychay Phuket', newChat: 'Начать новый чат', teaser: 'Здравствуйте! Вопросы о чае, церемониях или визите? Спросите Ча.',
      leadPh: 'WhatsApp, Telegram или email', leadBtn: 'Отправить', err: 'Не удалось отправить. Проверьте соединение и попробуйте ещё раз.', retry: 'Повторить',
      rate: 'Слишком много сообщений. Подождите минуту.', busy: 'Дождитесь ответа.', captcha: 'Пройдите проверку безопасности.',
      unavailable: 'Чат сейчас недоступен. Напишите нам в Telegram или WhatsApp.', lang: 'Язык', newMsg: 'Новое сообщение',
      buttons: { ceremonies: 'Чайные церемонии', tea: 'Наш чай', matcha: 'Матча', events: 'Мероприятия', wholesale: 'Для бизнеса', contact: 'Контакты',
        shop: 'Интернет-магазин', directions: 'Проложить маршрут', whatsapp: 'WhatsApp', telegram: 'Telegram', human: 'Связаться с человеком' } }
  };

  var C, lang, el = {}, state = { token: '', status: 'ai_active', seq: 0, msgs: {} }, busy = false, pollT = 0, lastNew = Date.now();
  var tsLoading = null, opened = false, retryFn = null, loadedAt = Date.now();

  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { return null; } }
  function track(name, url) { try { if (window.track) window.track(name, 'chat', url); } catch (e) {} }
  function u() { return UI[lang] || UI.en; }
  function lp() { return lang === 'ru' ? '/ru/' : '/'; }
  function id() { var a = new Uint8Array(12); crypto.getRandomValues(a); return Array.prototype.map.call(a, function (x) { return ('0' + x.toString(16)).slice(-2); }).join(''); }
  function h(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function save() { ls(STORE, state.token ? JSON.stringify({ token: state.token, status: state.status, lang: lang, at: Date.now() }) : null); }

  /* ── API ── */
  function api(path, opts) {
    opts = opts || {};
    var headers = { 'Content-Type': 'application/json' };
    if (state.token) headers.Authorization = 'Bearer ' + state.token;
    return fetch(C.endpoint.replace(/\/$/, '') + '/' + path, { method: opts.method || 'POST', headers: headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined, credentials: 'omit', cache: 'no-store' })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (j) {
          if (r.status === 401 && path !== 'start') { reset(); }
          if (!r.ok) { var e = new Error(j.error || ('http_' + r.status)); e.status = r.status; throw e; }
          return j;
        });
      });
  }

  function turnstile() {
    if (!C.sitekey) return Promise.resolve('');
    if (!tsLoading) {
      tsLoading = new Promise(function (res, rej) {
        window.onChaTurnstile = res;
        var s = document.createElement('script');
        s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=onChaTurnstile';
        s.async = true; s.onerror = function () { tsLoading = null; rej(new Error('captcha')); };
        document.head.appendChild(s);
      });
    }
    return tsLoading.then(function () {
      return new Promise(function (res, rej) {
        el.ts.textContent = '';
        window.turnstile.render(el.ts, { sitekey: C.sitekey, action: 'chat', appearance: 'interaction-only', language: lang,
          callback: res, 'error-callback': function () { rej(new Error('captcha')); }, 'expired-callback': function () { rej(new Error('captcha')); } });
      });
    });
  }

  function ensureSession() {
    if (state.token) return Promise.resolve();
    return turnstile().then(function (tok) {
      return api('start', { body: { turnstile_token: tok, lang: lang, page: location.pathname.slice(0, 120) } });
    }).then(function (j) {
      el.ts.textContent = '';
      state.token = j.token; state.status = j.status; state.seq = 0; save();
      track('chat_started');
    });
  }

  /* ── rendering ── */
  function linkify(node, text, any) {
    var re = /https?:\/\/[^\s<>"')]+/g, last = 0, m;
    while ((m = re.exec(text))) {
      var url = m[0].replace(/[.,;:!?]+$/, ''), host = '';
      try { host = new URL(url).hostname; } catch (e) {}
      if (any || SAFE_HOSTS.test(host)) {
        node.appendChild(document.createTextNode(text.slice(last, m.index)));
        var a = h('a', '', url); a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer nofollow';
        node.appendChild(a); last = m.index + url.length;
      }
    }
    node.appendChild(document.createTextNode(text.slice(last)));
  }

  function buttonFor(key) {
    var b = u().buttons;
    if (!b[key]) return null;
    if (key === 'human') { var x = h('button', 'cha-chip', b.human); x.type = 'button'; x.onclick = askHuman; return x; }
    var href = URLS[key] || (lp() + key + '/');
    if (key === 'contact') href = lp() + 'contact/';
    var a = h('a', 'cha-chip', b[key]); a.href = href;
    if (URLS[key]) { a.target = '_blank'; a.rel = 'noopener'; }
    a.onclick = function () {
      if (key === 'shop') track('chat_shop_click', href);
      else if (key === 'directions') track('chat_directions_click');
      else if (key === 'ceremonies') track('chat_ceremony_click');
      else if (key === 'whatsapp' || key === 'telegram') track(key, href);    // the site's existing messenger events
    };
    return a;
  }

  function addMessage(m) {
    if (state.msgs[m.seq]) return;
    state.msgs[m.seq] = 1;
    state.seq = Math.max(state.seq, m.seq);
    var cls = m.sender === 'visitor' ? 'v' : m.sender === 'operator' ? 'o' : m.sender === 'assistant' ? 'a' : 's';
    var box = h('div', 'cha-m ' + cls);
    if (cls === 'o') box.appendChild(h('span', 'cha-by', u().team));
    var body = h('span');
    linkify(body, m.text, cls === 'o');
    box.appendChild(body);
    if (m.translated) box.appendChild(h('span', 'cha-tr', m.translated));
    el.log.appendChild(box);
    if (m.buttons && m.buttons.length) {
      var acts = h('div', 'cha-acts' + (cls === 's' ? ' c' : ''));
      m.buttons.forEach(function (k) { var b = buttonFor(k); if (b) acts.appendChild(b); });
      el.log.appendChild(acts);
    }
    if (m.lead_form) leadForm();
    if (m.event === 'handoff_accepted' && m.at > loadedAt) track('chat_handoff_accepted');   // live only, not when history is reloaded
    if (cls !== 'v') { lastNew = Date.now(); if (!opened) badge(true); }
  }

  function leadForm() {
    if (el.log.querySelector('.cha-lead')) return;
    var f = h('form', 'cha-lead'), i = h('input'), b = h('button', 'cha-chip', u().leadBtn);
    i.type = 'text'; i.maxLength = 120; i.placeholder = u().leadPh; i.setAttribute('aria-label', u().leadPh); i.autocomplete = 'off';
    b.type = 'submit';
    f.appendChild(i); f.appendChild(b);
    f.onsubmit = function (e) {
      e.preventDefault();
      var v = i.value.trim(); if (!v) return;
      b.disabled = true;
      api('contact', { body: { contact: v, client_id: id() } }).then(function (j) { f.remove(); merge(j); track('chat_lead_submitted'); })
        .catch(function (e) { b.disabled = false; error(e); });
    };
    el.log.appendChild(f);
  }

  function greeting() {
    el.log.textContent = '';
    state.msgs = {};
    var g = h('div', 'cha-m a'); g.textContent = A.greeting[lang] || A.greeting.en;
    el.log.appendChild(g);
    if (!state.token) quick();
  }

  function quick() {
    var acts = h('div', 'cha-acts cha-quick');
    (A.quick[lang] || A.quick.en).forEach(function (q) {
      var b = h('button', 'cha-chip', q[1]); b.type = 'button';
      b.onclick = function () {
        acts.remove();
        if (q[0] === 'human') return askHuman();
        if (q[0] === 'shop') track('chat_shop_click', URLS.shop);
        send(((A.quick_prompts[lang] || A.quick_prompts.en)[q[0]]) || q[1]);
      };
      acts.appendChild(b);
    });
    el.log.appendChild(acts);
  }

  function scroll() { el.log.scrollTop = el.log.scrollHeight; }
  function typing(on) {
    var t = el.log.querySelector('.cha-typing');
    if (on && !t) { t = h('div', 'cha-typing'); t.setAttribute('aria-label', u().typing); t.innerHTML = '<i></i><i></i><i></i>'; el.log.appendChild(t); scroll(); }
    if (!on && t) t.remove();
  }
  function error(e) {
    var s = e && e.status, m = e && e.message;
    var k = s === 429 ? 'rate' : s === 409 ? 'busy' : m === 'captcha' ? 'captcha' : s === 503 ? 'unavailable' : 'err';
    el.err.textContent = u()[k];
  }

  function setStatus(s) {
    if (s && s !== state.status) {
      if (s === 'human_requested' && state.status === 'ai_active') track('chat_handoff_requested');
      state.status = s; save();
    }
    var t = state.status === 'human_requested' ? u().waiting : state.status === 'human_active' ? u().active : state.status === 'closed' ? u().closed : '';
    el.state.textContent = t; el.state.hidden = !t;
    el.human.hidden = state.status !== 'ai_active';
    var nc = el.log.querySelector('.cha-new');
    if (state.status === 'closed' && !nc) {
      var b = h('button', 'cha-chip cha-new', u().newChat); b.type = 'button'; b.onclick = function () { reset(); greeting(); el.input.focus(); };
      var w = h('div', 'cha-acts c'); w.appendChild(b); el.log.appendChild(w);
    }
    schedule();
  }

  function merge(j) {
    (j.messages || []).forEach(addMessage);
    setStatus(j.status);
    scroll();
  }

  /* ── actions ── */
  function send(text, clientId) {
    text = String(text || '').trim();
    if (!text || busy) return;
    el.err.textContent = '';
    var q = el.log.querySelector('.cha-quick'); if (q) q.remove();
    var cid = clientId || id();
    var pend = el.log.querySelector('[data-cid="' + cid + '"]');
    if (!pend) { pend = h('div', 'cha-m v pending', text); pend.setAttribute('data-cid', cid); el.log.appendChild(pend); }
    else pend.classList.remove('failed');
    busy = true; el.sendBtn.disabled = true;
    if (state.status === 'ai_active' || state.status === 'closed') typing(true);
    scroll();
    track('chat_message_sent');
    ensureSession().then(function () {
      return api('send', { body: { text: text, client_id: cid, lang: lang } });
    }).then(function (j) {
      pend.remove(); merge(j);
    }).catch(function (e) {
      // the conversation expired on the server (30 days): start a new one once, transparently
      if (e.status === 401 && !clientId) { busy = false; pend.remove(); return send(text, cid + '-r'); }
      pend.classList.add('failed');
      error(e);
      if (!e.status || e.status >= 500) retryFn = function () { send(text, cid); };
    }).then(function () {
      busy = false; el.sendBtn.disabled = false; typing(false); scroll();
    });
  }

  function askHuman() {
    if (busy) return;
    busy = true; el.err.textContent = '';
    var q = el.log.querySelector('.cha-quick'); if (q) q.remove();
    ensureSession().then(function () { return api('human', { body: {} }); })
      .then(merge).catch(error).then(function () { busy = false; });
  }

  function poll() {
    if (!state.token) return Promise.resolve();
    return api('poll?after=' + state.seq, { method: 'GET' }).then(merge).catch(function () {});
  }
  // Only while a person is requested or in the chat: every 4 s with the panel open, 15 s otherwise, 30 s after 30 idle minutes
  function schedule() {
    clearTimeout(pollT);
    if (!state.token || (state.status !== 'human_requested' && state.status !== 'human_active')) return;
    var idle = Date.now() - lastNew > 30 * 60 * 1000;
    var ms = idle ? 30000 : opened && !document.hidden ? 4000 : 15000;
    pollT = setTimeout(function () { poll().then(schedule); }, ms);
  }

  function reset() {
    clearTimeout(pollT);
    state = { token: '', status: 'ai_active', seq: 0, msgs: {} };
    ls(STORE, null);
    if (el.state) { el.state.hidden = true; el.human.hidden = false; }
  }

  /* ── panel ── */
  function paintChrome() {
    el.name.textContent = A.name[lang] || A.name.en;
    el.sub.textContent = A.title[lang] || A.title.en;
    el.box.setAttribute('aria-label', u().open);
    el.close.setAttribute('aria-label', u().close);
    el.input.placeholder = u().placeholder;
    el.input.setAttribute('aria-label', u().placeholder);
    el.sendBtn.setAttribute('aria-label', u().send);
    el.human.textContent = u().human;
    el.launch.setAttribute('aria-label', u().open);
  }

  function build() {
    var st = h('style'); st.textContent = CSS; document.head.appendChild(st);
    var box = el.box = h('section', 'cha'); box.id = 'cha-panel'; box.hidden = true; box.setAttribute('role', 'dialog');
    box.innerHTML = '<div class="cha-hd"><span class="cha-mark" aria-hidden="true"></span><div class="cha-who"><span class="cha-name"></span><span class="cha-sub"></span></div>' +
      '<button class="cha-x" type="button"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>' +
      '<div class="cha-state" role="status" hidden></div><div class="cha-log" role="log" aria-live="polite" aria-relevant="additions"></div><div class="cha-ts"></div>' +
      '<div class="cha-ft"><button class="cha-human" type="button"></button><form class="cha-form"><textarea class="cha-in" rows="1" maxlength="1000"></textarea>' +
      '<button class="cha-send" type="submit"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M13 6l6 6-6 6"/></svg></button></form><p class="cha-err" role="alert"></p></div>';
    document.body.appendChild(box);
    var q = function (s) { return box.querySelector(s); };
    el.name = q('.cha-name'); el.sub = q('.cha-sub'); el.close = q('.cha-x'); el.state = q('.cha-state');
    el.log = q('.cha-log'); el.ts = q('.cha-ts'); el.human = q('.cha-human'); el.form = q('.cha-form'); el.input = q('.cha-in');
    el.sendBtn = q('.cha-send'); el.err = q('.cha-err');
    q('.cha-mark').textContent = A.name[lang] || A.name.en;
    el.close.onclick = close;
    el.human.onclick = askHuman;
    el.form.onsubmit = function (e) { e.preventDefault(); var v = el.input.value; if (!v.trim() || busy) return; el.input.value = ''; grow(); send(v); };
    el.input.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); el.form.requestSubmit ? el.form.requestSubmit() : el.form.onsubmit(e); } });
    el.input.addEventListener('input', grow);
    el.err.addEventListener('click', function () { if (retryFn) { var f = retryFn; retryFn = null; f(); } });
    box.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
    paintChrome();
    greeting();
  }
  function grow() { el.input.style.height = 'auto'; el.input.style.height = Math.min(120, el.input.scrollHeight) + 'px'; }

  // Phones: a bottom sheet (~86 % of the screen); with the keyboard open it fills the visible area,
  // so the input always stays above the keyboard (iOS and Android report it through visualViewport)
  function fitViewport() {
    if (!el.box) return;
    var st = el.box.style;
    if (innerWidth >= 600) { st.removeProperty('--cha-h'); st.removeProperty('--cha-top'); return; }
    var vv = window.visualViewport, H = vv ? vv.height : innerHeight, T = vv ? vv.offsetTop : 0;
    var keyboard = H < innerHeight * 0.8;
    var hgt = Math.round(keyboard ? H : Math.min(H, Math.max(440, H * 0.86)));
    st.setProperty('--cha-h', hgt + 'px');
    st.setProperty('--cha-top', Math.round(T + H - hgt) + 'px');
    el.box.classList.toggle('kb', keyboard);
    if (keyboard) scroll();
  }

  function badge(on) { el.launch.classList.toggle('has-new', on); if (on) el.launch.setAttribute('aria-label', u().open + '. ' + u().newMsg); }

  function open() {
    if (!el.box) build();
    hideTeaser();
    opened = true; badge(false); paintChrome();
    el.box.hidden = false;
    requestAnimationFrame(function () { el.box.classList.add('on'); });
    el.launch.setAttribute('aria-expanded', 'true');
    if (innerWidth < 600) document.documentElement.classList.add('cha-lock');
    fitViewport();
    track('chat_open');
    (state.token && state.seq === 0 ? poll() : Promise.resolve()).then(function () { scroll(); schedule(); });
    setTimeout(function () { el.input.focus({ preventScroll: true }); }, 60);
  }
  function close() {
    if (!el.box) return;
    opened = false;
    el.box.classList.remove('on');
    document.documentElement.classList.remove('cha-lock');
    setTimeout(function () { if (!opened) el.box.hidden = true; }, 200);
    el.launch.setAttribute('aria-expanded', 'false');
    el.launch.focus({ preventScroll: true });
    schedule();
  }

  /* ── one-time greeting next to the launcher ── */
  function teaser() {
    if (ls(TEASER) || state.token) return;
    setTimeout(function () {
      if (opened || ls(TEASER)) return;
      ls(TEASER, '1');
      var t = el.teaser = h('div', 'cha-teaser'); t.setAttribute('role', 'status');
      var b = h('button', 'cha-teaser-t', u().teaser); b.type = 'button'; b.onclick = open;
      var x = h('button', 'cha-teaser-x', '×'); x.type = 'button'; x.setAttribute('aria-label', u().close); x.onclick = hideTeaser;
      t.appendChild(b); t.appendChild(x); document.body.appendChild(t);
    }, 8000);
  }
  function hideTeaser() { if (el.teaser) { el.teaser.remove(); el.teaser = null; } }

  window.Cha = {
    init: function (cfg) {
      if (C) return;
      C = cfg;
      el.launch = document.getElementById('cha-launch');
      var saved = null; try { saved = JSON.parse(ls(STORE) || 'null'); } catch (e) {}
      lang = UI[cfg.lang] ? cfg.lang : 'en';
      if (saved && saved.token && Date.now() - saved.at < (A.retention_days || 30) * 86400000) {
        state.token = saved.token; state.status = saved.status || 'ai_active';
        // the visitor switched EN/RU on the site: the interface follows the page, history stays as it was written,
        // new answers and team notices come in the page language
        if (saved.lang && saved.lang !== lang) api('lang', { body: { lang: lang } }).then(save, function () {});
        // a conversation with the team continues in the background: new replies show a dot on the launcher
        if (state.status === 'human_requested' || state.status === 'human_active') { build(); poll().then(schedule); }
      }
      teaser();
      if (window.visualViewport) { visualViewport.addEventListener('resize', fitViewport); visualViewport.addEventListener('scroll', fitViewport); }
      document.addEventListener('visibilitychange', schedule);
    },
    open: open,
    close: close
  };
})();
