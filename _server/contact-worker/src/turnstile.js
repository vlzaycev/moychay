// Cloudflare Turnstile server-side check (free). The widget on the page gives a one-time token;
// only this server-side call with the secret key decides whether the visitor passed.
// https://developers.cloudflare.com/turnstile/get-started/server-side-validation/

export const ALLOWED_HOSTNAMES = ['teaphuket.com'];
const MAX_TOKEN = 2048;
const MAX_AGE_MS = 5 * 60 * 1000;           // Turnstile tokens are valid for 300 s

/** @returns {Promise<{ok:true} | {ok:false, error:string}>} */
export async function verifyTurnstile(env, { token, ip, action, idempotencyKey }, fetchImpl = fetch, now = Date.now()) {
  if (!env.TURNSTILE_SECRET) return { ok: false, error: 'not_configured' };
  if (typeof token !== 'string' || !token || token.length > MAX_TOKEN) return { ok: false, error: 'captcha' };

  const form = new FormData();
  form.append('secret', env.TURNSTILE_SECRET);
  form.append('response', token);
  if (ip) form.append('remoteip', ip);
  if (idempotencyKey) form.append('idempotency_key', idempotencyKey);

  let j;
  try {
    const r = await fetchImpl('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST', body: form, signal: AbortSignal.timeout(5000) });
    j = await r.json();
  } catch {
    return { ok: false, error: 'captcha_unavailable' };
  }
  if (!j || j.success !== true) return { ok: false, error: 'captcha' };       // includes reused / expired tokens
  const hosts = ALLOWED_HOSTNAMES.concat(env.EXTRA_HOSTNAMES ? env.EXTRA_HOSTNAMES.split(',') : []);
  if (!hosts.includes(j.hostname)) return { ok: false, error: 'captcha' };     // token solved on another site
  if (action && j.action !== action) return { ok: false, error: 'captcha' };   // token from the other form
  const ts = Date.parse(j.challenge_ts || '');
  if (!ts || now - ts > MAX_AGE_MS) return { ok: false, error: 'captcha' };
  return { ok: true };
}
