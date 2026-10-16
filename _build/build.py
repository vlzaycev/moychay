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
import re

import shutil

import blog as B
import pages as PG
from pages import BUILDERS, PAGES, SLUGS
from urllib.parse import quote

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

# ── Analytics & data ─────────────────────────────────────────────
CONFIG = {
    "cfg_gtm": "GTM-WJQBWNL9",  # Google Tag Manager container (GA4, Ads, Pixel etc. are configured inside GTM)
    "cfg_gsc": "deblMaE7xgGLp7axGkXzbo1mVhtVkWtaBX_rFTN8G8g",  # Google Search Console verification
    "cfg_ga4": "G-1MD6RQFX5R",  # Google Analytics 4 (loaded directly; do not add GA4 again inside GTM)
    "cfg_ads": "",              # "AW-XXXXXXXXX"
    "cfg_ads_directions": "",   # conversion label for "Get directions"
    "cfg_ads_message": "",      # conversion label for WhatsApp / Telegram
    "cfg_ym": "",               # Yandex Metrika counter ID
    "cfg_pixel": "2041380899914040",  # Meta Pixel ID (loaded in window.SITE below; skipped for automated browsers)
    "cfg_fb_verify": "2xbz3ulgnxnpw9oo6wmnhndoz5n8xl",  # Meta Business domain verification
    "cfg_sheet": "1zcA3xGzhUeQvWD2pFi1obgOf8mC2gi32D0l_q4tw_es",  # events Google Sheet
    # Contact & wholesale forms: URL of the server handler (_server/contact-worker), e.g. "/api/contact".
    # Empty = forms are shown disabled with a note to use WhatsApp/Telegram (nothing is sent anywhere).
    "cfg_form_endpoint": "",
    # Cloudflare Turnstile site key (public, safe to commit). The secret key lives only in the Worker.
    # The forms go live only when both cfg_form_endpoint and this key are set.
    "cfg_turnstile_sitekey": "",
}

MAPS = "https://maps.app.goo.gl/uuZkb3YwtNMGQhy18"
WA = "https://wa.me/66817959110"
TG = "https://t.me/moychay_phuket"          # chat: write to the tea house (bookings, orders)
TG_CLUB = "https://t.me/moychayphuket"     # channel «За чашкой чая»: tea club announcements
PHONE = "+66817959110"                     # calls and official enquiries
PHONE_TXT = "+66 81 795 9110"
EMAIL = "info@phuket.moychay.asia"



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


def clink(href, label, icon, track, place, ext=True, stroke=False):
    """One contact link with its icon (no separators between links)."""
    attrs = ' target="_blank" rel="noopener"' if ext else ""
    return (f'<li><a href="{href}"{attrs} data-track="{track}" data-place="{place}">'
            f'<svg class="{"ico" if stroke else "bi"}" aria-hidden="true"><use href="#{icon}"/></svg>{label}</a></li>')


def clinks(*items):
    return '<ul class="clinks">' + "".join(items) + "</ul>"


def spans(s):
    """'A · B' in the data → one readable phrase: 'A, b' (no middle dots on the page)."""
    parts = s.split(" · ")
    return ", ".join([parts[0]] + [p[:1].lower() + p[1:] for p in parts[1:]])


def NUMS(items):
    return "".join(f"<li><b>{a}</b><span>{b}</span></li>" for a, b in items)


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
          <p class="menu-m">{spans(m["meta"])}</p>
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


# Tea categories: home page catalogue and /tea/
TEA_EN = [
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
    ]

TEA_RU = [
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
    ]


COMMON = dict(maps=MAPS, phone=PHONE, phone_txt=PHONE_TXT, email=EMAIL,
              find_call=clinks(clink(f"tel:{PHONE}", PHONE_TXT, "i-phone", "phone_call", "find", ext=False, stroke=True),
                               clink(f"mailto:{EMAIL}", EMAIL, "i-mail", "email_click", "find", ext=False, stroke=True)), head_font="Geologica", font_families=["Geologica", "Inter"])

