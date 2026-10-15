# Подключение форм к Telegram – что осталось сделать

Код готов в `_server/contact-worker/` и покрыт тестами (`_qa/unit/contact.test.mjs`). Сейчас он **не развёрнут**, а формы на сайте отключены (`cfg_form_endpoint = ""` в `_build/build.py`).

## Как это работает

```
браузер (форма) ──POST JSON──▶ https://teaphuket.com/api/contact (Cloudflare Worker)
                                   ├─ проверка Origin, размера, rate limit
                                   ├─ антиспам: honeypot "website", время заполнения ≥ 3 с, (опц.) Turnstile
                                   ├─ серверная валидация и нормализация полей
                                   └─ Telegram Bot API sendMessage ──▶ ваш личный чат
                                ◀── {ok:true} только если Telegram принял сообщение
```

- Сайт показывает «Сообщение доставлено» **только** после ответа `{ok:true}`.
- Если бот не настроен, обработчик отвечает 503, и пользователь видит ошибку с предложением написать в мессенджер. Если Telegram недоступен – 502, результат тот же.
- Worker работает на том же домене, поэтому CORS не нужен. Сторонние webhook-сервисы не используются.

Формат уведомления: plain text, без разметки, поэтому пользовательский ввод не может её сломать. Время – Asia/Bangkok.

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

## Что потребуется

1. **Бот.**
   - В Telegram откройте @BotFather → `/newbot` и получите токен. Токен не присылайте в чат и не сохраняйте в файлы репозитория.
   - Напишите своему боту любое сообщение.
   - Узнайте свой `chat_id`: например, через `https://api.telegram.org/bot<TOKEN>/getUpdates` в своём браузере или с помощью @userinfobot.
2. **Cloudflare** (домен уже там): права на Workers для зоны teaphuket.com.
3. **Переменные окружения** – секреты Worker, задаются только через Cloudflare:

   | Имя | Обязательно | Что это |
   |---|---|---|
   | `TELEGRAM_BOT_TOKEN` | да | токен бота от @BotFather |
   | `TELEGRAM_CHAT_ID` | да | ваш личный chat_id |
   | `TURNSTILE_SECRET` | нет | секрет Cloudflare Turnstile, если включаем капчу |
   | `EXTRA_ORIGINS` | нет | доп. Origin через запятую, например для теста |

4. **Развёртывание.** Выполняется на вашем компьютере, с вашим логином Cloudflare:
   ```bash
   cd _server/contact-worker
   cp wrangler.toml.example wrangler.toml
   npx wrangler login
   npx wrangler secret put TELEGRAM_BOT_TOKEN
   npx wrangler secret put TELEGRAM_CHAT_ID
   npx wrangler deploy
   ```
   Маршрут `teaphuket.com/api/contact` задаётся в `wrangler.toml`. В нём же отключены логи observability и настроен rate limit: 5 обращений в минуту с одного IP.
5. **Включить формы на сайте:** в `_build/build.py` указать `"cfg_form_endpoint": "/api/contact"`, затем `python3 _build/build.py`, тесты, коммит и Push.

## Защита токенов и данных

- Токен хранится только в секретах Cloudflare Worker. Во фронтенде и в репозитории его нет. Unit-тест `no secrets / tokens committed` проверяет tracked-файлы.
- `.dev.vars` для локального теста добавлен в `.gitignore`.
- Обработчик не пишет в логи имена, email, контакты и тексты – только код ошибки и тип обращения.
- В GA4/GTM уходит только факт отправки (`contact_form_submit` / `wholesale_form_submit`), без персональных данных.

## Антиспам

- Скрытое поле-ловушка `website`.
- Отказ, если форма отправлена быстрее чем за 3 секунды.
- Rate limit Cloudflare: 5 запросов в минуту на IP.
- Проверка Origin: принимаются только запросы с `https://teaphuket.com`.
- Лимит тела запроса – 16 KB, лимиты длины полей.
- Опционально – Cloudflare Turnstile. Если спам появится, нужно задать `TURNSTILE_SECRET` и добавить на форму виджет Turnstile, который передаёт `turnstile_token`.

## Как проверить реальную отправку

1. После `wrangler deploy` выполните в терминале:
   ```bash
   curl -i https://teaphuket.com/api/contact -H 'Origin: https://teaphuket.com' -H 'Content-Type: application/json' -d '{"inquiry_type":"contact","name":"Test","email":"test@example.com","contact_method":"whatsapp","contact_value":"","message":"Test message","page_language":"en","page_path":"/contact/","website":"","elapsed_ms":5000}'
   ```
   Ожидаемый результат – `200 {"ok":true}` и сообщение в Telegram.
2. Проверка без секретов: тот же запрос должен вернуть `503 {"ok":false}`, а не успех.
3. Включите формы локально (`cfg_form_endpoint`), отправьте форму с `/contact/` и `/ru/wholesale/`. Проверьте пометку B2B, Telegram username без `@` и время по Бангкоку.
4. Запустите `cd _qa && npm run unit && npx playwright test e2e/pages.spec.js`.

## Чек-лист перед включением на production

- [ ] Бот создан, `chat_id` получен, секреты заданы в Cloudflare
- [ ] Worker развёрнут, `curl` возвращает `{"ok":true}`, сообщение пришло
- [ ] Опубликована страница политики конфиденциальности, ссылка добавлена под формы (`form.note` в `build.py`)
- [ ] `cfg_form_endpoint = "/api/contact"`, сайт пересобран, тесты зелёные
- [ ] Отдельное разрешение на публикацию – после этого Push
