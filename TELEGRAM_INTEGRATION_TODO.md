# Подключение форм к Telegram

> **Статус на 17.10.2026: подключено.**
> - Worker `teaphuket-contact` развёрнут на `teaphuket.com/api/contact`, заданы 4 секрета, KV и лимиты подключены.
> - Формы на сайте включены: `cfg_form_endpoint` и `cfg_turnstile_sitekey` заданы.
> - Проверено на проде: запросы без Turnstile, с поддельным токеном и с заполненным honeypot отклоняются (400), запросы с чужого сайта – 403.
> - `wrangler.toml` с ID аккаунта и KV хранится только локально (в `.gitignore`).
> - С 18.10.2026 заявки приходят в группу Telegram (владелец + чайная), а не в личный чат. Если группу преобразуют в супергруппу, её ID сменится на `-100…` – тогда нужно обновить секрет `TELEGRAM_CHAT_ID`.
>
> Ниже – исходная инструкция для справки.

Код готов в `_server/contact-worker/` и покрыт тестами (`_qa/unit/contact.test.mjs` и `_qa/e2e/pages.spec.js`).

Сейчас он **не развёрнут**, формы на сайте отключены. Они включатся, только когда в `_build/build.py` заданы оба значения: `cfg_form_endpoint` и `cfg_turnstile_sitekey`.

## Как это работает

```
браузер: форма + невидимая проверка Cloudflare Turnstile
   │ POST JSON (≤ 16 KB)
   ▼
https://teaphuket.com/api/contact (Cloudflare Worker)
   ├─ все секреты и привязки на месте? иначе 503, ничего не отправляется (fail-closed)
   ├─ Origin, метод, Content-Type
   ├─ rate limit Cloudflare: 5/мин на IP, 30/мин на весь сайт; 20 в сутки на IP (KV)
   ├─ размер тела ≤ 16 KB, JSON
   ├─ строгая валидация: только известные поля, типы, длины, формат email/WhatsApp/Telegram, ≤ 3 ссылок
   ├─ honeypot "website", время заполнения (слабый сигнал)
   ├─ Turnstile: токен проверяется на сервере секретным ключом (сайт, форма, срок 5 минут, одноразовость)
   ├─ дубль того же сообщения за 10 минут не отправляется повторно
   └─ Telegram Bot API sendMessage (plain text, таймаут 8 с) ──▶ ваш личный чат
◀── {ok:true} только если Telegram принял сообщение
```

- Сайт показывает «Сообщение доставлено» **только** после ответа `{ok:true}`.
- При любом сбое или ограничении посетитель видит честную ошибку и предложение написать в мессенджер. Введённые данные остаются в форме.
- Ответы API не повторяют введённые данные: возвращаются только коды ошибок.
- В логи пишутся только коды событий, без имён, email, контактов, текста, IP и токенов.
- IP и сообщения хранятся в KV только как солёные SHA-256-хэши.

Формат уведомления (plain text, время Asia/Bangkok):

```
B2B / Wholesale enquiry            ← только для заявок с /wholesale/
Новое обращение с teaphuket.com

Имя: …
Компания: …                        ← только B2B
Email: …
Контакт: WhatsApp: +66… | Telegram: @…
Сообщение:
…
Язык: EN | RU
Страница: https://teaphuket.com/ru/contact/
Дата и время: 15.10.2026, 18:42 (Asia/Bangkok)
```

## Что потребуется (всё бесплатно)

1. **Telegram-бот.**
   - В @BotFather выполните `/newbot` и получите токен.
   - Напишите боту любое сообщение и узнайте свой `chat_id`.
   - Токен не присылайте в чат и не сохраняйте в файлы.
2. **Cloudflare Turnstile.**
   - Dashboard → Turnstile → Add widget.
   - Domain: `teaphuket.com`. Mode: **Managed**.
   - Вы получите два ключа:
     - **Site key** – публичный, вписывается в `cfg_turnstile_sitekey` в `_build/build.py`, коммитить можно.
     - **Secret key** – только в секреты Worker (шаг 4), никуда больше.
