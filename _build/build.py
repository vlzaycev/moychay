#!/usr/bin/env python3
"""
Builds index.html (EN) and ru/index.html (RU) from template.html.

    python3 _build/build.py

Edit texts below and analytics IDs in CONFIG, then run the script.
The _build folder is not published by GitHub Pages.
"""
import json
import os
from urllib.parse import quote

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

# ── Analytics & data ─────────────────────────────────────────────
CONFIG = {
    "cfg_ga4": "",              # "G-XXXXXXXXXX"
    "cfg_ads": "",              # "AW-XXXXXXXXX"
    "cfg_ads_directions": "",   # conversion label for "Get directions"
    "cfg_ads_message": "",      # conversion label for WhatsApp / Telegram
    "cfg_ym": "",               # Yandex Metrika counter ID
    "cfg_pixel": "",            # Meta Pixel ID
    "cfg_sheet": "1zcA3xGzhUeQvWD2pFi1obgOf8mC2gi32D0l_q4tw_es",  # events Google Sheet
}

MAPS = "https://maps.app.goo.gl/uuZkb3YwtNMGQhy18"
WA = "https://wa.me/66817959110"
TG = "https://t.me/moychay_phuket"


def wa(text):
    return f"{WA}?text={quote(text)}"


def arrow():
    return '<svg class="ico"><use href="#i-arrow"/></svg>'


def paras(items, cls="muted"):
    return "\n".join(f'      <p class="{cls}">{p}</p>' for p in items)


def trust(items):
    icons = ["i-jars", "i-vase", "i-book", "i-clock", "i-talk"]
    return "\n".join(
        f'      <li class="rv"><svg class="ico" aria-hidden="true"><use href="#{i}"/></svg>{t}</li>'
        for i, t in zip(icons, items))


def cards(items, root):
    # order: pin, ceremony, group, matcha
    keys = ["b-pin", "b-cer", "b-group", "b-matcha"]
    out = []
    for key, c in zip(keys, items):
        price = c["price"]
        text = c["text"] + (" " + c["note"] if c.get("note") else "")
        if key == "b-cer":
            out.append(f'''      <article class="card feature {key} rv">
        <div class="ph"><img src="{root}img/people/8_people-700.jpg" srcset="{root}img/people/8_people-700.jpg 700w, {root}img/people/8_people.jpg 1400w" sizes="(min-width:900px) 40vw, 100vw" loading="lazy" decoding="async" alt="{c["alt"]}"></div>
        <div class="in">
          <h3>{c["name"]}</h3>
          <p class="price">{price}</p>
          <p>{text}</p>
        </div>
      </article>''')
        else:
            out.append(f'''      <article class="card {key} rv">
        <h3>{c["name"]}</h3>
        <p class="price">{price}</p>
        <p>{text}</p>
      </article>''')
    return "\n".join(out)


def tea(items):
    out = []
    for n, (name, text) in enumerate(items, 1):
        out.append(f'''      <li class="cat">
        <button class="cat-h" type="button" aria-expanded="false"><span class="n">{n:02d}</span><span class="t">{name}</span><svg class="ico" aria-hidden="true"><use href="#i-plus"/></svg></button>
        <div class="acc-p"><div><p>{text}</p></div></div>
      </li>''')
    return "\n".join(out)


def faq(items):
    out = []
    for q, a in items:
        out.append(f'''      <li>
        <button class="faq-q" type="button" aria-expanded="false">{q}<svg class="ico" aria-hidden="true"><use href="#i-plus"/></svg></button>
        <div class="acc-p"><div><p>{a}</p></div></div>
      </li>''')
    return "\n".join(out)


def footer(items):
    return "\n".join(
        f'        <li><a href="{u}" target="_blank" rel="noopener" aria-label="{name}" title="{name}" data-track="{t}" data-place="footer"><svg class="bi" aria-hidden="true"><use href="#{icon}"/></svg></a></li>'
        for name, u, t, icon in items)


