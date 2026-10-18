/* Cha – AI tea assistant by Moychay Phuket. Built into /js/cha.js by _build/build.py (do not edit the output).
   Loaded only after a click on the launcher or when the page is idle – never blocks rendering.
   All text from the server is rendered with textContent; links become clickable only for known domains. */
(function () {
  'use strict';
  var A = __ASSISTANT__;
  var CSS = __CSS__;
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
