"""
Inner pages of teaphuket.com: /ceremonies/ /tea/ /matcha/ /events/ /contact/ /wholesale/ (+ /ru/…).

Each page = PAGES[slug][lang] (texts, SEO) + a builder that returns the <main> HTML.
Only facts already confirmed for the tea house are used here: prices, durations and
formats come from the home page. Where data is still missing (tea master, matcha menu),
the block is simply not rendered until it is filled in below.
"""
from html import escape

ARROW = '<svg class="ico" aria-hidden="true"><use href="#i-arrow"/></svg>'
SHOP = "https://phuket.moychay.asia/"

# ── Tea master: fill in to show the block on /ceremonies/ (and /ru/ceremonies/) ──
# Leave as None until the real name, photo and biography are provided.
# photo: file in img/people/ without size suffix, e.g. "people/master" → master-700/1000/1400.webp
TEA_MASTER = None
# TEA_MASTER = dict(
#     photo="people/master",
#     en=dict(name="", role="Tea master at Moychay Phuket", alt="", bio=["", ""], experience="", approach=""),
#     ru=dict(name="", role="Чайный мастер Moychay Phuket", alt="", bio=["", ""], experience="", approach=""),
# )

# ── Matcha menu: exact drinks for /matcha/. Empty = only the confirmed summary is shown. ──
# Example item: dict(en=("Matcha latte", "…"), ru=("Матча-латте", "…"), price="250฿")
MATCHA_MENU = []


def img(path, alt, sizes, cls="", eager=False, w=1400, h=1050):
    """Responsive photo from img/<path>-700/1000/1400.webp."""
    load = 'fetchpriority="high"' if eager else 'loading="lazy"'
    return (f'<figure class="ph {cls}"><img src="{{{{root}}}}img/{path}-1000.webp" '
            f'srcset="{{{{root}}}}img/{path}-700.webp 700w, {{{{root}}}}img/{path}-1000.webp 1000w, {{{{root}}}}img/{path}-1400.webp 1400w" '
            f'sizes="{sizes}" {load} decoding="async" width="{w}" height="{h}" alt="{alt}"></figure>')


def hero(L, P, actions, photo, alt):
    crumbs = (f'<ol class="crumbs"><li><a href="{L["lp"]}">Moychay Phuket</a></li>'
              f'<li aria-current="page">{P["crumb"]}</li></ol>')
    return f'''<section class="phero" id="home">
  <div class="wrap">
    <div>
      <nav aria-label="{L["crumbs_label"]}">{crumbs}</nav>
      <h1>{P["h1"]}</h1>
      <p class="lead">{P["lead"]}</p>
      <div class="actions">
{actions}
      </div>
    </div>
    {img(photo, alt, "(min-width:900px) 50vw, 100vw", "phero-ph", eager=True)}
  </div>
</section>'''


def btn_dir(L, place, label=None):
    return (f'        <a class="btn" href="{{{{maps}}}}" target="_blank" rel="noopener" data-track="directions" data-place="{place}">'
            f'<svg class="bi" aria-hidden="true"><use href="#i-gm"/></svg>{label or L["cta_directions"]}</a>')


def btn_msg(L, place, url, label, cls="btn"):
    return (f'        <a class="{cls}" href="{url}" target="_blank" rel="noopener" data-track="{L["msg_event"]}" data-place="{place}">'
            f'<svg class="bi" aria-hidden="true"><use href="#{L["msg_icon"]}"/></svg>{label}</a>')


def tlink(href, label, ext=False, track=""):
    attrs = ' target="_blank" rel="noopener"' if ext else ""
    if track:
        attrs += f' data-track="{track[0]}" data-place="{track[1]}"'
    return f'<a class="tlink" href="{href}"{attrs}>{label}{ARROW}</a>'


def info(rows):
    return '<dl class="info">' + "".join(f"<div><dt>{a}</dt><dd>{b}</dd></div>" for a, b in rows) + "</dl>"


def steps(items):
    return '<ol class="steps">' + "".join(f"<li><h3>{a}</h3><p>{b}</p></li>" for a, b in items) + "</ol>"


def split(h2, body, cls="sec", sid=""):
    sid = f' id="{sid}"' if sid else ""
    return f'''<section class="{cls}"{sid}>
  <div class="wrap split">
    <h2 class="rv">{h2}</h2>
    <div class="copy">
{body}
    </div>
  </div>
</section>'''


def paras(items):
    return "\n".join(f"      <p>{p}</p>" for p in items)