# ── EN ───────────────────────────────────────────────────────────
EN = dict(
    COMMON,
    lang="en", root="", root_href="./", lang_label="Language",
    font_preload_files=["inter-latin.woff2", "geologica-latin.woff2"],
    canonical="https://teaphuket.com/", og_locale="en_US", map_lang="en",
    cur_en='aria-current="page"', cur_ru="",
    meta_title="Moychay Phuket – Tea House &amp; Tea Ceremonies in Bangtao",
    meta_desc="Moychay Phuket – tea house on Boat Avenue, Bangtao. Chinese tea ceremonies, tastings, 200+ teas, matcha drinks and weekly tea events. Open daily 11:00-22:00.",
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
    hours="Open daily 11:00-22:00",
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
        dict(name="Walk-in tasting (Pin Cha)", price="300฿ <small>+ tea by weight</small>",
             meta="10 min with the tea master · No booking",
             text="A short introduction, then you stay with the tea you picked."),
        dict(name="Gong fu cha ceremony", price="600฿ <small>per person</small>",
             meta="60 min + up to 60 min to relax · Booking required",
             text="Brewing steps, teaware and the tea itself, guided by the tea master."),
        dict(name="Group ceremonies", price="Price on request",
             meta="Up to 30 guests · At the tea house or your venue",
             text="Birthdays, team events and gatherings."),
    ]),
    ways_extra='Also on the menu: non-alcoholic matcha lattes and tonics and kombucha on tap, from 250฿, to stay or to go. <a href="{{lp}}matcha/">More about matcha</a>',
    ways_note="Not sure where to start? Ask the tea master – from a light green tea to an aged pu-erh.",
    cta_book="Book a ceremony on WhatsApp",
    tea_h2="Our teas",
    tea_intro="No need to know any of this before you come. Point at a jar, and the tea master will brew it for you.",
    tea_items=tea(TEA_EN), tea_list=TEA_EN,
    shop_h2="Your favorite tea, delivered",
    shop_text="Explore our selection of tea and teaware. Free delivery across Thailand on online orders over 2000฿, worldwide shipping with DHL – and a discount with the promo code MOYCHAY.",
    shop_cta="Visit online shop",
    deliv_cta="Order on WhatsApp",
    ev_h2="Upcoming events",
    ev_intro="Tastings, ceremonies and evenings at the tea house every week. Open to everyone, no tea background needed.",
    ev_cta="Events on Instagram",
    ev_extra="",
    about_h2="On Boat Avenue since 2024",
    hero_brand="Part of Moychay, an international tea culture company",
    nums_label="Moychay in numbers",
    about_nums=NUMS([("2009", "Moychay founded in Amsterdam"), ("700+", "suppliers, tea farmers and workshops"), ("5", "tea clubs, from Barcelona to Phuket")]),
    about_body=paras([
        "Moychay Phuket is part of Moychay – an international tea culture company founded in 2009 and based in Amsterdam, with tea clubs in Barcelona, Yerevan, Tbilisi, Phuket and Atlanta. Moychay works directly with more than 700 suppliers, tea farmers and artisan workshops in China, Japan, Vietnam, Thailand and Georgia, and sells only natural loose-leaf tea – no artificially flavoured teas.",
        "The room is small: locals and travellers share one table, and the tea master is here to explain, not to upsell.",
    ]),
    find_h2="Contacts",
    map_title="Moychay Phuket on Google Maps",
    find_addr_l="Address", find_hours_l="Hours", find_park_l="Parking", find_msg_l="Write to us", find_call_l="Call or email",
    find_msgs=clinks(clink(wa("Hi! I found you on teaphuket.com"), "WhatsApp", "i-wa", "whatsapp", "find"),
                     clink("https://www.instagram.com/moychay.phuket", "Instagram", "i-ig", "instagram", "find")),
    ev_more="All events", 
    find_park="On site at Boat Avenue",
    faq_h2="Common questions",
    faq_items=faq([
        ("Do I need to book ahead?", "Not for a walk-in tasting – just come by. The gong fu cha ceremony and group events need booking, since space is limited."),
        ("Do I need to know anything about tea?", "No. Most guests are trying a tea ceremony for the first time."),
        ("Can I really buy the antiques on the shelves?", "Yes – it's a real collection for sale, not decoration."),
        ("Is there parking?", "Yes, on site at Boat Avenue."),
        ("Do you deliver outside Phuket?", "Yes. Online orders over 2000฿ are delivered free anywhere in Thailand, and we ship worldwide with DHL. Order in our online shop – the promo code MOYCHAY gives a discount – or message us."),
        ("Do you have anything besides tea?", "Yes – non-alcoholic matcha drinks and kombucha, to stay or to go."),
    ]),
    footer_icons=footer([
        ("Google Maps", MAPS, "directions", "i-gm"),
        ("WhatsApp", WA, "whatsapp", "i-wa"),
        ("Instagram", "https://www.instagram.com/moychay.phuket", "instagram", "i-ig"),
        ("Facebook", "https://www.facebook.com/moychay.phuket/", "facebook", "i-fb"),
    ]),
    ftr_about="Tea house and tea ceremonies in Bangtao, Phuket. Part of Moychay, an international tea culture company.",
    ftr_h_explore="Explore", ftr_h_partners="Partnerships", ftr_h_visit="Visit us",
    ftr_ceremonies="Tea ceremonies", ftr_tea="Chinese tea", ftr_matcha="Matcha", ftr_events="Events", ftr_contact="Contact",
    ftr_wholesale="Wholesale &amp; partnerships", ftr_shop="Online shop",
    more_cer="All ceremony formats", more_tea="More about our teas", more_contact="Contact page and form",
    crumbs_label="Breadcrumbs", home_name="Home",
    form=dict(name="Name", company="Company / Business name", btype="Business type", btype_none="Choose…",
              btypes=[("restaurant", "Restaurant or café"), ("hotel", "Hotel or resort"), ("spa", "Spa or wellness"),
                      ("fitness", "Fitness or yoga studio"), ("real_estate", "Real estate"), ("other", "Other")], email="Email", contact="WhatsApp number",
              contact_hint="International format, e.g. +66 81 234 5678", message="Message",
              message_wh="Tell us about your venue and what tea you need", optional="(optional)",
              hp="Leave this field empty", submit="Send message",
              note="* Required fields. We use your contact details only to reply to your message.",
              offline=f'The online form is being connected and will work soon. For now the quickest way to reach us is <a href="{WA}" target="_blank" rel="noopener" data-track="whatsapp" data-place="form_offline">WhatsApp</a>.'),
    credit_by="Website & marketing by", credit_label="Website & marketing by vlad.marketing (opens in a new tab)",
    js=dict(lang="en", evEmpty="New dates are announced every week on Instagram.", evMore="Details", evFree="Free", evAll="Show all events",
            form=dict(required="Please fill in this field.", email="Please enter a valid email, e.g. name@example.com.",
                      phone="Please enter the number in international format, e.g. +66 81 234 5678.",
                      tg="Telegram username: 5–32 Latin letters, digits or _.", short="Please write a little more.",
                      fix="Please check the highlighted fields.", sending="Sending…",
                      ok="Thank you! Your message has been delivered – we'll reply by email soon.",
                      fail="Sorry, the message could not be sent. Please try again or message us on WhatsApp.",
                      too_long="This is too long – please shorten it.", links="Please include no more than 3 links.",
                      invalid="Please check this field.", captcha="Please wait for the security check to finish and try again.",
                      rate="Too many messages in a short time. Please try again later or message us on WhatsApp.")),
)