# ── EN ───────────────────────────────────────────────────────────
EN = dict(
    lang="en", root="", head_font="\"Space Grotesk\"", head_font_q="Space+Grotesk:wght@500;600;700", canonical="https://teaphuket.com/", og_locale="en_US", map_lang="en",
    cur_en='aria-current="page"', cur_ru="",
    meta_title="Moychay Phuket — Tea House on Boat Avenue, Bangtao",
    meta_desc="Taste 200+ real teas, join a gong fu cha ceremony or just slow down. 2nd floor, Boat Avenue, Bangtao, Phuket. Open daily 11AM–10PM, walk in anytime.",
    nav_label="Sections", nav_visit="Visit", nav_ways="Try tea", nav_tea="Teas", nav_events="Events", nav_find="Find us",
    maps=MAPS,
    msg_url=wa("Hi! I found you on teaphuket.com"),
    msg_order_url=wa("Hi! I'd like to order tea with delivery"),
    msg_event="whatsapp",
    hero_alt="Round table and arched window with teaware at Moychay Phuket",
    hero_eyebrow="Tea house · Boat Avenue, Bangtao",
    hero_h1="Phuket <em class='acc'>tea</em> club",
    hero_sub="A calm spot on the 2nd floor of Boat Avenue where you can taste real tea, learn how it's brewed, or just sit and slow down. No experience needed, walk in anytime.",
    addr_short="2nd floor, Boat Avenue, Bangtao",
    addr_full="2nd floor, Boat Avenue, Bangtao, Phuket",
    hours="Open daily 11AM – 10PM",
    hours_full="Open daily, 11AM – 10PM",
    parking="Parking on site",
    cta_directions="Get directions",
    cta_directions_sticky="Get directions",
    cta_message="Message us on WhatsApp",
    cta_message_short="Message us on WhatsApp",
    trust_label="Why guests come",
    trust_items=trust([
        "200+ teas to taste, not just browse",
        "Real antiques – for sale, not for show",
        "Board games &amp; a reading corner",
        "Open daily, 11AM – 10PM, parking on site",
        "We speak Thai, English and Russian",
    ]),
    why_eyebrow="Why visit",
    why_h2="A <em class='acc'>quiet</em> place in Phuket",
    why_body=paras([
        "You don't need to know anything about tea to walk in. Some people come for a proper tea ceremony, some just want a quiet corner away from the beach crowds, some want a matcha latte in a calm setting, and some are simply curious what a «tea house» even is. All of that is welcome here.",
        "The room does a lot of the work: bare concrete, calligraphy on the walls, a rattan peacock chair by the window, and shelves stacked with hundreds of teapots. Come in, sit down, and our tea master will help you find what fits – whether that's a full ceremony or just a good cup.",
    ]),
    cta_plan="Plan your visit",
    alt_6shop="Rattan peacock chair and calligraphy scrolls on a concrete wall",
    gal_eyebrow="Inside the tea house",
    gal_hint="Swipe →",
    alt_8shop="Tea table by the arched window",
    alt_3shop="Shelves of clay teapots and porcelain cups",
    alt_5shop="Long room with concrete walls and wooden tables",
    alt_4shop="Round tea table with teaware and books",
    alt_2shop="Pu-erh tea cakes on dark shelves",
    alt_7shop="Moychay Phuket entrance on Boat Avenue",
    about_eyebrow="About Moychay Phuket",
    about_h2="Part of something bigger, rooted in <em class='acc'>Phuket</em> since 2024",
    about_body=paras([
        "Moychay Phuket has been open on Boat Avenue since 2024, and we're part of Moychay – an international tea community with tea houses and a following across the world. That means the tea on our shelves is sourced through relationships built over years, not picked from a random supplier list.",
        "But this spot is its own place: a small tea house where locals and travelers sit at the same table, guided by a tea master who's there to teach, not to upsell.",
    ]),
    ways_eyebrow="Ways to try tea here",
    ways_h2="Something for every level of <em class='acc'>curiosity</em>",
    ways_note="New to tea and not sure where to start? Just ask – our tea master will match something to your taste, whether that's a light green tea or a deep aged pu-erh.",
    tea_eyebrow="Explore tea categories",
    tea_h2="One shelf, a world of <em class='acc'>flavor</em>",
    tea_intro="No need to know these before you come – this is just a taste of what's on our shelves. Point at one, and our tea master will pour it for you.",
    tea_foot="Not sure which one?",
    tea_foot_link="Ask our tea master",
    tea_items=tea([
        ("White tea", "Light and delicate, with notes of honey and dried flowers."),
        ("Green tea", "Fresh and grassy, sometimes brothy, always bright."),
        ("Light oolongs", "Soft, floral and sweet – halfway between green and black tea."),
        ("Dark oolongs", "Roasted and rich, with notes of dark chocolate and toasted nuts."),
        ("Red tea (what the West calls black tea)", "Warming and smooth, with dried fruit and soft spice."),
        ("Young raw pu-erh (sheng)", "Fresh, vivid and a little grassy – energizing and clean."),
        ("Aged raw pu-erh (sheng)", "The same tea, matured for 10+ years into something deep and complex."),
        ("Shu pu-erh &amp; dark tea", "Earthy and grounding – a good match after a heavy meal."),
        ("Lao cha (aged tea)", "Years in careful storage turn bitterness into smooth, complex depth."),
        ("Herbal tea", "Caffeine-free infusions of herbs, flowers and fruit – calming or energizing, your pick."),
    ]),
    ev_eyebrow="Events at the tea house",
    ev_h2="<em class='acc'>Upcoming</em> events",
    ev_intro="We run tea tastings, ceremonies and other events at the tea house every week – open to everyone, no tea background required.",
    ev_cta="See upcoming events",
    ev_extra="",
    alt_5people="Guests at a candle-lit tea tasting",
    deliv_label="Delivery — can't make it in?",
    deliv_text="We ship anywhere in Thailand – free over 2000 THB.",
    deliv_cta="Order via WhatsApp",
    deliv_catalog="See our tea catalog",
    faq_eyebrow="FAQ",
    faq_h2="Common <em class='acc'>questions</em>",
    faq_items=faq([
        ("Do I need to book ahead?", "Not for a walk-in tasting or a casual pot of tea – just come by. A full gong fu cha ceremony or group event does need booking, since space is limited."),
        ("Do I need to know anything about tea?", "No. Most guests are trying a tea ceremony for the first time."),
        ("Can I really buy the antiques on the shelves?", "Yes – it's a real, purchasable collection, not decoration."),
        ("Is there parking?", "Yes, on site at Boat Avenue."),
        ("Do you deliver outside Phuket?", "Yes, anywhere in Thailand – free over 2000 THB."),
        ("Do you have anything besides tea?", "Yes – non-alcoholic matcha cocktails and kombucha, available to stay or to go."),
    ]),
    find_eyebrow="Find us",
    find_h2="2nd floor, <em class='acc'>Boat Avenue</em>",
    map_title="Moychay Phuket on Google Maps",
    find_addr_l="Address", find_hours_l="Hours", find_park_l="Parking",
    find_park="Parking on site, no booking needed",
    final_h2="Come <em class='acc'>taste</em> it for yourself",
    final_text="2nd floor, Boat Avenue. Walk in – no booking, no rush.",
    alt_8people="Guests at the round tea table by the arched window",
    footer_icons=footer([
        ("Google Maps", MAPS, "directions", "i-gm"),
        ("WhatsApp", WA, "whatsapp", "i-wa"),
        ("Instagram", "https://www.instagram.com/moychay.phuket", "instagram", "i-ig"),
        ("Facebook", "https://www.facebook.com/moychay.phuket/", "facebook", "i-fb"),
    ]),
    shop_link="Visit online shop",
    credit="Website development and marketing",
    msg_icon="i-wa",
    sticky_msg_url=wa("Hi! I found you on teaphuket.com"),
    sticky_msg_label="WhatsApp",
    cta_ways="Book in WhatsApp",
    prev_label="Previous", next_label="Next",
    alt_1shop="Round tea table by the arched window with teaware shelves",
    alt_ev="Guests at tea events in Moychay Phuket",
    alt_1people="Guest enjoying tea under a paper lantern",
    js=dict(lang="en", evEmpty="New dates are announced every week — follow us on Instagram.", evMore="Details"),
)
EN["ways_cards"] = cards([
    dict(name="Walk-in tasting (Pin Cha)", price="300฿ <small>+ tea by weight</small>",
         text="A relaxed 10-minute introduction from our tea master, then you sit and enjoy the tea you picked.", note="No booking needed."),
    dict(name="Gong fu cha ceremony", price="600฿ <small>per person</small>",
         text="A 60-minute guided ceremony covering brewing steps, teaware, and the tea itself, followed by up to 60 minutes to relax in the space.",
         note="Booking required.", alt="Guests at a tea ceremony at the round table by the arched window"),
    dict(name="Group ceremonies", price="<small>Price on request</small>",
         text="For birthdays, team events or gatherings – up to 30 guests, here or at your own venue. Message us to arrange it."),
    dict(name="Matcha-based cocktails &amp; kombucha", price="from 250฿",
         text="Non-alcoholic matcha lattes and tonics, plus kombucha on tap – all available to go, if you're not staying."),
], "")

