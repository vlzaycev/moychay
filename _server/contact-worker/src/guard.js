// Abuse limits that work across Cloudflare's network, not in the memory of one isolate:
//  • RL_IP / RL_GLOBAL – Workers Rate Limiting bindings (free, counted by Cloudflare per location)
//  • FORM_KV – Workers KV (free tier): daily cap per IP and duplicate suppression.
//    KV is eventually consistent, so these two are best-effort on top of the rate limits and Turnstile.
// Keys never contain personal data in clear text: IPs and messages are stored as salted SHA-256 hashes.

export const DAILY_PER_IP = 20;
export const DUPLICATE_TTL = 600;           // seconds: the same message is not forwarded twice within 10 minutes

async function sha256(s) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

export const hashIp = (env, ip) => sha256(`${env.HASH_SALT}|ip|${ip || 'unknown'}`);
export const hashMessage = (env, d) =>
  sha256(`${env.HASH_SALT}|msg|${d.inquiry_type}|${d.email}|${d.message.replace(/\s+/g, ' ').toLowerCase()}`);

// All bindings and the salt are required: without them the Worker refuses to send (fail-closed)
export function missingConfig(env) {
  const need = ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID', 'TURNSTILE_SECRET', 'HASH_SALT', 'RL_IP', 'RL_GLOBAL', 'FORM_KV'];
  return need.filter((k) => !env[k]);
}

/** Cheap checks before any work: per-IP and global rate limits, daily cap. */
export async function checkLimits(env, ipHash, day) {
  if (!(await env.RL_IP.limit({ key: ipHash })).success) return 'rate_limited';
  if (!(await env.RL_GLOBAL.limit({ key: 'all' })).success) return 'rate_limited';
  const n = Number(await env.FORM_KV.get(`day:${day}:${ipHash}`)) || 0;
  if (n >= DAILY_PER_IP) return 'rate_limited';
  return '';
}

export async function countSend(env, ipHash, day) {
  const k = `day:${day}:${ipHash}`;
  const n = Number(await env.FORM_KV.get(k)) || 0;
  await env.FORM_KV.put(k, String(n + 1), { expirationTtl: 2 * 86400 });
}

export async function isDuplicate(env, msgHash) {
  return (await env.FORM_KV.get(`dup:${msgHash}`)) !== null;
}

export async function rememberSent(env, msgHash) {
  await env.FORM_KV.put(`dup:${msgHash}`, '1', { expirationTtl: DUPLICATE_TTL });
}