# ── RU ───────────────────────────────────────────────────────────
RU = dict(
    COMMON,
    lang="ru", root="../", root_href="../", lang_label="Язык",
    font_preload_files=["inter-cyrillic.woff2", "geologica-cyrillic.woff2"],
    canonical="https://teaphuket.com/ru/", og_locale="ru_RU", map_lang="ru",
    cur_en="", cur_ru='aria-current="page"',
    meta_title="Moychay Phuket – Чайная и чайные церемонии на Пхукете",
    meta_desc="Moychay Phuket (Мойчай) – чайная на Boat Avenue в Бангтао, Пхукет. Китайские чайные церемонии, дегустации, 200+ сортов чая, матча и мероприятия. Ежедневно 11:00-22:00.",
    nav_label="Разделы", nav_1="Церемонии", nav_2="Наш чай", nav_3="Мероприятия", nav_4="Контакты", nav_shop="Магазин",
    msg_url=TG, msg_book_url=TG, msg_order_url=TG,
    msg_event="telegram", msg_icon="i-tg",
    sticky_msg_url=TG, sticky_msg_label="Telegram",
    hero_alt="Круглый чайный стол у арочного окна в Moychay Phuket",
    hero_sub="Чайная и чайные церемонии на Пхукете",
    addr_short="2 этаж, Boat Avenue, Бангтао",
    addr_full="2 этаж, Boat Avenue, Бангтао, Пхукет",
    hours="Ежедневно 11:00-22:00",
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
        dict(name="Дегустация без записи (Пин Ча)", price="300฿ <small>+ чай по весу</small>",
             meta="10 минут с чайным мастером · Без записи",
             text="Короткое знакомство с чаем, потом остаётесь с выбранным сортом."),
        dict(name="Церемония гунфу ча", price="600฿ <small>с человека</small>",
             meta="60 минут + до 60 минут отдыха · Нужна запись",
             text="Этапы заваривания, посуда и сам чай – вместе с чайным мастером."),
        dict(name="Групповые церемонии", price="Цена по запросу",
             meta="До 30 гостей · У нас или на вашей площадке",
             text="Дни рождения, командные встречи и праздники."),
    ]),
    ways_extra='Ещё в меню: безалкогольные матча-латте и тоники, комбуча на разлив – от 250฿, здесь или с собой. <a href="{{lp}}matcha/">Подробнее о матче</a>',
    ways_note="Не знаете, с чего начать? Спросите чайного мастера – подберёт что-то от лёгкого зелёного до выдержанного пуэра.",
    cta_book="Записаться в Telegram",
    tea_h2="Наш чай",
    tea_intro="Заранее разбираться не нужно. Покажите на банку – и чайный мастер заварит.",
    tea_items=tea(TEA_RU), tea_list=TEA_RU,
    shop_h2="Любимый чай – с доставкой",
    shop_text="Выбирайте китайский чай, посуду и аксессуары в нашем интернет-магазине. Бесплатная доставка по Таиланду при онлайн-заказе от 2000฿, по всему миру отправляем через DHL, а по промокоду MOYCHAY – скидка.",
    shop_cta="Перейти в магазин",
    deliv_cta="Заказать в Telegram",
    ev_h2="Ближайшие мероприятия",
    ev_intro="Каждую неделю – дегустации, церемонии и вечера в чайной. Приходить может любой, опыт не нужен.",
    ev_cta="Анонсы в Instagram",
    ev_extra=f'        <a class="tlink" href="{TG_CLUB}" target="_blank" rel="noopener" data-track="telegram_club" data-place="events"><svg class="bi" aria-hidden="true"><use href="#i-tg"/></svg>Чайный клуб в Telegram</a>',
    about_h2="На Boat Avenue с 2024 года",
    hero_brand="Часть Moychay – международной компании чайной культуры",
    nums_label="Moychay в цифрах",
    about_nums=NUMS([("2009", "год основания Moychay в Амстердаме"), ("700+", "поставщиков, чайных фермеров и мастерских"), ("5", "чайных клубов – от Барселоны до Пхукета")]),
    about_body=paras([
        "Moychay Phuket – часть Moychay, международной компании чайной культуры. Она основана в 2009 году, штаб-квартира – в Амстердаме, чайные клубы – в Барселоне, Ереване, Тбилиси, на Пхукете и в Атланте. Moychay работает напрямую с более чем 700 поставщиками, чайными фермерами и мастерскими в Китае, Японии, Вьетнаме, Таиланде и Грузии и продаёт только натуральный листовой чай – без ароматизаторов.",
        "Сама чайная небольшая: местные, экспаты и путешественники садятся за один стол, а чайный мастер рядом, чтобы рассказать о чае, а не продать.",
    ]),
    find_h2="Контакты",
    map_title="Moychay Phuket на Google Картах",
    find_addr_l="Адрес", find_hours_l="Часы работы", find_park_l="Парковка", find_msg_l="Написать", find_call_l="Телефон и email",
    find_msgs=clinks(clink(TG, "Telegram", "i-tg", "telegram", "find"), clink(WA, "WhatsApp", "i-wa", "whatsapp", "find"),
                     clink("https://www.instagram.com/moychay.phuket", "Instagram", "i-ig", "instagram", "find")),
    ev_more="Все мероприятия", 
    find_park="На месте, на Boat Avenue",
    faq_h2="Частые вопросы",
    faq_items=faq([
        ("Нужно ли записываться заранее?", "На дегустацию – нет, просто приходите. Для церемонии гунфу ча и групповых мероприятий нужна запись: мест немного."),
        ("Нужно ли разбираться в чае?", "Нет. Большинство гостей пробуют чайную церемонию впервые."),
        ("Можно ли купить антиквариат с полок?", "Да, это настоящая коллекция, её можно купить."),
        ("Есть ли парковка?", "Да, на месте, на Boat Avenue."),
        ("Доставляете за пределы Пхукета?", "Да. Онлайн-заказы от 2000฿ доставляем по Таиланду бесплатно, по всему миру отправляем через DHL. Заказать можно в интернет-магазине – по промокоду MOYCHAY скидка – или написать нам."),
        ("Есть что-то кроме чая?", "Да – безалкогольные напитки на матче и комбуча, можно остаться или взять с собой."),
    ]),
    footer_icons=footer([
        ("Google Maps", MAPS, "directions", "i-gm"),
        ("Яндекс Карты", "https://yandex.ru/maps/-/CXQU482P", "directions", "i-ya"),
        ("WhatsApp", WA, "whatsapp", "i-wa"),
        ("Чайный клуб в Telegram", TG_CLUB, "telegram_club", "i-tg"),
        ("Instagram", "https://www.instagram.com/moychay.phuket", "instagram", "i-ig"),
        ("Facebook", "https://www.facebook.com/moychay.phuket/", "facebook", "i-fb"),
    ]),
    ftr_about="Чайная и чайные церемонии в Бангтао, Пхукет. Часть Moychay, международной компании чайной культуры.",
    ftr_h_explore="Разделы", ftr_h_partners="Сотрудничество", ftr_h_visit="Как нас найти",
    ftr_ceremonies="Чайные церемонии", ftr_tea="Китайский чай", ftr_matcha="Матча", ftr_events="Мероприятия", ftr_contact="Контакты",
    ftr_wholesale="Оптовые поставки", ftr_shop="Интернет-магазин",
    more_cer="Все форматы церемоний", more_tea="Подробнее о нашем чае", more_contact="Страница контактов и форма",
    crumbs_label="Навигационная цепочка", home_name="Главная",
    form=dict(name="Имя", company="Название компании", btype="Тип бизнеса", btype_none="Выберите…",
              btypes=[("restaurant", "Ресторан или кафе"), ("hotel", "Отель или курорт"), ("spa", "SPA или wellness"),
                      ("fitness", "Фитнес или йога-студия"), ("real_estate", "Недвижимость"), ("other", "Другое")], email="Email", contact="Telegram username",
              contact_hint="Например, moychay_phuket – символ @ не обязателен", message="Сообщение",
              message_wh="Расскажите о заведении и о том, какой чай вам нужен", optional="(необязательно)",
              hp="Оставьте это поле пустым", submit="Отправить сообщение",
              note="* Обязательные поля. Контактные данные используем только для ответа на ваше обращение.",
              offline=f'Онлайн-форма подключается и скоро заработает. Пока быстрее всего написать нам в <a href="{TG}" target="_blank" rel="noopener" data-track="telegram" data-place="form_offline">Telegram</a> или <a href="{WA}" target="_blank" rel="noopener" data-track="whatsapp" data-place="form_offline">WhatsApp</a>.'),
    credit_by="Сайт и маркетинг –", credit_label="Сайт и маркетинг – vlad.marketing (откроется в новой вкладке)",
    js=dict(lang="ru", evEmpty="Анонсы появляются каждую неделю – в Telegram-клубе и Instagram.", evMore="Подробнее", evFree="Бесплатно", evAll="Показать все мероприятия",
            form=dict(required="Заполните это поле.", email="Укажите корректный email, например name@example.com.",
                      phone="Укажите номер в международном формате, например +66 81 234 5678.",
                      tg="Telegram username: 5–32 латинские буквы, цифры или _.", short="Напишите чуть подробнее.",
                      fix="Проверьте отмеченные поля.", sending="Отправляем…",
                      ok="Спасибо! Сообщение доставлено – скоро ответим на email.",
                      fail="Не получилось отправить сообщение. Попробуйте ещё раз или напишите нам в Telegram.",
                      too_long="Слишком длинно – сократите, пожалуйста.", links="Пожалуйста, не больше 3 ссылок.",
                      invalid="Проверьте это поле.", captcha="Дождитесь окончания проверки безопасности и попробуйте ещё раз.",
                      rate="Слишком много сообщений за короткое время. Попробуйте позже или напишите нам в Telegram.")),
)


