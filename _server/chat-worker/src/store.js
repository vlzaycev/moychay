// All database access (Cloudflare D1). Every query is parameterised.
const now = () => Date.now();

export async function sha256hex(s) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

function randomBytes(n) {
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  return a;
}
const b64url = (a) => btoa(String.fromCharCode(...a)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const hex = (a) => [...a].map((x) => x.toString(16).padStart(2, '0')).join('');
const CODE_ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // no 0/O, 1/I

export function newToken() { return 'cs_' + b64url(randomBytes(32)); }
export function newId() { return hex(randomBytes(16)); }
export function newCode() { return 'CH-' + [...randomBytes(4)].map((x) => CODE_ABC[x % CODE_ABC.length]).join(''); }

/* ── conversations ─────────────────────────────────────────────────────── */

export async function createConversation(db, { lang, page }) {
  const token = newToken();
  const conv = { id: newId(), code: newCode(), token_hash: await sha256hex(token), lang, status: 'ai_active',
    start_page: page, created_at: now(), last_activity: now() };
  await db.prepare(`INSERT INTO conversations (id, code, token_hash, lang, status, start_page, created_at, last_activity)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).bind(conv.id, conv.code, conv.token_hash, lang, conv.status, page, conv.created_at, conv.last_activity).run();
  return { token, conv: { ...conv, seq: 0, ai_calls: 0 } };
}

export async function conversationByToken(db, token) {
  if (typeof token !== 'string' || !/^cs_[A-Za-z0-9_-]{43}$/.test(token)) return null;
  return db.prepare('SELECT * FROM conversations WHERE token_hash = ?').bind(await sha256hex(token)).first();
}

export const conversationById = (db, id) =>
  /^[0-9a-f]{32}$/.test(id || '') ? db.prepare('SELECT * FROM conversations WHERE id = ?').bind(id).first() : null;

export async function setStatus(db, id, status, extra = {}) {
  const sets = ['status = ?', 'last_activity = ?'], vals = [status, now()];
  for (const [k, v] of Object.entries(extra)) {
    if (!['operator_id', 'operator_name', 'tg_root_message_id', 'tg_thread_id', 'lang'].includes(k)) throw new Error('bad column');
    sets.push(`${k} = ?`); vals.push(v);
  }
  await db.prepare(`UPDATE conversations SET ${sets.join(', ')} WHERE id = ?`).bind(...vals, id).run();
}

export const setLang = (db, id, lang) =>
  db.prepare('UPDATE conversations SET lang = ?, last_activity = ? WHERE id = ?').bind(lang, now(), id).run();

/** One AI request at a time per conversation (protects against double clicks and parallel tabs). */
export async function acquireAiLock(db, id, ms) {
  const t = now();
  const r = await db.prepare('UPDATE conversations SET busy_until = ? WHERE id = ? AND busy_until < ?').bind(t + ms, id, t).run();
  return (r.meta && r.meta.changes) === 1;
}
export const releaseAiLock = (db, id) =>
  db.prepare('UPDATE conversations SET busy_until = 0, ai_calls = ai_calls + 1 WHERE id = ?').bind(id).run();

/* ── messages ──────────────────────────────────────────────────────────── */

export async function addMessage(db, convId, { sender, text, meta = null, clientId = null }) {
  const row = await db.prepare('UPDATE conversations SET seq = seq + 1, last_activity = ? WHERE id = ? RETURNING seq')
    .bind(now(), convId).first();
  if (!row) throw new Error('conversation not found');
  const m = { seq: row.seq, sender, text, meta: meta ? JSON.stringify(meta) : null, created_at: now() };
  await db.prepare('INSERT INTO messages (conv_id, seq, sender, text, meta, client_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(convId, m.seq, sender, text, m.meta, clientId, m.created_at).run();
  return publicMessage(m);
}

export const messageByClientId = (db, convId, clientId) =>
  db.prepare('SELECT seq FROM messages WHERE conv_id = ? AND client_id = ?').bind(convId, clientId).first();

export async function messagesAfter(db, convId, after, limit = 100) {
  const r = await db.prepare('SELECT seq, sender, text, meta, created_at FROM messages WHERE conv_id = ? AND seq > ? ORDER BY seq LIMIT ?')
    .bind(convId, after, limit).all();
  return (r.results || []).map(publicMessage);
}

/** Last N messages for the model, oldest first. */
export async function lastMessages(db, convId, n) {
  const r = await db.prepare('SELECT seq, sender, text, meta FROM messages WHERE conv_id = ? ORDER BY seq DESC LIMIT ?').bind(convId, n).all();
  return (r.results || []).reverse();
}

// What the browser receives: no internal ids, meta parsed
export function publicMessage(m) {
  let meta = null;
  try { meta = m.meta ? JSON.parse(m.meta) : null; } catch { meta = null; }
  const out = { seq: m.seq, sender: m.sender, text: m.text, at: m.created_at };
  if (meta && meta.buttons) out.buttons = meta.buttons;
  if (meta && meta.translated) out.translated = meta.translated;
  if (meta && meta.lead_form) out.lead_form = true;
  if (meta && meta.event) out.event = meta.event;
  return out;
}

/* ── handoffs ──────────────────────────────────────────────────────────── */

export const openHandoff = (db, convId) =>
  db.prepare('INSERT INTO handoffs (conv_id, requested_at) VALUES (?, ?)').bind(convId, now()).run();
export const acceptHandoff = (db, convId, operatorId) =>
  db.prepare('UPDATE handoffs SET accepted_at = ?, operator_id = ? WHERE conv_id = ? AND accepted_at IS NULL AND closed_at IS NULL')
    .bind(now(), String(operatorId), convId).run();
export const closeHandoff = (db, convId, reason) =>
  db.prepare('UPDATE handoffs SET closed_at = ?, close_reason = ? WHERE conv_id = ? AND closed_at IS NULL').bind(now(), reason, convId).run();

/* ── Telegram routing ──────────────────────────────────────────────────── */

export const linkTelegram = (db, chatId, messageId, convId) =>
  db.prepare('INSERT OR REPLACE INTO tg_links (chat_id, message_id, conv_id, created_at) VALUES (?, ?, ?, ?)')   // newest mapping wins
    .bind(String(chatId), messageId, convId, now()).run();
export async function convByTelegram(db, chatId, messageId) {
  const r = await db.prepare('SELECT conv_id FROM tg_links WHERE chat_id = ? AND message_id = ?').bind(String(chatId), messageId).first();
  return r ? conversationById(db, r.conv_id) : null;
}
export const convByThread = (db, threadId) =>
  Number.isInteger(threadId) ? db.prepare('SELECT * FROM conversations WHERE tg_thread_id = ?').bind(threadId).first() : null;
/** true the first time an update_id is seen, false for a repeated delivery */
export async function firstUpdate(db, updateId) {
  const r = await db.prepare('INSERT OR IGNORE INTO tg_updates (update_id, at) VALUES (?, ?)').bind(updateId, now()).run();
  return (r.meta && r.meta.changes) === 1;
}

/* ── knowledge ─────────────────────────────────────────────────────────── */

export async function knowledge(db) {
  const r = await db.prepare('SELECT id, title, body FROM knowledge_documents WHERE active = 1 ORDER BY id').all();
  return r.results || [];
}

/* ── counters and usage ────────────────────────────────────────────────── */

/** Adds 1 and returns the new value; the counter disappears after ttlMs. */
export async function bump(db, key, ttlMs) {
  const t = now();
  const r = await db.prepare(`INSERT INTO counters (key, n, expires_at) VALUES (?, 1, ?)
    ON CONFLICT(key) DO UPDATE SET n = CASE WHEN expires_at < ? THEN 1 ELSE n + 1 END,
      expires_at = CASE WHEN expires_at < ? THEN excluded.expires_at ELSE expires_at END
    RETURNING n`).bind(key, t + ttlMs, t, t).first();
  return r ? r.n : 1;
}
export async function peek(db, key) {
  const r = await db.prepare('SELECT n FROM counters WHERE key = ? AND expires_at >= ?').bind(key, now()).first();
  return r ? r.n : 0;
}

export async function addUsage(db, day, u) {
  await db.prepare(`INSERT INTO usage_daily (day, ai_calls, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, errors, handoffs)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(day) DO UPDATE SET ai_calls = ai_calls + excluded.ai_calls, input_tokens = input_tokens + excluded.input_tokens,
      output_tokens = output_tokens + excluded.output_tokens, cache_read_tokens = cache_read_tokens + excluded.cache_read_tokens,
      cache_write_tokens = cache_write_tokens + excluded.cache_write_tokens, errors = errors + excluded.errors, handoffs = handoffs + excluded.handoffs`)
    .bind(day, u.calls || 0, u.input || 0, u.output || 0, u.cacheRead || 0, u.cacheWrite || 0, u.errors || 0, u.handoffs || 0).run();
}
export async function usageToday(db, day) {
  return (await db.prepare('SELECT * FROM usage_daily WHERE day = ?').bind(day).first()) || { ai_calls: 0 };
}

/* ── retention ─────────────────────────────────────────────────────────── */

export async function purge(db, retentionDays) {
  const cutoff = now() - retentionDays * 86400000;
  await db.batch([
    db.prepare('DELETE FROM messages WHERE conv_id IN (SELECT id FROM conversations WHERE last_activity < ?)').bind(cutoff),
    db.prepare('DELETE FROM handoffs WHERE conv_id IN (SELECT id FROM conversations WHERE last_activity < ?)').bind(cutoff),
    db.prepare('DELETE FROM tg_links WHERE conv_id IN (SELECT id FROM conversations WHERE last_activity < ?)').bind(cutoff),
    db.prepare('DELETE FROM conversations WHERE last_activity < ?').bind(cutoff),
    db.prepare('DELETE FROM tg_updates WHERE at < ?').bind(now() - 3 * 86400000),
    db.prepare('DELETE FROM counters WHERE expires_at < ?').bind(now()),
    db.prepare('DELETE FROM usage_daily WHERE day < ?').bind(new Date(now() - 400 * 86400000).toISOString().slice(0, 10)),
  ]);
}
