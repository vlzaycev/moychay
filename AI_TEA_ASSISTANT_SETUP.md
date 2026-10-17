# Cha: запуск, секреты, сотрудники, база знаний, расходы

Токенов и ключей в этом файле нет и не должно быть. Все секреты вводятся только командой `npx wrangler secret put`: значение набирается в терминале и хранится у Cloudflare в зашифрованном виде.

## 0. Что нужно от вас перед запуском (чек-лист)

- [ ] **Решение по модели и бюджету** (раздел 6). Рекомендую Claude Haiku 5.5 с месячным лимитом $20.
- [ ] **Аккаунт Anthropic Console:** API-ключ и месячный лимит расходов. Платный сервис: подключать только после вашего согласия.
- [ ] **Новый бот в BotFather** «Moychay Live Support» (раздел 2). Бота форм не трогаем.
- [ ] **Бот добавлен в группу сотрудников** `-5304623826`.
- [ ] **Telegram user ID** всех, кто будет отвечать посетителям.
- [ ] **Политика конфиденциальности** опубликована на сайте (текст – раздел 8).
- [ ] **Разрешение на деплой Worker** `teaphuket-chat` и на включение чата на сайте.

## 1. Варианты Telegram-бота: почему отдельный

| | A. Расширить бота форм | B. Отдельный бот (рекомендую) |
|---|---|---|
| Webhook | Пришлось бы поставить webhook на бота форм. Сейчас его нет, но любая ошибка затронет заявки | Свой webhook, формы не затрагиваются |
| Токен | Один токен на две системы | Утечка одного токена не открывает другую систему |
| Права | Общие | Можно дать разные права |
| Сложность | Та же | Та же |

## 2. Что сделать в Telegram

1. **Создать бота.** В @BotFather: `/newbot` → имя `Moychay Live Support` → username, например `moychay_live_support_bot`.
   - Токен **никому не пересылайте**, включая этот чат.
   - Если токен всё же попал в чат или на экран, отзовите его: `/revoke`.
2. **Добавить бота** в группу «Заявки teaphuket.com» (`-5304623826`).
   - Права администратора не нужны.
   - Privacy mode оставьте включённым. Бот видит только ответы на свои сообщения и нажатия кнопок, обычную переписку группы он не читает.
3. **Собрать Telegram ID сотрудников.** Каждый пишет боту @userinfobot и присылает число, это не секрет. Ваш ID: `362008939`.
4. **Проверить бота форм.** Убедиться, что у него нет webhook: в ответе на команду ниже должно быть `"url":""`. Токен бота форм вводится скрытно:
   ```bash
   read -s FORM_BOT && curl -s "https://api.telegram.org/bot${FORM_BOT}/getWebhookInfo"; unset FORM_BOT
   ```

## 3. Развёртывание (выполняется на вашем компьютере, после разрешения)

Все команды выполняются из папки `_server/chat-worker`.

```bash
cd _server/chat-worker
cp wrangler.toml.example wrangler.toml
```

1. **База D1.** Бесплатно, создаётся один раз:
   ```bash
   npx wrangler d1 create teaphuket-chat
   ```
   Выданный `database_id` вставьте в `wrangler.toml`.
2. **Таблицы и база знаний:**
   ```bash
   npm run db:migrate
   ```
   ```bash
   npm run kb:push
   ```
3. **Переменные** в `wrangler.toml`, раздел `[vars]`. Это не секреты:
   - `TELEGRAM_STAFF_CHAT_ID = "-5304623826"`;
   - `TELEGRAM_OPERATOR_IDS = "362008939,<ID сотрудника>,…"`.
4. **Секреты.** Каждая команда спросит значение:
   ```bash
   npx wrangler secret put AI_API_KEY
   ```
   ```bash
   npx wrangler secret put TELEGRAM_SUPPORT_BOT_TOKEN
   ```
   ```bash
   npx wrangler secret put TELEGRAM_WEBHOOK_SECRET
   ```
   ```bash
   npx wrangler secret put TURNSTILE_SECRET
   ```
   ```bash
   npx wrangler secret put HASH_SALT
   ```
   - для `TELEGRAM_WEBHOOK_SECRET` и `HASH_SALT` подойдёт результат `openssl rand -hex 32`;
   - `TURNSTILE_SECRET` – тот же, что у Worker форм.
5. **Деплой:**
   ```bash
   npx wrangler deploy
   ```
   Wrangler покажет два адреса: маршрут `teaphuket.com/api/chat/*` и `https://teaphuket-chat.<ваш-поддомен>.workers.dev`.