3. **Workers KV:** выполните `npx wrangler kv namespace create FORM_KV` и вставьте выданный `id` в `wrangler.toml`.
4. **Секреты Worker.** Задаются только командами `wrangler secret put`, хранятся у Cloudflare в зашифрованном виде:

   | Имя | Что это |
   |---|---|
   | `TELEGRAM_BOT_TOKEN` | токен бота |
   | `TELEGRAM_CHAT_ID` | ваш chat_id |
   | `TURNSTILE_SECRET` | Secret key из Turnstile |
   | `HASH_SALT` | случайная строка, например результат `openssl rand -hex 32` |

   Привязки `RL_IP`, `RL_GLOBAL` (rate limiting) и `FORM_KV` описаны в `wrangler.toml.example`.
   - Без любого из секретов или привязок Worker отвечает 503 и ничего не отправляет.
   - Необязательные переменные: `EXTRA_ORIGINS` и `EXTRA_HOSTNAMES` – только для отдельного тестового домена.

5. **Развёртывание.** Выполняется на вашем компьютере, с вашим входом в Cloudflare:
   ```bash
   cd _server/contact-worker
   cp wrangler.toml.example wrangler.toml
   npx wrangler login
   npx wrangler kv namespace create FORM_KV
   npx wrangler secret put TELEGRAM_BOT_TOKEN
   npx wrangler secret put TELEGRAM_CHAT_ID
   npx wrangler secret put TURNSTILE_SECRET
   npx wrangler secret put HASH_SALT
   npx wrangler deploy
   ```
6. **Включить формы:**
   - в `_build/build.py` указать `"cfg_form_endpoint": "/api/contact"` и `"cfg_turnstile_sitekey": "<site key>"`;
   - выполнить `python3 _build/build.py`;
   - прогнать тесты, сделать коммит, после отдельного разрешения – Push.

Дополнительный слой (по желанию): Cloudflare → Security → WAF → Rate limiting rules, правило на путь `/api/contact`. В бесплатном плане доступно одно правило.

## Как проверить без спама

1. **Локально, без сети:** `cd _qa && npm run unit && npx playwright test e2e/pages.spec.js`. Telegram и Turnstile там заменены заглушками.
2. **После deploy, без секретов** (до шага 4): `curl` из раздела ниже должен вернуть `503 {"ok":false}`. Это проверяет fail-closed.
3. **С секретами:** один `curl` без Turnstile-токена должен вернуть `400 {"error":"captcha"}`. Сообщение в Telegram прийти не должно.
4. **Один** реальный тест – отправить форму с `/contact/` в браузере. Проверьте пометку B2B на `/ru/wholesale/` и время по Бангкоку.

```bash
curl -i https://teaphuket.com/api/contact -H 'Origin: https://teaphuket.com' -H 'Content-Type: application/json' -d '{"inquiry_type":"contact","name":"Test","email":"test@example.com","contact_method":"whatsapp","contact_value":"","message":"Test message","page_language":"en","page_path":"/contact/","website":"","elapsed_ms":5000}'
```

## Чек-лист перед включением на production

- [ ] Бот создан, chat_id получен
- [ ] Turnstile-виджет создан для teaphuket.com
- [ ] KV создан, 4 секрета заданы, Worker развёрнут, проверки 2–3 пройдены
- [ ] В Meta Events Manager выключен Automatic Advanced Matching (P-1 из аудита)
- [ ] Опубликована политика конфиденциальности, ссылка добавлена под формы (`form.note` в `build.py`)
- [ ] `cfg_form_endpoint` и `cfg_turnstile_sitekey` заданы, сайт пересобран, тесты зелёные
- [ ] Отдельное разрешение на публикацию – после этого Push