# ── Forms ────────────────────────────────────────────────────────
def form(L, kind, endpoint, sitekey=""):
    F = L["form"]
    how = "whatsapp" if L["lang"] == "en" else "telegram"
    # live only when both the server handler and Turnstile are configured; otherwise disabled, nothing is sent
    off = not (endpoint and sitekey)
    if off:
        endpoint = sitekey = ""

    def fld(name, label, typ="text", req=True, attrs="", hint=""):
        fid = f"{kind}-{name}"
        mark = ' <span aria-hidden="true">*</span>' if req else f' <span class="opt">{F["optional"]}</span>'
        desc = f"{fid}-err" + (f" {fid}-hint" if hint else "")
        hint_html = f'<span class="fld-hint" id="{fid}-hint">{hint}</span>' if hint else ""
        ctl = (f'<textarea id="{fid}" name="{name}" rows="5" maxlength="3000"{" required" if req else ""} aria-describedby="{desc}"></textarea>'
               if typ == "textarea" else
               f'<input id="{fid}" name="{name}" type="{typ}"{" required" if req else ""} aria-describedby="{desc}" {attrs}>')
        return (f'      <div class="fld"><label for="{fid}">{label}{mark}</label>{hint_html}{ctl}'
                f'<span class="fld-err" id="{fid}-err"></span></div>')

    rows = [fld("name", F["name"], attrs='autocomplete="name" maxlength="100"')]
    if kind == "wholesale":
        rows.append(fld("company", F["company"], attrs='autocomplete="organization" maxlength="150"'))
    rows.append(fld("email", F["email"], "email", attrs='autocomplete="email" inputmode="email" maxlength="200" spellcheck="false"'))
    if how == "whatsapp":
        rows.append(fld("contact_value", F["contact"], "tel", False,
                        'autocomplete="tel" inputmode="tel" maxlength="24" placeholder="+66 81 234 5678"', F["contact_hint"]))
    else:
        rows.append(fld("contact_value", F["contact"], "text", False,
                        'autocomplete="off" autocapitalize="none" spellcheck="false" maxlength="40" placeholder="username"', F["contact_hint"]))
    rows.append(fld("message", F["message_wh"] if kind == "wholesale" else F["message"], "textarea"))

    notice = ""
    if off:
        notice = f'''    <div class="form-off" role="note">
      <p>{F["offline"]}</p>
      <div class="act">
{btn_msg(L, kind + "_form_offline", L["msg_url"], L["sticky_msg_label"], "tlink")}
      </div>
    </div>
'''
    return f'''<form class="form" id="{kind}-form" data-form="{kind}" data-endpoint="{escape(endpoint)}" data-sitekey="{escape(sitekey)}" novalidate>
{notice}    <fieldset{" disabled" if off else ""}>
{chr(10).join(rows)}
      <div class="hp" aria-hidden="true"><label for="{kind}-website">{F["hp"]}</label><input id="{kind}-website" name="website" type="text" tabindex="-1" autocomplete="off"></div>
      <input type="hidden" name="contact_method" value="{how}">
      <div class="ts" id="{kind}-ts"></div>
      <p class="form-note">{F["note"]}</p>
      <button class="btn" type="submit">{F["submit"]}</button>
    </fieldset>
    <p class="form-msg" role="status" aria-live="polite" hidden></p>
  </form>'''


# ── Page builders ────────────────────────────────────────────────
def ceremonies(L, P, cfg):
    actions = "\n".join([btn_msg(L, "ceremonies_hero", L["msg_book_url"], P["cta"]),
                         "        " + tlink("#formats", P["cta2"])])
    fm = []
    for f in P["formats"]:
        book = ""
        if f.get("book"):
            book = "\n          " + tlink(L["msg_book_url"], f["book"], True, (L["msg_event"], "ceremonies_format"))
        fm.append(f'''        <li class="menu-i">
          <h3>{f["name"]}</h3>
          <p class="menu-p">{f["price"]}</p>
          <p class="menu-m">{f["meta"]}</p>
          <p class="menu-d">{f["text"]}</p>
          <p class="menu-c">{f["terms"]}</p>{book}
        </li>''')
    formats = f'''<section class="cer cer-page" id="formats">
  <div class="wrap">
    {img("people/8_people", P["alt_formats"], "(min-width:900px) 42vw, 100vw", "cer-ph")}
    <div>
      <h2 class="rv">{P["formats_h2"]}</h2>
      <ul class="menu">
{chr(10).join(fm)}
      </ul>
      <div class="cer-foot">
        <p>{P["formats_note"]}</p>
{btn_msg(L, "ceremonies_formats", L["msg_book_url"], P["cta"])}
      </div>
    </div>
  </div>
</section>'''
    master = ""
    if TEA_MASTER and TEA_MASTER.get(L["lang"], {}).get("name"):
        M = TEA_MASTER[L["lang"]]
        body = paras(M["bio"]) + "\n" + info([(P["m_exp"], M["experience"]), (P["m_appr"], M["approach"])])
        master = f'''<section class="sec" id="tea-master">
  <div class="wrap master">
    {img(TEA_MASTER["photo"], M["alt"], "(min-width:900px) 40vw, 100vw", "master-ph", w=1120, h=1400)}
    <div class="copy">
      <h2 class="rv">{P["m_h2"]}</h2>
      <p class="master-role"><strong>{M["name"]}</strong> · {M["role"]}</p>
{body}
    </div>
  </div>
</section>'''
    how = split(P["how_h2"], "      " + steps(P["how"]), sid="how")
    pr = split(P["info_h2"], "      " + info(P["info"]) + "\n      <div class=\"actions more\">\n"
               + btn_msg(L, "ceremonies_info", L["msg_book_url"], P["cta"]) + "\n        "
               + tlink(L["lp"] + "events/", P["to_events"]) + "\n      </div>", "sec sand", "visit")
    return "\n\n".join(x for x in [hero(L, P, actions, "people/4_people", P["alt_hero"]), formats, master, how, pr] if x)