SITE_URL = "https://teaphuket.com"


def url(lang, slug=""):
    return f"{SITE_URL}/{'ru/' if lang == 'ru' else ''}{slug + '/' if slug else ''}"


def business(data):
    """LocalBusiness: the tea house itself (home and contact pages)."""
    return {
        "@type": ["CafeOrCoffeeShop", "Store"], "@id": f"{SITE_URL}/#teahouse",
        "name": "Moychay Phuket", "alternateName": ["Tea House Moychay Phuket", "Мойчай Пхукет"],
        "description": data["meta_desc"], "url": url(data["lang"]), "inLanguage": data["lang"],
        "image": [f"{SITE_URL}/img/og.jpg", f"{SITE_URL}/img/interior/1_shop-1400.webp"],
        "logo": f"{SITE_URL}/img/logo.png", "telephone": PHONE, "email": EMAIL,
        "parentOrganization": {"@type": "Organization", "name": "Moychay", "url": "https://moychay.nl/", "foundingDate": "2009"},
        "servesCuisine": ["Tea", "Chinese tea", "Matcha"], "priceRange": "฿฿", "currenciesAccepted": "THB",
        "acceptsReservations": True,
        "address": {"@type": "PostalAddress", "streetAddress": "Boat Avenue, 2nd floor",
                    "addressLocality": "Bang Tao, Choeng Thale", "addressRegion": "Phuket",
                    "postalCode": "83110", "addressCountry": "TH"},
        "geo": {"@type": "GeoCoordinates", "latitude": 7.9930212, "longitude": 98.3050328},
        "hasMap": [MAPS, "https://yandex.ru/maps/-/CXQU482P"],
        "openingHours": "Mo-Su 11:00-22:00",
        "openingHoursSpecification": [{"@type": "OpeningHoursSpecification",
            "dayOfWeek": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
            "opens": "11:00", "closes": "22:00"}],
        "amenityFeature": [{"@type": "LocationFeatureSpecification", "name": "Parking", "value": True},
                           {"@type": "LocationFeatureSpecification", "name": "Board games", "value": True}],
        "sameAs": ["https://www.instagram.com/moychay.phuket", "https://www.facebook.com/moychay.phuket/",
                   TG, TG_CLUB, "https://phuket.moychay.asia/"],
    }


def jsonld(graph):
    return ('<script type="application/ld+json">\n'
            + json.dumps({"@context": "https://schema.org", "@graph": graph}, ensure_ascii=False, indent=1)
            + "\n</script>")


