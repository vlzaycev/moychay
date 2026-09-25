# teaphuket.com — как устроен сайт

```
index.html          EN-версия (https://teaphuket.com/)
ru/index.html       RU-версия (https://teaphuket.com/ru/)
img/                фото, логотип, og.jpg (превью для мессенджеров)
favicon.ico, apple-touch-icon.png
CNAME               домен для GitHub Pages
robots.txt, sitemap.xml
_build/             шаблон и тексты (GitHub Pages эту папку не публикует)
```

## Как править

Обе версии собираются из одного шаблона, поэтому вёрстка у них всегда одинаковая.

1. Тексты и ID аналитики лежат в `_build/build.py`, вёрстка и стили в `_build/template.html`.
2. После правки запустите из корня сайта:
   `python3 _build/build.py`
3. Скрипт перезапишет `index.html` и `ru/index.html`.

## Аналитика

В `_build/build.py`, блок `CONFIG`:

| Поле | Что вставить |
|---|---|
| `cfg_ga4` | ID Google Analytics 4, вида `G-XXXXXXX` |
| `cfg_ads` | тег Google Ads, вида `AW-XXXXXXX` |
| `cfg_ads_directions` | метка конверсии «Маршрут» (часть после `/` в `send_to`) |
| `cfg_ads_message` | метка конверсии «Написали в WhatsApp или Telegram» |
| `cfg_ym` | номер счётчика Яндекс Метрики |
| `cfg_pixel` | ID Meta Pixel |

- Пустое поле означает, что эта система не подключается.
- Клики по кнопкам уходят событиями во все подключённые системы: `directions`, `whatsapp`, `telegram`, `catalog`, `instagram`, `facebook`.
- В Метрике это цели типа «JavaScript-событие» с такими же названиями.
- В Meta Pixel события приходят как `FindLocation` (маршрут) и `Contact` (мессенджеры).

## Мероприятия

- Список берётся из Google Таблицы «Moychay Phuket — Events» (выгрузка CSV, значения читаются как текст).
- Необязательная колонка `image`: имя фото из папки img (например `3_people` или `8_shop`) или полная ссылка на картинку. Если пусто, фото подбирается автоматически по названию, без повторов.
- Доступ к таблице: «Все, у кого есть ссылка → Читатель».
- Колонки:
  - `date`: дата, лучше в формате `2026-10-03`;
  - `time`;
  - `title_en` / `title_ru`, `text_en` / `text_ru`, `price_en` / `price_ru`;
  - `link`: необязательно;
  - `show`: `no` или `нет` скрывает строку.
- Сайт сам убирает прошедшие даты (по времени Пхукета) и ставит ближайшие первыми.
- Если событий нет, в блоке показывается текст со ссылкой на анонсы.

## Якоря блоков (для рекламы)

`#home`, `#highlights`, `#why-visit`, `#gallery`, `#about`, `#prices`, `#teas`, `#events`, `#delivery`, `#faq`, `#find-us`, `#visit`, `#contacts`. Одинаковые в EN и RU.

UTM-метки ставятся до якоря: `https://teaphuket.com/ru/?utm_source=yandex&utm_campaign=events#events`