def tea(L, P, cfg):
    actions = "\n".join([btn_dir(L, "tea_hero"),
                         "        " + tlink(SHOP, P["shop_cta"], True, ("online_shop_click", "tea_hero"))])
    origin = split(P["origin_h2"], paras(P["origin"]), sid="origin")
    items = "\n".join(f"        <li><h3>{a}</h3><p>{b}</p></li>" for a, b in L["tea_list"])
    cats = f'''<section class="teas wood" id="categories">
  <div class="wrap">
    <div class="teas-top">
      <div class="rv">
        <h2>{P["cats_h2"]}</h2>
        <p class="lead">{P["cats_lead"]}</p>
      </div>
      {img("interior/3_shop", P["alt_cats"], "(min-width:900px) 58vw, 100vw", "teas-ph")}
    </div>
    <ul class="tea-list">
{items}
    </ul>
    {tlink(L["lp"] + "ceremonies/", P["to_cer"])}
  </div>
</section>'''
    ware = split(P["ware_h2"], paras(P["ware"]), sid="teaware")
    shop = f'''<section class="shop" id="shop" aria-labelledby="shop-h">
  <div class="wrap">
    {img("interior/4_shop", L["alt_4shop"], "(min-width:900px) 56vw, 100vw", "shop-ph", w=834, h=1280)}
    <div class="shop-copy rv">
      <h2 id="shop-h">{P["shop_h2"]}</h2>
      <p class="lead">{P["shop_text"]}</p>
      <div class="shop-act">
        <a class="btn" href="{SHOP}" target="_blank" rel="noopener" data-track="online_shop_click" data-place="tea_page">{P["shop_cta"]}{ARROW}</a>
      </div>
    </div>
  </div>
</section>'''
    return "\n\n".join([hero(L, P, actions, "interior/2_shop", P["alt_hero"]), origin, cats, ware, shop])


def matcha(L, P, cfg):
    actions = "\n".join([btn_dir(L, "matcha_hero", P["cta"]),
                         "        " + tlink(L["lp"] + "contact/", P["cta2"])])
    rows = list(P["drinks"])
    menu = ""
    if MATCHA_MENU:
        lis = "\n".join(f'''        <li class="menu-i"><h3>{m[L["lang"]][0]}</h3><p class="menu-p">{m.get("price", "")}</p>
          <p class="menu-d">{m[L["lang"]][1]}</p></li>''' for m in MATCHA_MENU)
        menu = f'\n      <ul class="menu">\n{lis}\n      </ul>'
    drinks = split(P["drinks_h2"], "      " + info(rows) + menu, sid="drinks")
    what = split(P["what_h2"], paras(P["what"]), "sec", "about-matcha")
    stay = f'''<section class="about" id="stay">
  <div class="wrap">
    {img("interior/1_shop", P["alt_stay"], "(min-width:900px) 60vw, 100vw", "about-ph")}
    <div class="copy rv">
      <h2>{P["stay_h2"]}</h2>
{paras(P["stay"])}
      <div class="actions more">
{btn_dir(L, "matcha_visit", P["cta"])}
      </div>
    </div>
  </div>
</section>'''
    return "\n\n".join([hero(L, P, actions, "interior/6_shop", P["alt_hero"]), drinks, stay, what])


def events(L, P, cfg):
    actions = "\n".join([btn_msg(L, "events_hero", L["msg_url"], P["cta"]),
                         '        <a class="tlink" href="https://www.instagram.com/moychay.phuket" target="_blank" rel="noopener" data-track="instagram" data-place="events_hero"><svg class="bi" aria-hidden="true"><use href="#i-ig"/></svg>' + L["ev_cta"] + "</a>"])
    lst = f'''<section class="ev" id="events">
  <div class="wrap">
    <div class="ev-head">
      <div class="rv">
        <h2>{P["list_h2"]}</h2>
        <p class="lead">{L["ev_intro"]}</p>
      </div>
      <div class="ev-links">
{L["ev_extra"]}
      </div>
    </div>
    <div class="ev-list" id="evRow" data-limit="40" data-ld aria-live="polite">
      <div class="evc evc-skel"></div><div class="evc evc-skel"></div><div class="evc evc-skel"></div>
    </div>
  </div>
</section>'''
    join = split(P["join_h2"], "      " + info(P["join"]) + "\n      <div class=\"actions more\">\n"
                 + btn_msg(L, "events_join", L["msg_url"], P["cta"]) + "\n        "
                 + tlink(L["lp"] + "ceremonies/", P["to_cer"]) + "\n      </div>", "sec sand", "join")
    return "\n\n".join([hero(L, P, actions, "people/2_people", P["alt_hero"]), lst, join])