def home_page(data):
    lang = data["lang"]
    website = {"@type": "WebSite", "@id": f"{SITE_URL}/#website", "url": f"{SITE_URL}/", "name": "Moychay Phuket",
               "alternateName": ["Moychay Phuket tea house", "Мойчай Пхукет"], "inLanguage": ["en", "ru"]}
    return {**data,
            "main": open(os.path.join(HERE, "pages", "home.html"), encoding="utf-8").read(),
            "canonical": url(lang), "url_en": url("en"), "url_ru": url("ru"),
            "home_href": "#home", "nb": "", "lp": "/ru/" if lang == "ru" else "/",
            "href_en": data["root_href"] if lang == "en" else "../", "href_ru": "ru/" if lang == "en" else "./",
            "head_extra": (f'<link rel="preload" as="image" href="{data["root"]}img/interior/1_shop-hero-m.webp" media="(max-width: 899px)">\n'
                           f'<link rel="preload" as="image" href="{data["root"]}img/interior/1_shop-hero-d.webp" media="(min-width: 900px)">'),
            "jsonld": jsonld([business(data), website])}


def inner_page(data, slug):
    lang = data["lang"]
    P = PAGES[slug][lang]
    lp = "/ru/" if lang == "ru" else "/"
    d = {**data, "root": "../../" if lang == "ru" else "../", "lp": lp, "nb": lp, "home_href": lp,
         "meta_title": P["title"], "meta_desc": P["desc"],
         "canonical": url(lang, slug), "url_en": url("en", slug), "url_ru": url("ru", slug),
         "href_en": f"/{slug}/", "href_ru": f"/ru/{slug}/", "head_extra": ""}
    crumbs = {"@type": "BreadcrumbList", "itemListElement": [
        {"@type": "ListItem", "position": 1, "name": "Moychay Phuket", "item": url(lang)},
        {"@type": "ListItem", "position": 2, "name": P["crumb"], "item": url(lang, slug)}]}
    graph = [crumbs] + ([business(d)] if slug == "contact" else [])
    if slug == "wholesale":   # what we offer, without invented prices or offers
        graph.append({"@type": "Service", "name": re.sub("<[^>]+>", "", P["h1"]).replace("&amp;", "&"),
                      "description": P["desc"], "url": url(lang, slug), "areaServed": {"@type": "AdministrativeArea", "name": "Phuket"},
                      "audience": {"@type": "BusinessAudience", "audienceType": ", ".join(n.replace("&amp;", "&") for n, _ in P["segments"])},
                      "serviceType": [o[1].replace("&amp;", "&") for o in P["offers"]],
                      "provider": {"@type": "Organization", "@id": f"{SITE_URL}/#teahouse", "name": "Moychay Phuket", "url": f"{SITE_URL}/"}})
    d["jsonld"] = jsonld(graph)
    d["main"] = BUILDERS[slug](d, P, CONFIG)
    # preload the hero photo (LCP) with the same srcset/sizes as the <img>
    m = re.search(r'class="ph phero-ph"><img src="([^"]+)" srcset="([^"]+)" sizes="([^"]+)"', d["main"])
    if m:
        d["head_extra"] = f'<link rel="preload" as="image" href="{m[1]}" imagesrcset="{m[2]}" imagesizes="{m[3]}" fetchpriority="high">'
    return d


def hreflang(en, ru):
    """Alternate links only for language versions that really exist."""
    out = []
    if en:
        out.append(f'<link rel="alternate" hreflang="en" href="{en}">')
    if ru:
        out.append(f'<link rel="alternate" hreflang="ru" href="{ru}">')
    if en or ru:
        out.append(f'<link rel="alternate" hreflang="x-default" href="{en or ru}">')
    return "\n".join(out)


def build(data, out):
    html = render(data, out)
    path = os.path.join(ROOT, out)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    open(path, "w", encoding="utf-8").write(html)
    print("built", out)


def render(data, out="404.html"):
    html = open(os.path.join(HERE, "template.html"), encoding="utf-8").read()
    values = {**CONFIG, **data, "year": str(datetime.date.today().year), "og_image": f"{SITE_URL}/img/og.jpg"}
    values["font_faces"], values["font_preload"] = fonts(data["font_families"], data["font_preload_files"], data["root"])
    values["js_i18n"] = json.dumps({**data["js"], "root": data["root"]}, ensure_ascii=False)
    px = CONFIG["cfg_pixel"]
    values["pixel_noscript"] = (f'<noscript><img height="1" width="1" style="display:none" alt="" '
                                f'src="https://www.facebook.com/tr?id={px}&amp;ev=PageView&amp;noscript=1"></noscript>' if px else "")
    if "hreflang" not in values:
        values["hreflang"] = hreflang(values.get("url_en"), values.get("url_ru"))
    values.setdefault("ftr_blog_link", footer_blog(data))
    html = html.replace("{{main}}", values.pop("main", ""))
    for _ in range(2):   # second pass: placeholders inside inserted values ({{lp}}, {{root}}…)
        for k, v in values.items():
            if isinstance(v, str):
                html = html.replace("{{" + k + "}}", v)
    left = [p for p in html.split("{{")[1:] if "}}" in p]
    if left:
        raise SystemExit(f"Unfilled placeholders in {out}: " + ", ".join(p.split("}}")[0] for p in left))
    return html


def sitemap():
    today = datetime.date.today().isoformat()
    urls = ""
    for slug in [""] + SLUGS:
        alt = "".join(f'    <xhtml:link rel="alternate" hreflang="{h}" href="{url(l, slug)}"/>\n'
                      for h, l in (("en", "en"), ("ru", "ru"), ("x-default", "en")))
        for lang in ("en", "ru"):
            urls += f"  <url>\n    <loc>{url(lang, slug)}</loc>\n    <lastmod>{today}</lastmod>\n{alt}  </url>\n"
    for p in PUBLISHED:                       # published articles only; drafts never reach the sitemap
        other = B.translation(PUBLISHED, p)
        alts = [(p["language"], B.url(p["language"], p["slug"]))] + ([(other["language"], B.url(other["language"], p["slug"]))] if other else [])
        alt = "".join(f'    <xhtml:link rel="alternate" hreflang="{l}" href="{u}"/>\n' for l, u in alts)
        urls += f'  <url>\n    <loc>{B.url(p["language"], p["slug"])}</loc>\n    <lastmod>{p.get("updated_at") or p["published_at"]}</lastmod>\n{alt}  </url>\n'
    for lang in ("en", "ru"):
        if any(p["language"] == lang for p in PUBLISHED):
            urls += f"  <url>\n    <loc>{B.url(lang)}</loc>\n    <lastmod>{today}</lastmod>\n  </url>\n"
    xml = ('<?xml version="1.0" encoding="UTF-8"?>\n'
           '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n'
           + urls + "</urlset>\n")
    open(os.path.join(ROOT, "sitemap.xml"), "w", encoding="utf-8").write(xml)
    print("built sitemap.xml")