# ── RU ───────────────────────────────────────────────────────────
RU = dict(
    lang="ru", root="../", head_font="Geologica", head_font_q="Geologica:wght@500;600;700", canonical="https://teaphuket.com/ru/", og_locale="ru_RU", map_lang="ru",
    cur_en="", cur_ru='aria-current="page"',
    meta_title="Moychay Phuket — чайный клуб на Boat Avenue, Бангтао",
    meta_desc="Более 200 сортов чая, церемонии гунфу ча и тихое место на Пхукете. 2 этаж Boat Avenue, Бангтао. Ежедневно 11:00–22:00, без записи.",
    nav_label="Разделы", nav_visit="Визит", nav_ways="Форматы", nav_tea="Чай", nav_events="События", nav_find="Как найти",
    maps=MAPS,
    msg_url=TG,
    msg_order_url=TG,
    msg_event="telegram",
    hero_alt="Круглый стол и арочное окно с чайной посудой в Moychay Phuket",
    hero_eyebrow="Чайная · Boat Avenue, Бангтао",
    hero_h1="Чайный <em class='acc'>клуб</em> на Пхукете",
    hero_sub="Находимся на 2 этаже Boat Avenue на Бангтао. У нас можно попробовать настоящий чай, узнать, как его заваривают, или просто посидеть и отдохнуть. Опыт не нужен – заходите в любое время.",
    addr_short="2 этаж, Boat Avenue, Бангтао",
    addr_full="2 этаж, Boat Avenue, Бангтао, Пхукет",
    hours="Ежедневно 11:00 – 22:00",
    hours_full="Открыты каждый день, с 11:00 до 22:00",
    parking="Парковка на месте",
    cta_directions="Проложить маршрут",
    cta_directions_sticky="Проложить маршрут",
    cta_message="Написать в Telegram",
    cta_message_short="Написать в Telegram",
    trust_label="Почему к нам приходят",
    trust_items=trust([
        "200+ сортов чая",
        "Настоящий антиквариат – всё можно купить",
        "Настольные игры и уголок для чтения (Библиотека Пхукет)",
        "Ежедневно с 11:00 до 22:00, парковка на месте",
        "Мы говорим на тайском, английском и русском",
    ]),
    why_eyebrow="Зачем приезжать",
    why_h2="<em class='acc'>Спокойное</em> место на Пхукете",
    why_body=paras([
        "Вам не нужно разбираться в чае, чтобы просто зайти. Кто-то приходит на настоящую чайную церемонию, кто-то хочет тихий уголок в стороне от пляжной суеты, кто-то – за матча-латте в спокойной обстановке поработать с компьютером, а кто-то просто из любопытства, что такое «чайный дом».",
        "Пространство говорит само за себя: бетонные стены, каллиграфия, ротанговое кресло-павлин у окна и полки с сотнями чайников – большинство из которых можно купить. Присаживайтесь, и наш чайный мастер поможет подобрать то, что вам подходит – будь то полноценная церемония или просто хороший чай.",
    ]),
    cta_plan="Запланировать визит",
    alt_6shop="Ротанговое кресло-павлин и свитки с каллиграфией на бетонной стене",
    gal_eyebrow="Внутри чайной",
    gal_hint="Листайте →",
    alt_8shop="Чайный стол у арочного окна",
    alt_3shop="Полки с глиняными чайниками и фарфоровыми чашками",
    alt_5shop="Зал с бетонными стенами и деревянными столами",
    alt_4shop="Круглый чайный стол с посудой и книгами",
    alt_2shop="Блины пуэра на тёмных полках",
    alt_7shop="Вход в Moychay Phuket на Boat Avenue",
    about_eyebrow="О Moychay Phuket",
    about_h2="Часть большего сообщества, но со своими <em class='acc'>корнями</em> с 2024 года",
    about_body=paras([
        "Чайная Moychay Phuket открылась на Boat Avenue в 2024 году. Мы – часть большого чайного сообщества Moychay с чайными домами и своей аудиторией по всему миру, но здесь, на Пхукете, у нас своё лицо: небольшая чайная, где местные жители, экспаты и путешественники садятся за один стол, а чайный мастер рядом не для того, чтобы продать, а чтобы показать, что такое настоящий чай.",
    ]),
    ways_eyebrow="Как попробовать чай у нас",
    ways_h2="Формат найдётся для любого уровня <em class='acc'>интереса</em>",
    ways_note="Новичок в чае и не знаете, с чего начать? Просто спросите – чайный мастер подберёт что-то по вашему вкусу, будь то лёгкий зелёный чай или выдержанный пуэр.",
    tea_eyebrow="Изучите категории чая",
    tea_h2="Одна полка – целый мир <em class='acc'>вкуса</em>",
    tea_intro="Знать это заранее не нужно – это просто немного о том, что у нас на полках. Укажите на любой, и чайный мастер нальёт вам попробовать.",
    tea_foot="Не знаете, что выбрать?",
    tea_foot_link="Спросите чайного мастера",
    tea_items=tea([
        ("Белый чай", "Лёгкий и деликатный, с нотами мёда и сухих цветов."),
        ("Зелёный чай", "Свежий и травянистый, иногда с бульонными нотами, всегда яркий."),
        ("Светлые улуны", "Мягкие, цветочные и сладкие – что-то между зелёным и чёрным чаем."),
        ("Тёмные улуны", "Обжаренные и насыщенные, с нотами тёмного шоколада и жареных орехов."),
        ("Красный чай (на Западе его называют «чёрным»)", "Согревающий и мягкий, с сухими фруктами и мягкими специями."),
        ("Молодой сырой пуэр (шэн)", "Свежий, яркий и немного травянистый – бодрящий и чистый."),
        ("Выдержанный сырой пуэр (шэн)", "Тот же чай, но выдержанный 10+ лет во что-то глубокое и сложное."),
        ("Шу пуэр и тёмные чаи", "Землистые и «заземляющие» – хорошо подходят после плотного приёма пищи."),
        ("Лао ча (выдержанный чай)", "Годы бережного хранения превращают горечь в мягкую, сложную глубину вкуса."),
        ("Травяной чай", "Бескофеиновые настои трав, цветов и фруктов – успокаивающие или бодрящие, на ваш выбор."),
    ]),
    ev_eyebrow="Мероприятия в чайной",
    ev_h2="<em class='acc'>Ближайшие</em> мероприятия",
    ev_intro="Мы проводим чайные дегустации, церемонии и другие мероприятия каждую неделю – открыто для всех, чайный опыт не требуется.",
    ev_cta="Смотреть ближайшие мероприятия",
    ev_extra=f'        <a class="tlink" href="{TG}" target="_blank" rel="noopener" data-track="telegram" data-place="events"><svg class="bi" aria-hidden="true"><use href="#i-tg"/></svg>Анонсы в нашем чайном клубе в Telegram</a>',
    alt_5people="Гости на дегустации при свечах",
    deliv_label="Доставка — если не можете приехать",
    deliv_text="Мы доставляем чай по всему Таиланду – бесплатно при заказе от 2000 ฿.",
    deliv_cta="Заказать в Telegram",
    deliv_catalog="Смотреть каталог чая",
    faq_eyebrow="Вопросы",
    faq_h2="Частые <em class='acc'>вопросы</em>",
    faq_items=faq([
        ("Нужно ли записываться заранее?", "Нет, просто приходите. А для полной церемонии гунфу-ча или группового мероприятия запись нужна, места ограничены."),
        ("Нужно ли разбираться в чае?", "Нет. Большинство гостей пробуют чайную церемонию впервые."),
        ("Можно ли купить антиквариат с полок?", "Да – это настоящая коллекция, доступная для покупки, а не просто декор."),
        ("Есть ли парковка?", "Да, на месте, на Boat Avenue."),
        ("Доставляете за пределы Пхукета?", "Да, по всему Таиланду – бесплатно при заказе от 2000 ฿. Действует также платная международная доставка."),
        ("Есть что-то кроме чая?", "Да – безалкогольные коктейли на матче и комбуча, можно остаться или взять с собой."),
    ]),
    find_eyebrow="Как нас найти",
    find_h2="2 этаж, <em class='acc'>Boat Avenue</em>",
    map_title="Moychay Phuket на Google Картах",
    find_addr_l="Адрес", find_hours_l="Часы работы", find_park_l="Парковка",
    find_park="Парковка на месте, запись не нужна",
    final_h2="Приезжайте и <em class='acc'>попробуйте</em> сами",
    final_text="2 этаж, Boat Avenue. Заходите – без записи, без спешки.",
    alt_8people="Гости за круглым чайным столом у арочного окна",
    footer_icons=footer([
        ("Google Maps", MAPS, "directions", "i-gm"),
        ("Яндекс Карты", "https://yandex.ru/maps/-/CXQU482P", "directions", "i-ya"),
        ("WhatsApp", WA, "whatsapp", "i-wa"),
        ("Чайный клуб в Telegram", TG, "telegram", "i-tg"),
        ("Instagram", "https://www.instagram.com/moychay.phuket", "instagram", "i-ig"),
        ("Facebook", "https://www.facebook.com/moychay.phuket/", "facebook", "i-fb"),
    ]),
    shop_link="Перейти в интернет-магазин",
    credit="Разработка сайта и маркетинг",
    msg_icon="i-tg",
    sticky_msg_url="https://t.me/moychayphuket",
    sticky_msg_label="Telegram",
    cta_ways="Написать в Telegram",
    prev_label="Назад", next_label="Вперёд",
    alt_1shop="Круглый чайный стол у арочного окна с полками посуды",
    alt_ev="Гости на чайных мероприятиях в Moychay Phuket",
    alt_1people="Гость пьёт чай под бумажным фонарём",
    js=dict(lang="ru", evEmpty="Анонсы появляются каждую неделю — следите за нами в Telegram и Instagram.", evMore="Подробнее"),
)
RU["ways_cards"] = cards([
    dict(name="Дегустация без записи (Пин Ча)", price="300฿ <small>+ чай по весу</small>",
         text="Спокойное 10-минутное введение от чайного мастера, а затем вы садитесь и наслаждаетесь выбранным чаем.", note="Без предварительной записи."),
    dict(name="Церемония гунфу ча", price="600฿ <small>с человека</small>",
         text="60-минутная церемония с чайным мастером: этапы заваривания, посуда и сам чай, плюс до 60 минут отдыха в пространстве после.",
         note="Требуется предварительная запись.", alt="Гости на чайной церемонии за круглым столом у арочного окна"),
    dict(name="Групповые церемонии", price="<small>Цена по запросу</small>",
         text="Для дней рождения, командных мероприятий или встреч – до 30 гостей, у нас или на вашей площадке. Напишите нам, чтобы договориться."),
    dict(name="Коктейли на матче и комбуча", price="от 250฿",
         text="Безалкогольные матча-латте и тоники, а также комбуча на разлив – всё можно взять с собой."),
], "../")


def build(data, out):
    html = open(os.path.join(HERE, "template.html"), encoding="utf-8").read()
    values = {**CONFIG, **data}
    values["js_i18n"] = json.dumps({**data["js"], "root": data["root"]}, ensure_ascii=False)
    for k, v in values.items():
        if isinstance(v, str):
            html = html.replace("{{" + k + "}}", v)
    left = [p for p in html.split("{{")[1:] if "}}" in p]
    if left:
        raise SystemExit(f"Unfilled placeholders in {out}: " + ", ".join(p.split("}}")[0] for p in left))
    path = os.path.join(ROOT, out)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    open(path, "w", encoding="utf-8").write(html)
    print("built", out)


build(EN, "index.html")
build(RU, "ru/index.html")