def contact(L, P, cfg):
    actions = "\n".join([btn_dir(L, "contact_hero"),
                         btn_msg(L, "contact_hero", L["msg_url"], L["cta_message"], "tlink")])
    q = "Moychay+Phuket,+Boat+Avenue,+Bang+Tao,+Phuket"
    rows = [(L["find_addr_l"], "Moychay Phuket<br>" + L["addr_full"]), (L["find_hours_l"], L["hours"]),
            (L["find_park_l"], L["find_park"]), (L["find_msg_l"], L["find_msgs"]), (P["social_l"], P["social"])]
    visit = f'''<section class="sec" id="find-us">
  <div class="wrap split">
    <div>
      <h2 class="rv">{P["visit_h2"]}</h2>
      {info(rows)}
      <div class="actions more">
{btn_dir(L, "contact_find")}
      </div>
    </div>
    <div class="map"><iframe src="https://www.google.com/maps?q={q}&amp;hl={L["map_lang"]}&amp;output=embed" title="{L["map_title"]}" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe></div>
  </div>
</section>'''
    frm = f'''<section class="sec sand" id="write">
  <div class="wrap split">
    <div>
      <h2 class="rv">{P["form_h2"]}</h2>
      <p class="muted">{P["form_lead"]}</p>
    </div>
  {form(L, "contact", cfg["cfg_form_endpoint"], cfg["cfg_turnstile_sitekey"])}
  </div>
</section>'''
    return "\n\n".join([hero(L, P, actions, "interior/7_shop", P["alt_hero"]), visit, frm])


def wholesale(L, P, cfg):
    actions = "\n".join(['        <a class="btn" href="#request">' + P["cta"] + "</a>",
                         btn_msg(L, "wholesale_hero", L["msg_url"], L["cta_message"], "tlink")])
    who = split(P["who_h2"], "      <ul class=\"list2\">" + "".join(f"<li>{x}</li>" for x in P["who"]) + "</ul>\n"
                + f'      <p class="muted more">{P["who_note"]}</p>', sid="who")
    rng = split(P["range_h2"], paras(P["range"]) + "\n      <ul class=\"list2 more\">"
                + "".join(f"<li>{x}</li>" for x in P["range_list"]) + "</ul>\n      <p class=\"more\">"
                + tlink(L["lp"] + "tea/", P["to_tea"]) + "</p>", "sec sand", "range")
    how = split(P["how_h2"], "      " + steps(P["how"]), sid="how")
    frm = f'''<section class="sec sand" id="request">
  <div class="wrap split">
    <div>
      <h2 class="rv">{P["form_h2"]}</h2>
      <p class="muted">{P["form_lead"]}</p>
    </div>
  {form(L, "wholesale", cfg["cfg_form_endpoint"], cfg["cfg_turnstile_sitekey"])}
  </div>
</section>'''
    return "\n\n".join([hero(L, P, actions, "interior/2_shop", P["alt_hero"]), who, rng, how, frm])


BUILDERS = dict(ceremonies=ceremonies, tea=tea, matcha=matcha, events=events, contact=contact, wholesale=wholesale)