# ── Tea Knowledge (blog) ─────────────────────────────────────────
BLOG_T = dict(
    en=dict(title="Tea Knowledge – Chinese Tea Guides | Moychay Phuket", crumb="Blog",
            h1="Tea Knowledge by Moychay Phuket",
            desc="Guides to Chinese tea from Moychay Phuket in Bangtao: tea ceremonies, pu-erh, brewing at home and choosing tea for cafés and restaurants.",
            lead="Unhurried guides to Chinese tea from our tea house on Boat Avenue: what to try, how to brew it and where tea fits into your day.",
            read="min read", published="Published", updated="Updated", by="By",
            next_h2="Where to go next", more_h2="More from Tea Knowledge", all="All articles", draft_label="Draft",
            draft="Draft – not published. This preview is visible only on your computer.",
            verify_h="To check with the tea master", photos_h="Photos needed",
            cats={"ceremony": "Tea ceremony", "guide": "Tea guide", "business": "For business"},
            related=dict(ceremonies="Tea ceremonies at Moychay Phuket", tea="Chinese tea at our tea house", matcha="Matcha at Moychay Phuket",
                         events="Upcoming tea events", contact="Address and directions", wholesale="Tea for your business",
                         home="Visit Moychay Phuket", shop="Online shop with delivery across Thailand")),
    ru=dict(title="Блог о чае – Moychay Phuket", crumb="Блог",
            h1="Блог о чае – Moychay Phuket",
            desc="Материалы о китайском чае от чайной Moychay Phuket в Бангтао: чайные церемонии, пуэр, заваривание дома и выбор чая для кафе и ресторанов.",
            lead="Неспешные материалы о китайском чае от нашей чайной на Boat Avenue: что попробовать, как заварить и как чай вписывается в жизнь.",
            read="мин чтения", published="Опубликовано", updated="Обновлено", by="Автор:",
            next_h2="Что дальше", more_h2="Ещё в блоге", all="Все статьи", draft_label="Черновик",
            draft="Черновик – не опубликован. Этот предпросмотр виден только на вашем компьютере.",
            verify_h="Проверить с чайным мастером", photos_h="Нужные фотографии",
            cats={"ceremony": "Чайная церемония", "guide": "О чае", "business": "Для бизнеса"},
            related=dict(ceremonies="Чайные церемонии в Moychay Phuket", tea="Китайский чай в нашей чайной", matcha="Матча в Moychay Phuket",
                         events="Ближайшие чайные мероприятия", contact="Адрес и маршрут", wholesale="Чай для вашего бизнеса",
                         home="Приходите в Moychay Phuket", shop="Интернет-магазин с доставкой по Таиланду")),
)
POSTS = B.load()
PUBLISHED = [p for p in POSTS if p["published"]]
PG.PUBLISHED = {(p["language"], p["slug"]): p["title"] for p in PUBLISHED}


def blog_meta(p, T):
    bits = [T["cats"].get(p["category"], p["category"]), f'{max(1, round(p["words"] / 200))} {T["read"]}']
    if p.get("published_at"):
        bits.append(f'{T["published"]} {B.fmt_date(p["published_at"], p["language"])}')
    if p.get("updated_at") and p.get("updated_at") != p.get("published_at"):
        bits.append(f'{T["updated"]} {B.fmt_date(p["updated_at"], p["language"])}')
    return ", ".join([bits[0]] + [b[:1].lower() + b[1:] for b in bits[1:]])


def blog_hero(lang, crumbs, h1, lead, meta, photo, alt):
    c = "".join(f'<li><a href="{u}">{n}</a></li>' for n, u in crumbs[:-1]) + f'<li aria-current="page">{crumbs[-1][0]}</li>'
    ph = PG.img(photo, alt, "(min-width:900px) 50vw, 100vw", "phero-ph", eager=True) if photo else ""
    m = f'<p class="art-meta">{meta}</p>' if meta else ""
    return f"""<section class="phero{'' if photo else ' phero-text'}" id="home">
  <div class="wrap">
    <div>
      <nav aria-label="{(EN if lang == 'en' else RU)['crumbs_label']}"><ol class="crumbs">{c}</ol></nav>
      <h1{' class="long"' if len(h1) > 40 else ''}>{h1}</h1>
      <p class="lead">{lead}</p>
      {m}
    </div>
    {ph}
  </div>
</section>"""


def blog_data(lang, out_depth, preview):
    data = EN if lang == "en" else RU
    d = {**data, "root": "../" * out_depth, "lp": B.lp(lang), "nb": B.lp(lang), "home_href": B.lp(lang)}
    d["head_extra"] = '<meta name="robots" content="noindex">' if preview else ""
    return d