6. **Webhook** на адрес `workers.dev`. Токен и секрет вводятся скрытно и не остаются в истории терминала:
   ```bash
   read -s BOT && read -s SECRET && curl -s "https://api.telegram.org/bot${BOT}/setWebhook" -d "url=https://teaphuket-chat.<ваш-поддомен>.workers.dev/api/chat/telegram" -d "secret_token=${SECRET}" -d 'allowed_updates=["message","callback_query"]' -d drop_pending_updates=true; unset BOT SECRET
   ```
   Ответ должен быть `{"ok":true,…}`.
7. **Проверка без сайта.** Без секретного заголовка webhook должен отказать (401):
   ```bash
   curl -s -o /dev/null -w "%{http_code}\n" -X POST https://teaphuket-chat.<ваш-поддомен>.workers.dev/api/chat/telegram -d '{}'
   ```
8. **Включить чат на сайте:**
   - в `_build/build.py` указать `"cfg_chat_endpoint": "/api/chat"`;
   - выполнить `python3 _build/build.py`;
   - прогнать тесты: `cd _qa && npm run unit && npx playwright test`;
   - сделать коммит и Push.

**Откат:**
- `"cfg_chat_endpoint": ""` и Push убирают кнопку с сайта;
- `AI_ENABLED = "0"` и `npx wrangler deploy` выключают только AI.

**Bot Fight Mode.** Если вы его включили, проверьте после запуска, что запросы `/api/chat/*` с сайта не блокируются: Security → Events.

## 4. Сотрудники

- **Добавить или убрать** – изменить `TELEGRAM_OPERATOR_IDS` в `wrangler.toml` и выполнить `npx wrangler deploy`. Отвечать посетителям могут только эти ID. Участники группы не из списка получат ответ «Only authorised team members…».
- **Как отвечать** – Reply (Ответить) на сообщение бота в группе. Нажимать Take over перед первым ответом не обязательно.
- **Кнопки:** Take over – взять разговор, Return to AI – вернуть AI, Close request – закрыть.
- **Только текст:** фото и файлы в чат сайта не уходят, бот сообщит об этом сотруднику.
- **Если ответить некому**, посетитель видит, что вопрос передан команде, обычно ответ приходит в часы работы. Ему предлагаются WhatsApp, Telegram и страница контактов, а также необязательное поле для своего контакта.

## 5. База знаний

| Где | Что | Как обновить |
|---|---|---|
| `_content/assistant/site/*.md` | Факты со страниц сайта: церемонии, цены, чай, матча, wholesale, контакты | Генерируются при `python3 _build/build.py`. Изменили сайт – база обновилась |
| `_content/assistant/knowledge/*.md` | Ручные документы: магазин и доставка, запись, FAQ, границы | Редактируйте или добавляйте `.md` с шапкой `id` / `title` |
| `_content/assistant/assistant.json` | Имя ассистента, приветствия, быстрые действия, срок хранения | Пересобрать сайт и сделать `npx wrangler deploy` |

После изменений выполните:
```bash
cd _server/chat-worker && npm run kb:push
```
Worker подхватит новую базу в течение 5 минут, деплой не нужен.

Пишите в документы только **подтверждённые** факты. Чего нет в базе, ассистент честно называет неизвестным и предлагает позвать команду.

## 6. Модель и стоимость

