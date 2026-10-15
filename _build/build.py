#!/usr/bin/env python3
"""
Builds index.html (EN) and ru/index.html (RU) from template.html.

    python3 _build/build.py

Edit texts below and analytics IDs in CONFIG, then run the script.
The _build folder is not published by GitHub Pages.
"""
import datetime
import json
import os
from urllib.parse import quote

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

# ── Analytics & data ─────────────────────────────────────────────
CONFIG = {
    "cfg_gtm": "GTM-WJQBWNL9",  # Google Tag Manager container (GA4, Ads, Pixel etc. are configured inside GTM)
    "cfg_gsc": "deblMaE7xgGLp7axGkXzbo1mVhtVkWtaBX_rFTN8G8g",  # Google Search Console verification
    "cfg_ga4": "G-66P7FXHBR0",  # Google Analytics 4 (loaded directly; do not add GA4 again inside GTM)
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


FONTS = json.load(open(os.path.join(HERE, "fonts.json"), encoding="utf-8"))


def fonts(families, preload, root):
    faces = []
    for fam in families:
        for f in FONTS[fam]:
            faces.append(
                f"@font-face{{font-family:'{fam}';font-style:normal;font-weight:{f['weight']};font-display:swap;"
                f"src:url({root}fonts/{f['file']}) format('woff2');unicode-range:{f['range']}}}")
    links = "\n".join(f'<link rel="preload" as="font" type="font/woff2" href="{root}fonts/{n}" crossorigin>' for n in preload)
    return "\n".join(faces), links


def wa(text):
    return f"{WA}?text={quote(text)}"


def paras(items):
    return "\n".join(f"      <p>{p}</p>" for p in items)


def facts(items):
    return "\n".join(f"        <li>{t}</li>" for t in items)


def menu(items):
    out = []
    for m in items:
        out.append(f"""        <li class="menu-i">
          <h3>{m["name"]}</h3>
          <p class="menu-p">{m["price"]}</p>
          <p class="menu-m">{m["meta"]}</p>
          <p class="menu-d">{m["text"]}</p>
        </li>""")
    return "\n".join(out)


def tea(items):
    return "\n".join(f"""        <li><h3>{name}</h3><p>{text}</p></li>""" for name, text in items)


def faq(items):
    out = []
    for n, (q, a) in enumerate(items, 1):
        out.append(f"""      <li>
        <button class="faq-q" type="button" aria-expanded="false" aria-controls="faq-{n}">{q}<svg class="ico" aria-hidden="true"><use href="#i-plus"/></svg></button>
        <div class="acc-p" id="faq-{n}"><div><p>{a}</p></div></div>
      </li>""")
    return "\n".join(out)


def footer(items):
    return "\n".join(
        f'        <li><a href="{u}" target="_blank" rel="noopener" aria-label="{name}" title="{name}" data-track="{t}" data-place="footer"><svg class="bi" aria-hidden="true"><use href="#{icon}"/></svg></a></li>'
        for name, u, t, icon in items)


COMMON = dict(maps=MAPS, head_font="Geologica", font_families=["Geologica", "Inter"])

# ── EN ───────────────────────────────────────────────────────────
EN = dict(
    COMMON,
    lang="en", root="", root_href="./", lang_label="Language",
    font_preload_files=["inter-latin.woff2", "geologica-latin.woff2"],
    canonical="https://teaphuket.com/", og_locale="en_US", map_lang="en",
    cur_en='aria-current="page"', cur_ru="",
    meta_title="Tea house in Phuket, tea ceremonies, matcha – Moychay Phuket",
    meta_desc="Visit Moychay Phuket – tea house in Phuket. Discover Pu-erh, Oolong, Matcha, Gaba, Green, White and Black teas. Chinese tea ceremonies, tastings and premium teas.",
    nav_label="Sections", nav_1="Tea ceremonies", nav_2="Our teas", nav_3="Events", nav_4="Contacts", nav_shop="Online shop",
    msg_url=wa("Hi! I found you on teaphuket.com"),
    msg_book_url=wa("Hi! I'd like to book a tea ceremony"),
    msg_order_url=wa("Hi! I'd like to order tea with delivery"),
    msg_event="whatsapp", msg_icon="i-wa",
    sticky_msg_url=wa("Hi! I found you on teaphuket.com"), sticky_msg_label="WhatsApp",
    hero_alt="Round tea table by the arched window at Moychay Phuket",
    hero_sub="Tea house &amp; tea ceremonies in Bangtao, Phuket",
    addr_short="2nd floor, Boat Avenue, Bangtao",
    addr_full="2nd floor, Boat Avenue, Bangtao, Phuket",
    hours="Open daily 11:00–22:00",
    cta_directions="Get directions",
    cta_message="Message us on WhatsApp",
    why_h2="A quiet place in Bangtao",
    why_body=paras([
        "You don't need to know anything about tea to come in. Guests book a ceremony, work over a matcha latte, or just want a quiet corner away from the beach.",
        "Concrete walls, calligraphy, a rattan peacock chair and shelves of teapots – most of them for sale. The tea master will help you choose.",
    ]),
    facts_label="About the tea house",
    facts=facts([
        "200+ teas to taste",
        "Antique teaware – for sale, not decor",
        "Board games and a reading corner",
        "We speak Thai, English and Russian",
    ]),
    gallery_label="Inside the tea house",
    alt_1shop="Round tea table by the arched window, shelves of teaware behind it",
    alt_6shop="Rattan peacock chair and calligraphy scrolls on a concrete wall",
    alt_3shop="Shelves of clay teapots and porcelain cups",
    alt_8shop="Tea table and wooden chairs by the arched window",
    alt_5shop="Long room with concrete walls and wooden tables",
    alt_4shop="Round tea table set with teaware and books",
    alt_2shop="Pu-erh tea cakes on dark shelves",
    alt_7shop="Moychay Phuket entrance on Boat Avenue",
    alt_8people="Guests at a tea ceremony at the round table",
    alt_1people="Guest with a cup of tea under a paper lantern",
    ways_h2="Tea ceremonies",
    ways_items=menu([
        dict(name="Walk-in tasting (Pin Cha)", price="300 ฿ <small>+ tea by weight</small>",
             meta="10 min with the tea master · No booking",
             text="A short introduction, then you stay with the tea you picked."),
        dict(name="Gong fu cha ceremony", price="600 ฿ <small>per person</small>",
             meta="60 min + up to 60 min to relax · Booking required",
             text="Brewing steps, teaware and the tea itself, guided by the tea master."),
        dict(name="Group ceremonies", price="Price on request",
             meta="Up to 30 guests · At the tea house or your venue",
             text="Birthdays, team events and gatherings."),
        dict(name="Matcha drinks &amp; kombucha", price="from 250 ฿",
             meta="To stay or to go",
             text="Non-alcoholic matcha lattes and tonics, kombucha on tap."),
    ]),
    ways_note="Not sure where to start? Ask the tea master – from a light green tea to an aged pu-erh.",
    cta_book="Book a ceremony on WhatsApp",
    tea_h2="Our teas",
    tea_intro="No need to know any of this before you come. Point at a jar, and the tea master will brew it for you.",
    tea_items=tea([
        ("White tea", "Light and delicate, with notes of honey and dried flowers."),
        ("Green tea", "Fresh and grassy, sometimes brothy, always bright."),
        ("Light oolongs", "Soft, floral and sweet – halfway between green and black tea."),
        ("Dark oolongs", "Roasted and rich, with notes of dark chocolate and toasted nuts."),
        ("Red tea (what the West calls black tea)", "Warming and smooth, with dried fruit and soft spice."),
        ("Young raw pu-erh (sheng)", "Fresh, vivid and a little grassy – energizing and clean."),
        ("Aged raw pu-erh (sheng)", "The same tea, matured for 10+ years into something deep and complex."),
        ("Shu pu-erh &amp; dark tea", "Earthy and grounding – a good match after a heavy meal."),
        ("Lao cha (aged tea)", "Years of careful storage turn bitterness into smooth, layered depth."),
        ("Herbal tea", "Caffeine-free infusions of herbs, flowers and fruit – calming or energizing."),
    ]),
    shop_h2="Your favorite tea, delivered",
    shop_text="Explore our selection of tea and teaware. Free delivery across Thailand on orders over ฿2,000. International shipping available.",
    shop_cta="Visit online shop",
    deliv_cta="Order on WhatsApp",
    ev_h2="Upcoming events",
    ev_intro="Tastings, ceremonies and evenings at the tea house every week. Open to everyone, no tea background needed.",
    ev_cta="Events on Instagram",
    ev_extra="",
    about_h2="On Boat Avenue since 2024",
    about_body=paras([
        "Moychay Phuket is part of Moychay, an international tea community with tea houses around the world – our teas come from suppliers they have worked with for years.",
        "The room is small: locals and travellers share one table, and the tea master is here to explain, not to upsell.",
    ]),
    find_h2="Contacts",
    map_title="Moychay Phuket on Google Maps",
    find_addr_l="Address", find_hours_l="Hours", find_park_l="Parking", find_msg_l="Write to us",
    find_msgs=f'<a href="{wa("Hi! I found you on teaphuket.com")}" target="_blank" rel="noopener" data-track="whatsapp" data-place="find">WhatsApp</a> · <a href="https://www.instagram.com/moychay.phuket" target="_blank" rel="noopener" data-track="instagram" data-place="find">Instagram</a>',
    ev_more="Show all events", 
    find_park="On site at Boat Avenue",
    faq_h2="Common questions",
    faq_items=faq([
        ("Do I need to book ahead?", "Not for a walk-in tasting – just come by. The gong fu cha ceremony and group events need booking, since space is limited."),
        ("Do I need to know anything about tea?", "No. Most guests are trying a tea ceremony for the first time."),
        ("Can I really buy the antiques on the shelves?", "Yes – it's a real collection for sale, not decoration."),
        ("Is there parking?", "Yes, on site at Boat Avenue."),
        ("Do you deliver outside Phuket?", "Yes – anywhere in Thailand, and we ship abroad too. Order in our online shop or message us."),
        ("Do you have anything besides tea?", "Yes – non-alcoholic matcha drinks and kombucha, to stay or to go."),
    ]),
    footer_icons=footer([
        ("Google Maps", MAPS, "directions", "i-gm"),
        ("WhatsApp", WA, "whatsapp", "i-wa"),
        ("Instagram", "https://www.instagram.com/moychay.phuket", "instagram", "i-ig"),
        ("Facebook", "https://www.facebook.com/moychay.phuket/", "facebook", "i-fb"),
    ]),
    shop_link="Online tea shop",
    credit="Website development and marketing",
    js=dict(lang="en", evEmpty="New dates are announced every week on Instagram.", evMore="Details", evAll="Show all events"),
)

# ── RU ───────────────────────────────────────────────────────────
RU = dict(
    COMMON,
    lang="ru", root="../", root_href="../", lang_label="Язык",
    font_preload_files=["inter-cyrillic.woff2", "geologica-cyrillic.woff2"],
    canonical="https://teaphuket.com/ru/", og_locale="ru_RU", map_lang="ru",
    cur_en="", cur_ru='aria-current="page"',
    meta_title="Чайная на Пхукете, чайные церемонии, матча – Moychay Phuket",
    meta_desc="Чайная Moychay Phuket на Пхукете. Пуэр, улун, матча, габа, зелёный, белый и красный китайский чай. Чайные церемонии, дегустации и покупка чая.",
    nav_label="Разделы", nav_1="Церемонии", nav_2="Наш чай", nav_3="Мероприятия", nav_4="Контакты", nav_shop="Магазин",
    msg_url=TG, msg_book_url=TG, msg_order_url=TG,
    msg_event="telegram", msg_icon="i-tg",
    sticky_msg_url="https://t.me/moychayphuket", sticky_msg_label="Telegram",
    hero_alt="Круглый чайный стол у арочного окна в Moychay Phuket",
    hero_sub="Чайная и чайные церемонии на Пхукете",
    addr_short="2 этаж, Boat Avenue, Бангтао",
    addr_full="2 этаж, Boat Avenue, Бангтао, Пхукет",
    hours="Ежедневно 11:00–22:00",
    cta_directions="Проложить маршрут",
    cta_message="Написать в Telegram",
    why_h2="Тихое место в Бангтао",
    why_body=paras([
        "Разбираться в чае не обязательно. К нам приходят на церемонию, поработать за матча-латте или просто посидеть в тишине подальше от пляжа.",
        "Бетонные стены, каллиграфия, ротанговое кресло-павлин и полки с чайниками – большинство из них можно купить. Чайный мастер поможет выбрать.",
    ]),
    facts_label="О чайной",
    facts=facts([
        "Больше 200 сортов чая",
        "Антикварная посуда – её можно купить",
        "Настольные игры и уголок для чтения (Библиотека Пхукет)",
        "Говорим на тайском, английском и русском",
    ]),
    gallery_label="Чайная изнутри",
    alt_1shop="Круглый чайный стол у арочного окна, за ним полки с посудой",
    alt_6shop="Ротанговое кресло-павлин и свитки с каллиграфией на бетонной стене",
    alt_3shop="Полки с глиняными чайниками и фарфоровыми чашками",
    alt_8shop="Чайный стол и деревянные стулья у арочного окна",
    alt_5shop="Зал с бетонными стенами и деревянными столами",
    alt_4shop="Круглый чайный стол с посудой и книгами",
    alt_2shop="Блины пуэра на тёмных полках",
    alt_7shop="Вход в Moychay Phuket на Boat Avenue",
    alt_8people="Гости на чайной церемонии за круглым столом",
    alt_1people="Гость с чашкой чая под бумажным фонарём",
    ways_h2="Чайные церемонии",
    ways_items=menu([
        dict(name="Дегустация без записи (Пин Ча)", price="300 ฿ <small>+ чай по весу</small>",
             meta="10 минут с чайным мастером · Без записи",
             text="Короткое знакомство с чаем, потом остаётесь с выбранным сортом."),
        dict(name="Церемония гунфу ча", price="600 ฿ <small>с человека</small>",
             meta="60 минут + до 60 минут отдыха · Нужна запись",
             text="Этапы заваривания, посуда и сам чай – вместе с чайным мастером."),
        dict(name="Групповые церемонии", price="Цена по запросу",
             meta="До 30 гостей · У нас или на вашей площадке",
             text="Дни рождения, командные встречи и праздники."),
        dict(name="Коктейли на матче и комбуча", price="от 250 ฿",
             meta="Здесь или с собой",
             text="Безалкогольные матча-латте и тоники, комбуча на разлив."),
    ]),
    ways_note="Не знаете, с чего начать? Спросите чайного мастера – подберёт что-то от лёгкого зелёного до выдержанного пуэра.",
    cta_book="Записаться в Telegram",
    tea_h2="Наш чай",
    tea_intro="Заранее разбираться не нужно. Покажите на банку – и чайный мастер заварит.",
    tea_items=tea([
        ("Белый чай", "Лёгкий и деликатный, с нотами мёда и сухих цветов."),
        ("Зелёный чай", "Свежий и травянистый, иногда с бульонными нотами, всегда яркий."),
        ("Светлые улуны", "Мягкие, цветочные и сладкие – что-то между зелёным и чёрным чаем."),
        ("Тёмные улуны", "Обжаренные и насыщенные, с нотами тёмного шоколада и жареных орехов."),
        ("Красный чай (на Западе его называют «чёрным»)", "Согревающий и мягкий, с сухофруктами и мягкими специями."),
        ("Молодой сырой пуэр (шэн)", "Свежий, яркий, немного травянистый – бодрит и оставляет чистое послевкусие."),
        ("Выдержанный сырой пуэр (шэн)", "Тот же чай после 10+ лет выдержки – глубокий и сложный."),
        ("Шу пуэр и тёмные чаи", "Землистые и плотные – хорошо идут после сытной еды."),
        ("Лао ча (выдержанный чай)", "Годы бережного хранения убирают горечь и дают мягкий, многослойный вкус."),
        ("Травяной чай", "Без кофеина: травы, цветы и фрукты – успокаивают или бодрят, на ваш выбор."),
    ]),
    shop_h2="Любимый чай – с доставкой",
    shop_text="Выбирайте китайский чай, посуду и аксессуары в нашем интернет-магазине. Бесплатная доставка по Таиланду при заказе от 2 000 ฿. Отправляем заказы по всему миру.",
    shop_cta="Перейти в магазин",
    deliv_cta="Заказать в Telegram",
    ev_h2="Ближайшие мероприятия",
    ev_intro="Каждую неделю – дегустации, церемонии и вечера в чайной. Приходить может любой, опыт не нужен.",
    ev_cta="Анонсы в Instagram",
    ev_extra=f'        <a class="tlink" href="{TG}" target="_blank" rel="noopener" data-track="telegram" data-place="events"><svg class="bi" aria-hidden="true"><use href="#i-tg"/></svg>Чайный клуб в Telegram</a>',
    about_h2="На Boat Avenue с 2024 года",
    about_body=paras([
        "Moychay Phuket – часть Moychay, международного чайного сообщества с чайными домами по всему миру. Чай приходит от поставщиков, с которыми работают годами.",
        "Сама чайная небольшая: местные, экспаты и путешественники садятся за один стол, а чайный мастер рядом, чтобы рассказать о чае, а не продать.",
    ]),
    find_h2="Контакты",
    map_title="Moychay Phuket на Google Картах",
    find_addr_l="Адрес", find_hours_l="Часы работы", find_park_l="Парковка", find_msg_l="Написать",
    find_msgs=f'<a href="{TG}" target="_blank" rel="noopener" data-track="telegram" data-place="find">Telegram</a> · <a href="{WA}" target="_blank" rel="noopener" data-track="whatsapp" data-place="find">WhatsApp</a> · <a href="https://www.instagram.com/moychay.phuket" target="_blank" rel="noopener" data-track="instagram" data-place="find">Instagram</a>',
    ev_more="Показать все мероприятия", 
    find_park="На месте, на Boat Avenue",
    faq_h2="Частые вопросы",
    faq_items=faq([
        ("Нужно ли записываться заранее?", "На дегустацию – нет, просто приходите. Для церемонии гунфу ча и групповых мероприятий нужна запись: мест немного."),
        ("Нужно ли разбираться в чае?", "Нет. Большинство гостей пробуют чайную церемонию впервые."),
        ("Можно ли купить антиквариат с полок?", "Да, это настоящая коллекция, её можно купить."),
        ("Есть ли парковка?", "Да, на месте, на Boat Avenue."),
        ("Доставляете за пределы Пхукета?", "Да – по всему Таиланду и за рубеж. Заказать можно в интернет-магазине или написать нам."),
        ("Есть что-то кроме чая?", "Да – безалкогольные напитки на матче и комбуча, можно остаться или взять с собой."),
    ]),
    footer_icons=footer([
        ("Google Maps", MAPS, "directions", "i-gm"),
        ("Яндекс Карты", "https://yandex.ru/maps/-/CXQU482P", "directions", "i-ya"),
        ("WhatsApp", WA, "whatsapp", "i-wa"),
        ("Чайный клуб в Telegram", TG, "telegram", "i-tg"),
        ("Instagram", "https://www.instagram.com/moychay.phuket", "instagram", "i-ig"),
        ("Facebook", "https://www.facebook.com/moychay.phuket/", "facebook", "i-fb"),
    ]),
    shop_link="Интернет-магазин чая",
    credit="Разработка сайта и маркетинг",
    js=dict(lang="ru", evEmpty="Анонсы появляются каждую неделю – в Telegram-клубе и Instagram.", evMore="Подробнее", evAll="Показать все мероприятия"),
)


def build(data, out):
    html = open(os.path.join(HERE, "template.html"), encoding="utf-8").read()
    values = {**CONFIG, **data, "year": str(datetime.date.today().year)}
    values["font_faces"], values["font_preload"] = fonts(data["font_families"], data["font_preload_files"], data["root"])
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


def sitemap():
    today = datetime.date.today().isoformat()
    alt = ('    <xhtml:link rel="alternate" hreflang="en" href="https://teaphuket.com/"/>\n'
           '    <xhtml:link rel="alternate" hreflang="ru" href="https://teaphuket.com/ru/"/>\n')
    urls = "".join(f"  <url>\n    <loc>{u}</loc>\n    <lastmod>{today}</lastmod>\n{alt}  </url>\n"
                   for u in ("https://teaphuket.com/", "https://teaphuket.com/ru/"))
    xml = ('<?xml version="1.0" encoding="UTF-8"?>\n'
           '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n'
           + urls + "</urlset>\n")
    open(os.path.join(ROOT, "sitemap.xml"), "w", encoding="utf-8").write(xml)
    print("built sitemap.xml")


build(EN, "index.html")
build(RU, "ru/index.html")
sitemap()