def article_page(p, preview=False):
    lang, slug, T = p["language"], p["slug"], BLOG_T[p["language"]]
    pool = POSTS if preview else PUBLISHED
    other = B.translation(pool, p)
    depth = (3 if lang == "en" else 4) if preview else (3 if lang == "ru" else 2)
    d = blog_data(lang, depth, preview)
    blog_home = (f"/_preview{B.lp(lang)}blog/" if preview else f"{B.lp(lang)}blog/")
    crumbs = [("Moychay Phuket", B.lp(lang)), (T["crumb"], blog_home), (p["title"], "")]
    banner = ""
    if preview and not p["published"]:
        notes = "".join(f"<li>{html_escape(x)}</li>" for x in p.get("verify", []) or [])
        photos = "".join(f"<li>{html_escape(x)}</li>" for x in p.get("photos", []) or [])
        banner = (f'<aside class="draft"><p><strong>{T["draft"]}</strong></p>'
                  + (f'<p>{T["verify_h"]}:</p><ul>{notes}</ul>' if notes else "")
                  + (f'<p>{T["photos_h"]}:</p><ul>{photos}</ul>' if photos else "") + "</aside>")
    body = B.markdown(p["body"], {"slug": slug, "lang": lang})
    rel = []
    for k in p.get("related_pages", []) or []:
        if k == "shop":
            rel.append(f'<li><a class="tlink" href="{B.SHOP}" target="_blank" rel="noopener" data-track="online_shop_click" data-place="blog_next">{T["related"]["shop"]}{PG.ARROW}</a></li>')
        elif k in B.PAGES:
            rel.append(f'<li><a class="tlink" href="{B.lp(lang)}{B.PAGES[k]}" data-track="blog_cta_click" data-place="{slug}">{T["related"][k]}{PG.ARROW}</a></li>')
    more = [q for q in pool if q["language"] == lang and q["slug"] != slug][:3]
    more_html = "".join(f'<li><a href="{blog_home}{q["slug"]}/">{q["title"]}</a><span>{T["cats"].get(q["category"], q["category"])}</span></li>' for q in more)
    nxt = f"""<section class="sec sand" id="next">
  <div class="wrap split">
    <h2 class="rv">{T["next_h2"]}</h2>
    <div>
      <ul class="next-links">{"".join(rel)}</ul>
      {f'<h3 class="more-h">{T["more_h2"]}</h3><ul class="art-list">{more_html}</ul>' if more_html else ''}
      <p class="more"><a class="tlink" href="{blog_home}">{T["all"]}{PG.ARROW}</a></p>
    </div>
  </div>
</section>"""
    main = "\n\n".join([
        blog_hero(lang, crumbs, p["title"], p["description"], blog_meta(p, T), p.get("hero_image"), p.get("image_alt", "")),
        f'<article class="sec art" id="article"><div class="wrap">{banner}<div class="prose">\n{body}\n</div></div></article>',
        nxt])
    d.update(main=main, meta_title=p.get("seo_title") or f'{p["title"]} | Moychay Phuket',
             meta_desc=p.get("seo_description") or p["description"],
             canonical=B.url(lang, slug), href_en=(f"/blog/{slug}/" if (lang == "en" or other) else "/blog/"),
             href_ru=(f"/ru/blog/{slug}/" if (lang == "ru" or other) else "/ru/blog/"))
    d["hreflang"] = "" if preview else hreflang(B.url("en", slug) if (lang == "en" or other) else None,
                                                 B.url("ru", slug) if (lang == "ru" or other) else None)
    posting = {"@type": "BlogPosting", "headline": p["title"], "description": p["description"], "inLanguage": lang,
               "url": B.url(lang, slug), "mainEntityOfPage": B.url(lang, slug),
               "author": ({"@type": "Organization", "name": "Moychay Phuket", "url": url(lang)}
                          if p.get("author", "Moychay Phuket") == "Moychay Phuket" else {"@type": "Person", "name": p["author"]}),
               "publisher": {"@type": "Organization", "name": "Moychay Phuket", "url": f"{SITE_URL}/",
                             "logo": {"@type": "ImageObject", "url": f"{SITE_URL}/img/logo.png"}},
               "articleSection": T["cats"].get(p["category"], p["category"]), "wordCount": p["words"]}
    if p.get("published_at"):
        posting["datePublished"] = p["published_at"]
        posting["dateModified"] = p.get("updated_at") or p["published_at"]
    if p.get("hero_image"):
        posting["image"] = f'{SITE_URL}/img/{p["hero_image"]}-1400.webp'
    if p.get("reviewer"):
        posting["reviewedBy"] = {"@type": "Person", "name": p["reviewer"]}
    crumbs_ld = {"@type": "BreadcrumbList", "itemListElement": [
        {"@type": "ListItem", "position": 1, "name": "Moychay Phuket", "item": url(lang)},
        {"@type": "ListItem", "position": 2, "name": T["crumb"], "item": B.url(lang)},
        {"@type": "ListItem", "position": 3, "name": p["title"], "item": B.url(lang, slug)}]}
    d["jsonld"] = jsonld([posting, crumbs_ld])
    return d


def blog_index(lang, preview=False):
    T = BLOG_T[lang]
    pool = [p for p in (POSTS if preview else PUBLISHED) if p["language"] == lang]
    depth = (2 if lang == "en" else 3) if preview else (2 if lang == "ru" else 1)
    d = blog_data(lang, depth, preview)
    base = f"/_preview{B.lp(lang)}blog/" if preview else f"{B.lp(lang)}blog/"
    rows = "".join(
        f'<li><p class="art-cat">{T["cats"].get(p["category"], p["category"])}'
        + (f' <span class="draft-tag">{T["draft_label"]}</span>' if not p["published"] else "")
        + f'</p><h2><a href="{base}{p["slug"]}/">{p["title"]}</a></h2><p>{p["description"]}</p></li>' for p in pool)
    main = "\n\n".join([
        blog_hero(lang, [("Moychay Phuket", B.lp(lang)), (T["crumb"], "")], T["h1"], T["lead"], "", "interior/1_shop",
                  (EN if lang == "en" else RU)["alt_1shop"]),
        f'<section class="sec" id="articles"><div class="wrap"><ul class="posts">{rows}</ul></div></section>'])
    has_other = any(p["language"] != lang for p in (POSTS if preview else PUBLISHED))
    d.update(main=main, meta_title=T["title"], meta_desc=T["desc"], canonical=B.url(lang),
             href_en="/blog/" if (lang == "en" or has_other) else "/", href_ru="/ru/blog/" if (lang == "ru" or has_other) else "/ru/")
    d["hreflang"] = "" if preview else hreflang(B.url("en") if (lang == "en" or has_other) else None,
                                                 B.url("ru") if (lang == "ru" or has_other) else None)
    d["jsonld"] = jsonld([{"@type": "Blog", "name": T["h1"], "url": B.url(lang), "inLanguage": lang,
                           "publisher": {"@type": "Organization", "name": "Moychay Phuket", "url": f"{SITE_URL}/"},
                           "blogPost": [{"@type": "BlogPosting", "headline": p["title"], "url": B.url(lang, p["slug"])}
                                        for p in pool if p["published"]]},
                          {"@type": "BreadcrumbList", "itemListElement": [
                              {"@type": "ListItem", "position": 1, "name": "Moychay Phuket", "item": url(lang)},
                              {"@type": "ListItem", "position": 2, "name": T["crumb"], "item": B.url(lang)}]}])
    return d


