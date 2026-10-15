// Telegram Bot API delivery. The token lives only in the Worker's secrets (TELEGRAM_BOT_TOKEN),
// never in the site code or this repository.

export function formatDate(iso) {
  // "15.10.2026, 18:42 (Asia/Bangkok)"
  const s = new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Asia/Bangkok', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso));
  return `${s} (Asia/Bangkok)`;
}

// Plain text (no parse_mode): user input can never be interpreted as markup
export function formatMessage(d) {
  const contact = d.contact_value
    ? (d.contact_method === 'telegram' ? `Telegram: @${d.contact_value}` : `WhatsApp: ${d.contact_value}`)
    : '—';
  const lines = [
    d.inquiry_type === 'wholesale' ? 'B2B / Wholesale enquiry' : null,
    'Новое обращение с teaphuket.com',
    '',
    `Имя: ${d.name}`,
    d.inquiry_type === 'wholesale' ? `Компания: ${d.company}` : null,
    `Email: ${d.email}`,
    `Контакт: ${contact}`,
    `Сообщение:\n${d.message}`,
    `Язык: ${d.page_language.toUpperCase()}`,
    `Страница: https://teaphuket.com${d.page_path}`,
    `Дата и время: ${formatDate(d.submitted_at)}`,
  ];
  return lines.filter((l) => l !== null).join('\n').slice(0, 4096);   // Telegram message limit
}

export async function sendTelegram(env, text, fetchImpl = fetch) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return { ok: false, error: 'not_configured' };
  const r = await fetchImpl(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text, disable_web_page_preview: true }),
  });
  const j = await r.json().catch(() => ({}));
  return r.ok && j.ok ? { ok: true } : { ok: false, error: 'telegram_' + r.status };
}