Цены проверены по официальной документации 18.10.2026 ([Anthropic](https://platform.claude.com/docs/en/about-claude/pricing), [Google](https://ai.google.dev/gemini-api/docs/pricing)), USD за 1 млн токенов:

| Модель | Вход | Чтение кэша | Выход | Роль |
|---|---|---|---|---|
| **Claude Haiku 5.5** (`claude-haiku-5-5`) | 0.10 | 0.01 | 0.50 | **Основная.** Качественный EN/RU/TH, кэширование базы знаний, быстрая |
| Gemini 2.5 Flash-Lite (`gemini-2.5-flash-lite`) | 0.10 | – | 0.40 | Экономичная альтернатива через OpenAI-совместимый API (`AI_PROVIDER=openai`). Качество тайского нужно проверить отдельно |
| Claude Sonnet 5.5 (`claude-sonnet-5-5`) | 2.00 | 0.10 | 10.00 | Если Haiku не хватит качества. Примерно в 20 раз дороже |

**Предположения** (оценка, не точная стоимость):
- диалог – 4 вопроса посетителя;
- на каждый вопрос модель получает около 7 тыс. токенов кэшируемой части (правила + база) и около 1 тыс. токенов истории и живых данных;
- ответ – около 200 токенов;
- в месяце 30 дней;
- «с кэшем» учитывает одну запись кэша на разговор (кэш живёт 5 минут), «без кэша» – запись кэша при каждом вызове.

| Диалогов в день | Haiku 5.5, с кэшем | Haiku 5.5, без кэша (худший случай) | Gemini 2.5 Flash-Lite | Sonnet 5.5, с кэшем |
|---|---|---|---|---|
| 10 | ≈ $0.6 в месяц | ≈ $1.3 | ≈ $1 | ≈ $11 |
| 50 | ≈ $3 | ≈ $6.5 | ≈ $5 | ≈ $55 |
| 200 | ≈ $12 | ≈ $26 | ≈ $21 | ≈ $215 |

Перевод (`TRANSLATE=1`) добавляет до одного короткого вызова на каждое сообщение в разговоре с сотрудником, это доли цента.

**Cloudflare** — в пределах бесплатных лимитов:
- Workers: 100 000 запросов в день;
- D1: 5 млн чтений и 100 000 записей в день;
- Rate Limiting и cron — бесплатно.

**Как ограничить расходы:**
1. **В Anthropic Console** установите месячный лимит расходов на организацию или workspace, например $20, и уведомления на email. Это жёсткий предел на стороне провайдера.
2. **В Worker** — дневной лимит `AI_DAILY_LIMIT` (по умолчанию 1000 ответов) и предупреждение в Telegram при 80 %.
3. **Проверка расхода:**
   ```bash
   cd _server/chat-worker && npm run usage
   ```
   Команда показывает токены, ошибки и передачи сотрудникам за 14 дней.

**Хранение данных у провайдера.** Данные API Anthropic по умолчанию не используются для обучения моделей. AI Gateway в схеме не используется. Если его добавите, отключите в нём логирование тел запросов (Logs → payload).

## 7. Аналитика

Новые события отправляются через существующую `window.track()`, то есть в GA4, GTM, Метрику (если подключена) и Meta. Отправляются **только названия событий**: текст сообщений, контакты и имена никуда не уходят.

| Событие | Когда |
|---|---|
| `chat_open` | Открыто окно чата |
| `chat_started` | Создан разговор (первое сообщение) |
| `chat_message_sent` | Отправлено сообщение. Это **не** конверсия |
| `chat_handoff_requested` | Позвали сотрудника |
| `chat_handoff_accepted` | Сотрудник подключился. Срабатывает вживую, не при перезагрузке истории |
| `chat_lead_submitted` | Посетитель оставил контакт для команды |
| `chat_shop_click`, `chat_directions_click`, `chat_ceremony_click` | Кнопки в ответах |
| `whatsapp`, `telegram` (место `chat`) | Существующие события мессенджеров, без дублей |

**Рекомендация после запуска:** в GA4 отметить как ключевые события `chat_handoff_requested` и `chat_lead_submitted`. В Google Ads импортировать их как вторичные конверсии, пока не наберётся статистика. Основными остаются маршрут и мессенджеры, как сейчас.

**Согласие на cookies.** На сайте пока нет баннера согласия (пункт C-4 аудита). Чат новых cookies не ставит, в `localStorage` хранится только токен разговора.

## 8. Дополнение к Privacy Policy (черновик, EN; RU и TH – после согласования)

> **Chat assistant (Cha).** Our website offers an AI chat assistant. When you use it, your messages and the page you started from are processed to answer you: by Cloudflare (hosting and storage) and by our AI provider (Anthropic, PBC) to generate answers. If you ask to talk to our team, the conversation is shared in our staff Telegram chat (Telegram FZ-LLC), where team members reply. We do not ask for personal data in the chat; please do not share sensitive information. If you leave a phone number, messenger name or email, we use it only to answer your request. Chat conversations are deleted 30 days after the last message. Chat contents are not sent to analytics or advertising systems and are not used for marketing. You can ask us to delete a conversation earlier at info@phuket.moychay.asia (tell us the time of the chat and the page). Legal basis: your request (Thai PDPA – performance of a contract / legitimate interest in answering enquiries).

Для Таиланда действует PDPA. Финальный текст политики стоит согласовать с юристом. Сейчас страницы политики на сайте нет, она нужна и для форм.