def html_escape(s):
    import html as _h
    return _h.escape(str(s))


def build_blog():
    for d in ("blog", "ru/blog", "_preview"):            # generated output only: rebuilt from _content every time
        shutil.rmtree(os.path.join(ROOT, d), ignore_errors=True)
    for lang in ("en", "ru"):
        if any(p["language"] == lang for p in PUBLISHED):
            build(blog_index(lang), f"{B.lp(lang).lstrip('/')}blog/index.html")
        if any(p["language"] == lang for p in POSTS):
            build(blog_index(lang, preview=True), f"_preview/{B.lp(lang).lstrip('/')}blog/index.html")
    for p in POSTS:
        if p["published"]:
            build(article_page(p), f"{B.lp(p['language']).lstrip('/')}blog/{p['slug']}/index.html")
        build(article_page(p, preview=True), f"_preview/{B.lp(p['language']).lstrip('/')}blog/{p['slug']}/index.html")


def footer_blog(data):
    lang = data["lang"]
    if not any(p["language"] == lang for p in PUBLISHED):
        return ""
    return f'\n        <a href="{B.lp(lang)}blog/">{BLOG_T[lang]["crumb"]}</a>'



NF = dict(
    en=dict(title="Page not found – Moychay Phuket", h1="This page has gone cold.",
            text="Looks like this page doesn't exist. There's always fresh tea waiting back at the tea house.",
            btn="Back to home", home="/"),
    ru=dict(title="Страница не найдена – Moychay Phuket", h1="Кажется, этот чай уже выпили.",
            text="Страница не найдена. Но хороший чай по-прежнему ждёт вас в нашей чайной.",
            btn="На главную", home="/ru/"),
)


def page_404():
    """One 404.html for every missing URL (GitHub Pages serves it with status 404, also under /ru/).
    It holds the EN page and a RU copy in <template>; on /ru/… URLs the RU copy is swapped in
    before the page scripts run. No redirect, so the URL and the 404 status stay as they are."""
    region = {}
    for lang, data in (("en", EN), ("ru", RU)):
        html = render({**home_page(data), "root": "/", "root_href": "/", "home_href": NF[lang]["home"],
                       "nb": NF[lang]["home"], "href_en": "/", "href_ru": "/ru/"})   # absolute paths: works at any depth
        t = NF[lang]
        a, b = html.index('<header class="hdr"'), html.index("</footer>") + len("</footer>")
        part = html[a:b]
        m1, m2 = part.index("<main>"), part.index("</main>") + len("</main>")
        part = (part[:m1] + '<main>\n<section class="nf" id="home">\n  <div class="wrap">\n'
                f'    <p class="nf-code" aria-hidden="true">404</p>\n    <h1>{t["h1"]}</h1>\n'
                f'    <p class="lead">{t["text"]}</p>\n'
                f'    <a class="btn" href="{t["home"]}">{t["btn"]}</a>\n  </div>\n</section>\n</main>' + part[m2:])
        part = part.replace('href="#home"', f'href="{t["home"]}"')
        for sec in ("prices", "teas", "events", "find-us"):
            part = part.replace(f'href="#{sec}"', f'href="{t["home"]}#{sec}"')
        region[lang] = (html, part)
    html, en = region["en"]
    ru = region["ru"][1]
    head, rest = html.split("</head>", 1)
    head = re.sub(r"<title>.*?</title>", f"<title>{NF['en']['title']}</title>", head, flags=re.S)
    head = re.sub(r'<meta name="description"[^>]*>', '<meta name="robots" content="noindex">', head)
    head = re.sub(r'\s*<link rel="(canonical|alternate)"[^>]*>', "", head)
    head = re.sub(r'\s*<meta (property|name)="(og|twitter):[^"]*"[^>]*>', "", head)
    head = re.sub(r'\s*<script type="application/ld\+json">.*?</script>', "", head, flags=re.S)
    a, b = rest.index('<header class="hdr"'), rest.index("</footer>") + len("</footer>")
    swap = ("<script>(function(){if(!/^\\/ru(\\/|$)/.test(location.pathname))return;"
            "var t=document.getElementById('nf-ru'),p=document.getElementById('nf-page');"
            "p.replaceChildren(t.content.cloneNode(true));document.documentElement.lang='ru';"
            f"document.title={json.dumps(NF['ru']['title'], ensure_ascii=False)};}})();</script>")
    rest = (rest[:a] + '<div id="nf-page">\n' + en + '\n</div>\n<template id="nf-ru">\n' + ru
            + "\n</template>\n" + swap + rest[b:])
    # no sticky bar on the 404
    s1 = rest.find("<!-- Sticky bar")
    if s1 > -1:
        s2 = rest.index("</div>\n</div>", s1) + len("</div>\n</div>")
        rest = rest[:s1] + rest[s2:]
    out = head + "</head>" + rest
    left = [x for x in out.split("{{")[1:] if "}}" in x]
    if left:
        raise SystemExit("Unfilled placeholders in 404.html")
    open(os.path.join(ROOT, "404.html"), "w", encoding="utf-8").write(out)
    print("built 404.html")


build(home_page(EN), "index.html")
build(home_page(RU), "ru/index.html")
for slug in SLUGS:
    build(inner_page(EN, slug), f"{slug}/index.html")
    build(inner_page(RU, slug), f"ru/{slug}/index.html")
build_blog()
page_404()
sitemap()