# ── Texts ────────────────────────────────────────────────────────
PAGES = dict(
    ceremonies=dict(
        en=dict(
            title="Tea Ceremonies in Phuket | Moychay Phuket",
            desc="Chinese tea ceremonies at Moychay Phuket in Bangtao: gong fu cha with a tea master (600฿, 60 min), walk-in tastings and group ceremonies for up to 30 guests.",
            crumb="Tea ceremonies", h1="Tea ceremonies in Phuket",
            lead="At our tea house on Boat Avenue the tea master brews Chinese tea in the gong fu cha style and explains every step. No experience needed – most guests try it for the first time.",
            cta="Book a tea ceremony", cta2="See formats and prices",
            alt_hero="Guests at the tea table with the tea master at Moychay Phuket",
            alt_formats="Guests at a tea ceremony at the round table",
            formats_h2="Formats and prices",
            formats=[
                dict(name="Walk-in tasting (Pin Cha)", price="300฿ <small>+ tea by weight</small>",
                     meta="About 10 minutes with the tea master · No booking",
                     text="A short introduction, then you stay with the tea you picked.",
                     terms="Just come in during opening hours. The tea you choose is charged by weight."),
                dict(name="Gong fu cha ceremony", price="600฿ <small>per person</small>",
                     meta="60 minutes + up to 60 minutes to relax · Booking required",
                     text="Brewing steps, teaware and the tea itself, guided by the tea master.",
                     terms="Book in advance on WhatsApp – space at the tea table is limited.",
                     book="Book this ceremony"),
                dict(name="Group ceremonies", price="Price on request",
                     meta="Up to 30 guests · At the tea house or your venue · Booking required",
                     text="Birthdays, team events and gatherings.",
                     terms="Tell us the date, the number of guests and the place – we'll reply with the details and the price.",
                     book="Ask about a group ceremony"),
            ],
            formats_note="Not sure where to start? Ask the tea master – from a light green tea to an aged pu-erh.",
            m_h2="Meet our tea master", m_exp="Experience", m_appr="Approach to the ceremony",
            how_h2="How a ceremony goes",
            how=[
                ("Choose your tea", "Tell the tea master what you like, or simply point at a jar. You don't need to know any names."),
                ("Brewing, step by step", "The tea master brews it gong fu cha style and explains the brewing steps, the teaware and the tea itself as you go."),
                ("Stay a while", "The ceremony takes about 60 minutes. After that you can stay at the table for up to an hour to relax."),
            ],
            info_h2="Before you come",
            info=[
                ("Where", "Moychay Phuket, 2nd floor, Boat Avenue, Bangtao, Phuket. Parking on site."),
                ("Hours", "Open daily 11:00–22:00"),
                ("Booking", "Needed for the gong fu cha ceremony and group ceremonies – message us on WhatsApp. Walk-in tastings need no booking."),
                ("Experience", "Not needed. Most guests try a tea ceremony for the first time."),
                ("Duration and price", "Walk-in tasting – about 10 minutes, 300฿ + tea by weight. Gong fu cha – 60 minutes + up to 60 minutes to relax, 600฿ per person. Groups – price on request."),
                ("Languages", "Thai, English and Russian"),
            ],
            to_events="Tea events this week",
        ),
        ru=dict(
            title="Чайные церемонии на Пхукете | Moychay Phuket",
            desc="Китайские чайные церемонии в Moychay Phuket в Бангтао: гунфу ча с чайным мастером (600฿, 60 минут), дегустации без записи и групповые церемонии до 30 гостей.",
            crumb="Чайные церемонии", h1="Чайные церемонии на Пхукете",
            lead="В нашей чайной на Boat Avenue чайный мастер заваривает китайский чай в стиле гунфу ча и рассказывает о каждом шаге. Опыт не нужен – большинство гостей пробуют церемонию впервые.",
            cta="Записаться на церемонию", cta2="Форматы и цены",
            alt_hero="Гости за чайным столом с чайным мастером в Moychay Phuket",
            alt_formats="Гости на чайной церемонии за круглым столом",
            formats_h2="Форматы и цены",
            formats=[
                dict(name="Дегустация без записи (Пин Ча)", price="300฿ <small>+ чай по весу</small>",
                     meta="Около 10 минут с чайным мастером · Без записи",
                     text="Короткое знакомство с чаем, потом остаётесь с выбранным сортом.",
                     terms="Просто приходите в часы работы. Выбранный чай оплачивается по весу."),
                dict(name="Церемония гунфу ча", price="600฿ <small>с человека</small>",
                     meta="60 минут + до 60 минут отдыха · Нужна запись",
                     text="Этапы заваривания, посуда и сам чай – вместе с чайным мастером.",
                     terms="Запишитесь заранее в Telegram – мест за чайным столом немного.",
                     book="Записаться на церемонию"),
                dict(name="Групповые церемонии", price="Цена по запросу",
                     meta="До 30 гостей · У нас или на вашей площадке · Нужна запись",
                     text="Дни рождения, командные встречи и праздники.",
                     terms="Напишите дату, количество гостей и место – ответим с деталями и ценой.",
                     book="Узнать о групповой церемонии"),
            ],
            formats_note="Не знаете, с чего начать? Спросите чайного мастера – подберёт что-то от лёгкого зелёного до выдержанного пуэра.",
            m_h2="Наш чайный мастер", m_exp="Опыт", m_appr="Подход к церемонии",
            how_h2="Как проходит церемония",
            how=[
                ("Выбираете чай", "Расскажите чайному мастеру, что вам нравится, или просто покажите на банку. Знать названия не нужно."),
                ("Заваривание шаг за шагом", "Чайный мастер заваривает чай в стиле гунфу ча и по ходу рассказывает об этапах, посуде и самом чае."),
                ("Остаётесь отдохнуть", "Церемония длится около 60 минут. После можно остаться за столом ещё до часа."),
            ],
            info_h2="Перед визитом",
            info=[
                ("Где", "Moychay Phuket, 2 этаж, Boat Avenue, Бангтао, Пхукет. Парковка на месте."),
                ("Часы работы", "Ежедневно 11:00–22:00"),
                ("Запись", "Нужна на церемонию гунфу ча и групповые церемонии – напишите нам в Telegram. На дегустацию записываться не нужно."),
                ("Опыт", "Не нужен. Большинство гостей пробуют чайную церемонию впервые."),
                ("Длительность и цена", "Дегустация – около 10 минут, 300฿ + чай по весу. Гунфу ча – 60 минут + до 60 минут отдыха, 600฿ с человека. Группы – цена по запросу."),
                ("Языки", "Тайский, английский и русский"),
            ],
            to_events="Чайные мероприятия на неделе",
        ),
    ),
    tea=dict(
        en=dict(
            title="Chinese Tea in Phuket – Pu-erh, Oolong &amp; More | Moychay",
            desc="Pu-erh, oolong, white, green and red tea at Moychay Phuket in Bangtao: 200+ teas to taste at the tea house and an online shop with free delivery across Thailand.",
            crumb="Chinese tea", h1="Chinese tea in Phuket",
            lead="More than 200 teas to taste at our tea house on Boat Avenue – from delicate white tea to aged pu-erh. Come and try before you choose.",
            shop_cta="Shop tea online",
            alt_hero="Pu-erh tea cakes on dark shelves at Moychay Phuket",
            origin_h2="Where our tea comes from",
            origin=[
                "Moychay Phuket is part of Moychay, an international tea community with tea houses around the world. Our teas come from suppliers they have worked with for years.",
                "No need to know any of this before you come. Point at a jar, and the tea master will brew it for you.",
            ],
            cats_h2="Teas on our shelves",
            cats_lead="Every category below can be tasted at the tea house – at a walk-in tasting or during a ceremony.",
            alt_cats="Shelves of clay teapots and porcelain cups",
            to_cer="Tea ceremonies and tastings",
            ware_h2="Teaware and antiques",
            ware=[
                "Clay teapots, porcelain cups and antique teaware on our shelves are a real collection for sale, not decor.",
                "The tea master will help you choose a teapot for the tea you like.",
            ],
            shop_h2="Buy tea online",
            shop_text="Tea and teaware from our online shop, delivered anywhere in Thailand – free on orders over 2000฿. International shipping is available too.",
        ),
        ru=dict(
            title="Китайский чай на Пхукете – Пуэр, улун и другие сорта",
            desc="Пуэр, улун, белый, зелёный и красный чай в Moychay Phuket в Бангтао: 200+ сортов для дегустации в чайной и интернет-магазин с доставкой по Таиланду.",
            crumb="Китайский чай", h1="Китайский чай на Пхукете",
            lead="Больше 200 сортов чая можно попробовать в нашей чайной на Boat Avenue – от деликатного белого до выдержанного пуэра. Приходите попробовать, прежде чем выбрать.",
            shop_cta="Купить чай онлайн",
            alt_hero="Блины пуэра на тёмных полках в Moychay Phuket",
            origin_h2="Откуда наш чай",
            origin=[
                "Moychay Phuket – часть Moychay, международного чайного сообщества с чайными домами по всему миру. Чай приходит от поставщиков, с которыми работают годами.",
                "Заранее разбираться не нужно. Покажите на банку – и чайный мастер заварит.",
            ],
            cats_h2="Чай на наших полках",
            cats_lead="Любую категорию можно попробовать в чайной – на дегустации или во время церемонии.",
            alt_cats="Полки с глиняными чайниками и фарфоровыми чашками",
            to_cer="Чайные церемонии и дегустации",
            ware_h2="Посуда и антиквариат",
            ware=[
                "Глиняные чайники, фарфоровые чашки и антикварная посуда на наших полках – настоящая коллекция, её можно купить.",
                "Чайный мастер поможет подобрать чайник под ваш чай.",
            ],
            shop_h2="Купить чай онлайн",
            shop_text="Чай и посуда из нашего интернет-магазина с доставкой по всему Таиланду – бесплатно при заказе от 2000฿. Отправляем заказы и за рубеж.",
        ),
    ),
    matcha=dict(
        en=dict(
            title="Matcha in Phuket – Matcha Tea &amp; Drinks | Moychay Phuket",
            desc="Matcha lattes and matcha tonics at Moychay Phuket on Boat Avenue, Bangtao. Non-alcoholic matcha drinks from 250฿, to stay or to go. Open daily 11:00–22:00.",
            crumb="Matcha", h1="Matcha in Phuket",
            lead="Non-alcoholic matcha lattes and matcha tonics at our tea house on Boat Avenue in Bangtao – to stay or to go.",
            cta="Visit our tea house", cta2="Address and hours",
            alt_hero="Rattan peacock chair and calligraphy scrolls in the tea house",
            drinks_h2="Matcha at Moychay Phuket",
            drinks=[
                ("Matcha drinks", "Non-alcoholic matcha lattes and matcha tonics"),
                ("Price", "From 250฿"),
                ("To stay or to go", "Both – take a seat in the tea house or take your drink with you"),
                ("Also on the menu", "Kombucha on tap and more than 200 Chinese teas"),
                ("Hours", "Open daily 11:00–22:00"),
            ],
            stay_h2="A quiet place for your matcha",
            stay=[
                "Guests come to work over a matcha latte, or just want a quiet corner away from the beach.",
                "Concrete walls, calligraphy, a rattan peacock chair, board games and a reading corner – on the 2nd floor of Boat Avenue, with parking on site.",
            ],
            alt_stay="Round tea table by the arched window at Moychay Phuket",
            what_h2="What matcha is",
            what=[
                "Matcha is green tea ground into a fine powder. Instead of steeping leaves and pouring off the infusion, you drink the whole tea leaf.",
                "If you'd like to try leaf green tea as well, ask the tea master – it is one of the categories on our shelves.",
            ],
        ),
        ru=dict(
            title="Матча на Пхукете – Чай и напитки с матчей | Moychay",
            desc="Матча-латте и тоники с матчей в Moychay Phuket на Boat Avenue, Бангтао. Безалкогольные напитки с матчей от 250฿, здесь или с собой. Ежедневно 11:00–22:00.",
            crumb="Матча", h1="Матча на Пхукете",
            lead="Безалкогольные матча-латте и тоники с матчей в нашей чайной на Boat Avenue в Бангтао – здесь или с собой.",
            cta="Приходите к нам", cta2="Адрес и часы работы",
            alt_hero="Ротанговое кресло-павлин и свитки с каллиграфией в чайной",
            drinks_h2="Матча в Moychay Phuket",
            drinks=[
                ("Напитки с матчей", "Безалкогольные матча-латте и тоники"),
                ("Цена", "От 250฿"),
                ("Здесь или с собой", "Можно остаться в чайной или взять напиток с собой"),
                ("Ещё в меню", "Комбуча на разлив и больше 200 сортов китайского чая"),
                ("Часы работы", "Ежедневно 11:00–22:00"),
            ],
            stay_h2="Тихое место для матчи",
            stay=[
                "К нам приходят поработать за матча-латте или просто посидеть в тишине подальше от пляжа.",
                "Бетонные стены, каллиграфия, ротанговое кресло-павлин, настольные игры и уголок для чтения – на 2 этаже Boat Avenue, парковка на месте.",
            ],
            alt_stay="Круглый чайный стол у арочного окна в Moychay Phuket",
            what_h2="Что такое матча",
            what=[
                "Матча – это зелёный чай, перемолотый в тонкий порошок. Вы пьёте не настой, а весь чайный лист целиком.",
                "Если захочется попробовать и листовой зелёный чай, спросите чайного мастера – он есть на наших полках.",
            ],
        ),
    ),
    events=dict(
        en=dict(
            title="Tea Events &amp; Tastings in Phuket | Moychay Phuket",
            desc="Upcoming tea events at Moychay Phuket in Bangtao: tastings, ceremonies and evenings at the tea house every week. Open to everyone, no tea background needed.",
            crumb="Events", h1="Tea events in Phuket",
            lead="Tastings, tea ceremonies and evenings at our tea house on Boat Avenue – every week, open to everyone.",
            cta="Ask about an event",
            alt_hero="Guests at a tea evening around a long table at Moychay Phuket",
            list_h2="Upcoming events",
            join_h2="How to join",
            join=[
                ("Where", "Moychay Phuket, 2nd floor, Boat Avenue, Bangtao, Phuket"),
                ("Who can come", "Everyone – no tea background needed"),
                ("Price", "Shown on each event; some events are free"),
                ("Questions and seats", "Message us on WhatsApp – we'll help with the details"),
                ("Announcements", "New dates are announced every week on Instagram"),
            ],
            to_cer="Private and group tea ceremonies",
        ),
        ru=dict(
            title="Чайные мероприятия и дегустации на Пхукете | Moychay",
            desc="Ближайшие чайные мероприятия в Moychay Phuket в Бангтао: дегустации, церемонии и вечера в чайной каждую неделю. Приходить может любой, опыт не нужен.",
            crumb="Мероприятия", h1="Чайные мероприятия на Пхукете",
            lead="Дегустации, чайные церемонии и вечера в нашей чайной на Boat Avenue – каждую неделю, для всех желающих.",
            cta="Спросить о мероприятии",
            alt_hero="Гости на чайном вечере за длинным столом в Moychay Phuket",
            list_h2="Ближайшие мероприятия",
            join_h2="Как попасть",
            join=[
                ("Где", "Moychay Phuket, 2 этаж, Boat Avenue, Бангтао, Пхукет"),
                ("Кто может прийти", "Любой – разбираться в чае не нужно"),
                ("Стоимость", "Указана у каждого мероприятия, некоторые бесплатные"),
                ("Вопросы и места", "Напишите нам в Telegram – подскажем детали"),
                ("Анонсы", "Новые даты каждую неделю – в Telegram-клубе и Instagram"),
            ],
            to_cer="Частные и групповые церемонии",
        ),
    ),
    contact=dict(
        en=dict(
            title="Contact &amp; Visit Moychay Phuket | Tea House in Bangtao",
            desc="Moychay Phuket tea house: 2nd floor, Boat Avenue, Bangtao, Phuket. Open daily 11:00–22:00. Get directions, message us on WhatsApp or write to us.",
            crumb="Contact", h1="Visit Moychay Phuket",
            lead="2nd floor, Boat Avenue, Bangtao. Open daily 11:00–22:00 – for a walk-in tasting just come by.",
            alt_hero="Moychay Phuket entrance on Boat Avenue",
            visit_h2="Address and contacts",
            social_l="Follow us",
            social='<a href="https://www.instagram.com/moychay.phuket" target="_blank" rel="noopener" data-track="instagram" data-place="contact">Instagram</a> · <a href="https://www.facebook.com/moychay.phuket/" target="_blank" rel="noopener" data-track="facebook" data-place="contact">Facebook</a>',
            form_h2="Get in touch",
            form_lead="For bookings the quickest way is WhatsApp. For anything else, write to us here and we'll reply by email.",
        ),
        ru=dict(
            title="Контакты Moychay Phuket – Чайная в Бангтао",
            desc="Чайная Moychay Phuket: 2 этаж, Boat Avenue, Бангтао, Пхукет. Ежедневно 11:00–22:00. Маршрут, Telegram, WhatsApp и форма обратной связи.",
            crumb="Контакты", h1="Контакты Moychay Phuket",
            lead="2 этаж, Boat Avenue, Бангтао. Ежедневно 11:00–22:00 – на дегустацию можно прийти без записи.",
            alt_hero="Вход в Moychay Phuket на Boat Avenue",
            visit_h2="Адрес и контакты",
            social_l="Соцсети",
            social='<a href="https://www.instagram.com/moychay.phuket" target="_blank" rel="noopener" data-track="instagram" data-place="contact">Instagram</a> · <a href="https://www.facebook.com/moychay.phuket/" target="_blank" rel="noopener" data-track="facebook" data-place="contact">Facebook</a> · <a href="https://t.me/moychayphuket" target="_blank" rel="noopener" data-track="telegram_club" data-place="contact">Чайный клуб в Telegram</a>',
            form_h2="Напишите нам",
            form_lead="Записаться на церемонию быстрее всего в Telegram. По другим вопросам напишите здесь – ответим на email.",
        ),
    ),
    wholesale=dict(
        en=dict(
            title="Wholesale Tea Supplier in Phuket | Moychay Phuket",
            desc="Chinese tea for cafés, restaurants, hotels and spas in Phuket. Moychay Phuket discusses regular tea supplies for businesses – send us a request.",
            crumb="Wholesale", h1="Wholesale tea for businesses in Phuket",
            lead="Moychay Phuket supplies Chinese tea to businesses in Phuket. Tell us about your venue, and we'll discuss the teas and the supply that suit you.",
            cta="Send a request",
            alt_hero="Pu-erh tea cakes on the shelves of Moychay Phuket",
            who_h2="Who it's for",
            who=["Cafés", "Coffee shops", "Restaurants", "Hotels", "Spa and wellness centres", "Other venues"],
            who_note="Any business that serves tea to its guests and needs regular supplies in Phuket.",
            range_h2="Teas to discuss",
            range=[
                "We'll talk about specific teas, volumes and delivery once we know your needs. You can taste the teas at our tea house on Boat Avenue before deciding.",
            ],
            range_list=["White tea", "Green tea", "Light and dark oolongs", "Red tea", "Sheng and shu pu-erh", "Herbal tea"],
            to_tea="More about our teas",
            how_h2="How it works",
            how=[
                ("You send a request", "Tell us about your business and what kind of tea you're looking for."),
                ("We discuss your needs", "We talk through the range, the volumes and how you plan to serve the tea."),
                ("We agree on the terms", "Together we settle the supply terms that work for your venue."),
            ],
            form_h2="Request wholesale tea",
            form_lead="Tell us about your venue and what you need. We'll reply by email.",
        ),
        ru=dict(
            title="Оптовые поставки чая на Пхукете | Moychay",
            desc="Китайский чай для кафе, ресторанов, отелей и SPA на Пхукете. Moychay Phuket обсуждает регулярные поставки чая для бизнеса – оставьте заявку.",
            crumb="Оптовые поставки", h1="Оптовые поставки чая на Пхукете",
            lead="Moychay Phuket поставляет китайский чай заведениям на Пхукете. Расскажите о своём бизнесе – обсудим сорта и формат поставок.",
            cta="Оставить заявку",
            alt_hero="Блины пуэра на полках Moychay Phuket",
            who_h2="Для кого",
            who=["Кафе", "Кофейни", "Рестораны", "Отели", "SPA и wellness-центры", "Другие заведения"],
            who_note="Любой бизнес, где гостям подают чай и нужны регулярные поставки по Пхукету.",
            range_h2="Какой чай можно обсудить",
            range=[
                "Конкретные сорта, объёмы и доставку обсудим, когда поймём ваши задачи. Попробовать чай можно в нашей чайной на Boat Avenue.",
            ],
            range_list=["Белый чай", "Зелёный чай", "Светлые и тёмные улуны", "Красный чай", "Шэн и шу пуэр", "Травяной чай"],
            to_tea="Подробнее о нашем чае",
            how_h2="Как мы работаем",
            how=[
                ("Вы оставляете заявку", "Расскажите о заведении и о том, какой чай ищете."),
                ("Обсуждаем задачи", "Говорим об ассортименте, объёмах и о том, как вы будете подавать чай."),
                ("Согласовываем условия", "Вместе договариваемся об условиях поставок, удобных вашему заведению."),
            ],
            form_h2="Заявка на оптовые поставки",
            form_lead="Расскажите о заведении и о том, что вам нужно. Ответим на email.",
        ),
    ),
)

# Page order (footer, sitemap)
SLUGS = ["ceremonies", "tea", "matcha", "events", "contact", "wholesale"]
