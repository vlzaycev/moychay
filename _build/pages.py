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
TEA_MASTER = dict(
    photo="people/igor",
    en=dict(name="Igor", role="Tea master at Moychay Phuket", alt="Igor, tea master at Moychay Phuket, at the tea table",
            bio=["Igor is a tea master from Astrakhan. Before Moychay Phuket he worked in tea houses, and today he brews tea for guests on Boat Avenue."],
            experience="", approach=""),
    ru=dict(name="Игорь", role="Чайный мастер Moychay Phuket", alt="Игорь, чайный мастер Moychay Phuket, за чайным столом",
            bio=["Игорь – чайный мастер из Астрахани. До Moychay Phuket работал в чайных, а сейчас заваривает чай для гостей на Boat Avenue."],
            experience="", approach=""),
)
# TEA_MASTER = dict(
#     photo="people/master",
#     en=dict(name="", role="Tea master at Moychay Phuket", alt="", bio=["", ""], experience="", approach=""),
#     ru=dict(name="", role="Чайный мастер Moychay Phuket", alt="", bio=["", ""], experience="", approach=""),
# )

# ── B2B partners on /wholesale/: only real partners who agreed to be shown. Empty = no section at all. ──
# Logo file goes to img/partners/. Example:
# dict(name="Hotel Name", logo="hotel-name.svg", en=dict(format="Tea for guest rooms", case=""), ru=dict(format="Чай для номеров", case=""))
PARTNERS = []

# ── Matcha menu: exact drinks for /matcha/. Empty = only the confirmed summary is shown. ──
# Example item: dict(en=("Matcha latte", "…"), ru=("Матча-латте", "…"), price="250฿")
MATCHA_MENU = []


# Published blog articles {(lang, slug): title}; filled by build.py. Links to an article appear only once it is published.
PUBLISHED = {}


def read_more(L, slugs):
    """Natural link to a related published article (first one found), or nothing."""
    for s in slugs:
        title = PUBLISHED.get((L["lang"], s))
        if title:
            return '<p class="more">' + tlink(L["lp"] + "blog/" + s + "/", title) + "</p>"
    return ""


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
      <h1{' class="long"' if len(P["h1"]) > 40 else ""}>{P["h1"]}</h1>
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


def table_rows(head, rows):
    """Table body; each cell carries its column name, so narrow screens can show rows as labelled blocks."""
    return "".join("<tr>" + "".join((f'<th scope="row">{c}</th>' if j == 0 else f'<td data-label="{head[j]}">{c}</td>')
                                    for j, c in enumerate(r)) + "</tr>" for r in rows)


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
        fid = "wholesale-business_type"     # optional; values must match BUSINESS_TYPES in the Worker (validate.js)
        opts = "".join(f'<option value="{v}">{lbl}</option>' for v, lbl in F["btypes"])
        rows.append(f'      <div class="fld"><label for="{fid}">{F["btype"]} <span class="opt">{F["optional"]}</span></label>'
                    f'<select id="{fid}" name="business_type" aria-describedby="{fid}-err"><option value="">{F["btype_none"]}</option>{opts}</select>'
                    f'<span class="fld-err" id="{fid}-err"></span></div>')
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
          <p class="menu-m">{", ".join([m for m in f["meta"].split(" · ")][:1] + [m[:1].lower() + m[1:] for m in f["meta"].split(" · ")[1:]])}</p>
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
        rows = [(k, v) for k, v in ((P["m_exp"], M.get("experience")), (P["m_appr"], M.get("approach"))) if v]
        body = paras(M["bio"]) + ("\n" + info(rows) if rows else "")
        body += '\n      <div class="actions more">\n' + btn_msg(L, "tea_master", L["msg_book_url"], P["cta"], "tlink") + "\n      </div>"
        master = f'''<section class="sec" id="tea-master">
  <div class="wrap master">
    {img(TEA_MASTER["photo"], M["alt"], "(min-width:900px) 40vw, 100vw", "master-ph", w=1120, h=1400)}
    <div class="copy">
      <h2 class="rv">{P["m_h2"]}</h2>
      <p class="master-role"><strong>{M["name"]}</strong><span>{M["role"]}</span></p>
{body}
    </div>
  </div>
</section>'''
    how = split(P["how_h2"], "      " + steps(P["how"]) + read_more(L, ["what-happens-at-a-chinese-tea-ceremony"]), sid="how")
    pr = split(P["info_h2"], "      " + info(P["info"]) + "\n      <div class=\"actions more\">\n"
               + btn_msg(L, "ceremonies_info", L["msg_book_url"], P["cta"]) + "\n        "
               + tlink(L["lp"] + "events/", P["to_events"]) + "\n      </div>", "sec sand", "visit")
    head = "".join(f'<th scope="col">{h}</th>' for h in P["cmp_head"])
    rows = table_rows(P["cmp_head"], P["cmp"])
    compare = split(P["cmp_h2"], f'      <div class="tbl"><table><thead><tr>{head}</tr></thead><tbody>{rows}</tbody></table></div>', sid="compare")
    private = split(P["priv_h2"], paras(P["priv"]) + '\n      <p class="more">'
                    + tlink(L["lp"] + "wholesale/#experiences", P["priv_cta"]) + "</p>", "sec sand", "private")
    return "\n\n".join(x for x in [hero(L, P, actions, "people/4_people", P["alt_hero"]), formats, compare, master, how,
                                    private, pr] if x)


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
    head = "".join(f'<th scope="col">{h}</th>' for h in P["diff_head"])
    rows = table_rows(P["diff_head"], P["diff"])
    diff = split(P["diff_h2"], f'      <p>{P["diff_lead"]}</p>\n      <div class="tbl"><table><thead><tr>{head}</tr></thead><tbody>{rows}</tbody></table></div>', sid="differences")
    ware = split(P["ware_h2"], paras(P["ware"]) + read_more(L, ["sheng-vs-shou-pu-erh", "how-to-brew-chinese-tea-at-home"]), sid="teaware")
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
    return "\n\n".join([hero(L, P, actions, "interior/2_shop", P["alt_hero"]), origin, cats, diff, ware, shop])


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
    what = split(P["what_h2"], paras(P["what"]) + read_more(L, ["matcha-vs-green-tea"])
                 + f'\n      <p class="muted more">{P["biz"]} <a class="inl" href="{L["lp"]}wholesale/#supply">{P["biz_link"]}</a></p>', "sec", "about-matcha")
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
    private = split(P["priv_h2"], paras(P["priv"]) + '\n      <p class="more">'
                    + tlink(L["lp"] + "wholesale/#experiences", P["priv_cta"]) + "</p>", "sec", "private")
    return "\n\n".join([hero(L, P, actions, "people/2_people", P["alt_hero"]), lst, join, private])


def contact(L, P, cfg):
    actions = "\n".join([btn_dir(L, "contact_hero"),
                         btn_msg(L, "contact_hero", L["msg_url"], L["cta_message"], "tlink")])
    q = "Moychay+Phuket,+Boat+Avenue,+Bang+Tao,+Phuket"
    rows = [(L["find_addr_l"], "Moychay Phuket<br>" + L["addr_full"]), (L["find_hours_l"], L["hours"]),
            (L["find_park_l"], L["find_park"]), (L["find_msg_l"], L["find_msgs"]),
            (L["find_call_l"], L["find_call"].replace('data-place="find"', 'data-place="contact"')), (P["social_l"], P["social"])]
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
    actions = "\n".join(['        <a class="btn" href="#request" data-track="wholesale_contact_click" data-place="wholesale_hero">' + P["cta"] + "</a>",
                         btn_msg(L, "wholesale_hero", L["msg_url"], L["cta_message"], "tlink")])
    # who: business types as an editorial index, not cards
    segs = "".join(f'<li><h3>{n}</h3><p>{x}</p></li>' for n, x in P["segments"])
    who = f'''<section class="sec" id="who">
  <div class="wrap split">
    <div>
      <h2 class="rv">{P["who_h2"]}</h2>
      <p class="muted">{P["who_note"]}</p>
    </div>
    <ul class="seg">{segs}</ul>
  </div>
</section>'''
    offers = "".join(f'<li id="{oid}"><h3>{n}</h3><p>{x}</p><p class="offer-inc">{inc}</p></li>' for oid, n, x, inc in P["offers"])
    formats = f'''<section class="sec sand" id="formats">
  <div class="wrap split">
    <div>
      <h2 class="rv">{P["offers_h2"]}</h2>
      <p class="muted">{P["offers_note"]}</p>
    </div>
    <ol class="offer">{offers}</ol>
  </div>
</section>'''
    products = f'''<section class="about plain" id="products">
  <div class="wrap">
    {img("interior/3_shop", P["alt_products"], "(min-width:900px) 60vw, 100vw", "about-ph")}
    <div class="copy rv">
      <h2>{P["products_h2"]}</h2>
      <ul class="list2">{"".join(f"<li>{x}</li>" for x in P["products"])}</ul>
      <p class="muted more">{P["products_note"]}</p>
      <p class="more">{tlink(L["lp"] + "tea/", P["to_tea"])}</p>
    </div>
  </div>
</section>'''
    how = split(P["how_h2"], "      " + steps(P["how"]) + read_more(L, ["how-to-choose-tea-for-a-cafe-or-restaurant"]), sid="how")
    terms = split(P["terms_h2"], paras(P["terms"]), "sec sand", "terms")
    partners = ""
    if PARTNERS:
        items = "".join(
            f'<li><img src="{{{{root}}}}img/partners/{p["logo"]}" alt="{escape(p["name"])}" loading="lazy" decoding="async">'
            f'<p><strong>{escape(p["name"])}</strong><br>{p[L["lang"]]["format"]}</p>'
            + (f'<p class="muted">{p[L["lang"]]["case"]}</p>' if p[L["lang"]].get("case") else "") + "</li>"
            for p in PARTNERS)
        partners = f'''<section class="sec" id="partners">
  <div class="wrap split">
    <h2 class="rv">{P["partners_h2"]}</h2>
    <ul class="partners">{items}</ul>
  </div>
</section>'''
    faq_items = "\n".join(f'''      <li>
        <button class="faq-q" type="button" aria-expanded="false" aria-controls="wfaq-{n}">{q}<svg class="ico" aria-hidden="true"><use href="#i-plus"/></svg></button>
        <div class="acc-p" id="wfaq-{n}"><div><p>{a}</p></div></div>
      </li>''' for n, (q, a) in enumerate(P["faq"], 1))
    faq = f'''<section class="faq" id="faq">
  <div class="wrap">
    <h2 class="rv">{P["faq_h2"]}</h2>
    <ul class="faq-list">
{faq_items}
    </ul>
  </div>
</section>'''
    frm = f'''<section class="sec sand" id="request">
  <div class="wrap split">
    <div>
      <h2 class="rv">{P["form_h2"]}</h2>
      <p class="muted">{P["form_lead"]}</p>
      <div class="muted more"><p>{P["direct"]}</p>{L["find_call"].replace('data-place="find"', 'data-place="wholesale"')}</div>
    </div>
  {form(L, "wholesale", cfg["cfg_form_endpoint"], cfg["cfg_turnstile_sitekey"])}
  </div>
</section>'''
    nums = "".join(f"<li><b>{a}</b><span>{b}</span></li>" for a, b in P["net_nums"])
    network = split(P["net_h2"], paras(P["net"]), sid="network")
    stats = f'''<section class="stats" aria-label="{P["net_h2"]}">
  <div class="wrap">
    <ul class="stats-list">{nums}</ul>
  </div>
</section>'''
    return "\n\n".join(x for x in [hero(L, P, actions, "people/6_people", P["alt_hero"]), network, stats, who, formats, products,
                                    how, terms, partners, faq, frm] if x)


BUILDERS = dict(ceremonies=ceremonies, tea=tea, matcha=matcha, events=events, contact=contact, wholesale=wholesale)


def _social(items):
    li = "".join(f'<li><a href="{u}" target="_blank" rel="noopener" data-track="{tr}" data-place="contact">'
                 f'<svg class="bi" aria-hidden="true"><use href="#{i}"/></svg>{n}</a></li>' for n, u, tr, i in items)
    return f'<ul class="clinks">{li}</ul>'


IG = ("Instagram", "https://www.instagram.com/moychay.phuket", "instagram", "i-ig")
FB = ("Facebook", "https://www.facebook.com/moychay.phuket/", "facebook", "i-fb")
SOCIAL_EN = _social([IG, FB])
SOCIAL_RU = _social([IG, FB, ("Чайный клуб в Telegram", "https://t.me/moychayphuket", "telegram_club", "i-tg")])

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
                ("Hours", "Open daily 11:00-22:00"),
                ("Booking", "Needed for the gong fu cha ceremony and group ceremonies – message us on WhatsApp. Walk-in tastings need no booking."),
                ("Experience", "Not needed. Most guests try a tea ceremony for the first time."),
                ("Duration and price", "Walk-in tasting – about 10 minutes, 300฿ + tea by weight. Gong fu cha – 60 minutes + up to 60 minutes to relax, 600฿ per person. Groups – price on request."),
                ("Languages", "Thai, English and Russian"),
            ],
            to_events="Tea events this week",
            cmp_h2="Which format to choose",
            cmp_head=["Format", "Time", "Booking", "Price", "Good for"],
            cmp=[["Walk-in tasting (Pin Cha)", "About 10 minutes, then you stay with your tea", "Not needed", "300฿ + tea by weight", "A first acquaintance with Chinese tea, a short visit"],
                 ["Gong fu cha ceremony", "60 minutes + up to 60 minutes to relax", "Required", "600฿ per person", "An unhurried hour with the tea master"],
                 ["Group ceremony", "Agreed with you", "Required", "On request", "Birthdays, team events and gatherings of up to 30 guests"]],
            priv_h2="Ceremonies for hotels, teams and private events",
            priv=["We also hold tea ceremonies and tastings outside the tea house – for hotel guests, private groups, client meetings and residents' events, in English or Russian.",
                  "The duration, number of guests, host, teaware, space and travel are agreed for each event."],
            priv_cta="Tea experiences for businesses",
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
                ("Часы работы", "Ежедневно 11:00-22:00"),
                ("Запись", "Нужна на церемонию гунфу ча и групповые церемонии – напишите нам в Telegram. На дегустацию записываться не нужно."),
                ("Опыт", "Не нужен. Большинство гостей пробуют чайную церемонию впервые."),
                ("Длительность и цена", "Дегустация – около 10 минут, 300฿ + чай по весу. Гунфу ча – 60 минут + до 60 минут отдыха, 600฿ с человека. Группы – цена по запросу."),
                ("Языки", "Тайский, английский и русский"),
            ],
            to_events="Чайные мероприятия на неделе",
            cmp_h2="Какой формат выбрать",
            cmp_head=["Формат", "Время", "Запись", "Цена", "Подходит для"],
            cmp=[["Дегустация без записи (Пин Ча)", "Около 10 минут, потом остаётесь с чаем", "Не нужна", "300฿ + чай по весу", "Первого знакомства с китайским чаем, короткого визита"],
                 ["Церемония гунфу ча", "60 минут + до 60 минут отдыха", "Нужна", "600฿ с человека", "Неспешного часа с чайным мастером"],
                 ["Групповая церемония", "Согласуем с вами", "Нужна", "По запросу", "Дней рождения, командных встреч и праздников до 30 гостей"]],
            priv_h2="Церемонии для отелей, команд и частных событий",
            priv=["Мы проводим чайные церемонии и дегустации и вне чайной – для гостей отелей, частных групп, клиентских встреч и мероприятий резидентов, на русском или английском.",
                  "Длительность, число гостей, ведущего, посуду, пространство и выезд согласуем под каждое событие."],
            priv_cta="Чайные мероприятия для бизнеса",
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
                "Moychay Phuket is part of Moychay – an international tea culture company founded in 2009 and based in Amsterdam, with tea clubs in Barcelona, Yerevan, Tbilisi, Phuket and Atlanta. Moychay works directly with more than 700 suppliers, tea farmers and artisan workshops in China, Japan, Vietnam, Thailand and Georgia, and sells only natural loose-leaf tea – no artificially flavoured teas.",
                "Moychay's founder Sergey Moychay has spent more than 20 years travelling China's tea regions and working directly with farmers and tea masters. He is the author of the book Geography of Chinese Tea.",
                "No need to know any of this before you come. Point at a jar, and the tea master will brew it for you.",
            ],
            cats_h2="Teas on our shelves",
            cats_lead="Every category below can be tasted at the tea house – at a walk-in tasting or during a ceremony.",
            alt_cats="Shelves of clay teapots and porcelain cups",
            to_cer="Tea ceremonies and tastings",
            diff_h2="How the main categories differ",
            diff_lead="The difference starts with how the leaf is processed after picking. A short guide – the tea master will tell you more at the table.",
            diff_head=["Category", "How it is made", "Character"],
            diff=[["White tea", "Withered and dried with minimal processing", "Light and delicate"],
                  ["Green tea", "Heated soon after picking to stop oxidation", "Fresh, grassy, bright"],
                  ["Oolong", "Partly oxidised; dark oolongs are also roasted", "From floral and sweet to roasted and rich"],
                  ["Red tea", "Fully oxidised", "Warming and smooth"],
                  ["Sheng pu-erh", "Pressed and aged slowly", "Lively when young, deep with age"],
                  ["Shu pu-erh and dark tea", "Fermented in a moist pile for weeks", "Earthy and smooth"],
                  ["Herbal tea", "Herbs, flowers and fruit – no tea leaf", "Caffeine-free"]],
            ware_h2="Teaware and antiques",
            ware=[
                "Clay teapots, porcelain cups and antique teaware on our shelves are a real collection for sale, not decor.",
                "The tea master will help you choose a teapot for the tea you like.",
            ],
            shop_h2="Buy tea online",
            shop_text="Tea and teaware from our online shop, delivered anywhere in Thailand – free on online orders over 2000฿. We ship worldwide with DHL, and the promo code MOYCHAY gives a discount.",
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
                "Moychay Phuket – часть Moychay, международной компании чайной культуры. Она основана в 2009 году, штаб-квартира – в Амстердаме, чайные клубы – в Барселоне, Ереване, Тбилиси, на Пхукете и в Атланте. Moychay работает напрямую с более чем 700 поставщиками, чайными фермерами и мастерскими в Китае, Японии, Вьетнаме, Таиланде и Грузии и продаёт только натуральный листовой чай – без ароматизаторов.",
                "Основатель Moychay Сергей Мойчай больше 20 лет путешествует по чайным регионам Китая и работает напрямую с фермерами и чайными мастерами. Он автор книги «География китайского чая».",
                "Заранее разбираться не нужно. Покажите на банку – и чайный мастер заварит.",
            ],
            cats_h2="Чай на наших полках",
            cats_lead="Любую категорию можно попробовать в чайной – на дегустации или во время церемонии.",
            alt_cats="Полки с глиняными чайниками и фарфоровыми чашками",
            to_cer="Чайные церемонии и дегустации",
            diff_h2="Чем отличаются основные категории",
            diff_lead="Разница начинается с того, как обрабатывают лист после сбора. Коротко – а подробнее расскажет чайный мастер за столом.",
            diff_head=["Категория", "Как делают", "Характер"],
            diff=[["Белый чай", "Завяливают и сушат при минимальной обработке", "Лёгкий и деликатный"],
                  ["Зелёный чай", "Вскоре после сбора прогревают, чтобы остановить окисление", "Свежий, травянистый, яркий"],
                  ["Улун", "Частично окисляют; тёмные улуны ещё и обжаривают", "От цветочного и сладкого до обжаренного и насыщенного"],
                  ["Красный чай", "Полностью окисляют", "Согревающий и мягкий"],
                  ["Шэн пуэр", "Прессуют и медленно выдерживают", "Живой в молодости, глубокий с годами"],
                  ["Шу пуэр и тёмные чаи", "Неделями ферментируют во влажной куче", "Землистый и мягкий"],
                  ["Травяной чай", "Травы, цветы и фрукты – без чайного листа", "Без кофеина"]],
            ware_h2="Посуда и антиквариат",
            ware=[
                "Глиняные чайники, фарфоровые чашки и антикварная посуда на наших полках – настоящая коллекция, её можно купить.",
                "Чайный мастер поможет подобрать чайник под ваш чай.",
            ],
            shop_h2="Купить чай онлайн",
            shop_text="Чай и посуда из нашего интернет-магазина с доставкой по всему Таиланду – бесплатно при онлайн-заказе от 2000฿. По всему миру отправляем через DHL, а по промокоду MOYCHAY – скидка.",
        ),
    ),
    matcha=dict(
        en=dict(
            title="Matcha in Phuket – Matcha Tea &amp; Drinks | Moychay Phuket",
            desc="Matcha lattes and matcha tonics at Moychay Phuket on Boat Avenue, Bangtao. Non-alcoholic matcha drinks from 250฿, to stay or to go. Open daily 11:00-22:00.",
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
                ("Hours", "Open daily 11:00-22:00"),
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
            biz="Matcha and tea bases for drinks are also available for cafés, hotels and studios.",
            biz_link="Tea for your business",
        ),
        ru=dict(
            title="Матча на Пхукете – Чай и напитки с матчей | Moychay",
            desc="Матча-латте и тоники с матчей в Moychay Phuket на Boat Avenue, Бангтао. Безалкогольные напитки с матчей от 250฿, здесь или с собой. Ежедневно 11:00-22:00.",
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
                ("Часы работы", "Ежедневно 11:00-22:00"),
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
            biz="Матчу и чайные основы для напитков поставляем и кафе, отелям и студиям.",
            biz_link="Чай для бизнеса",
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
            priv_h2="Private and corporate tea events",
            priv=["The schedule above is for public events. For a private tasting, a team event, an event for hotel guests or a ceremony at your venue, we prepare a separate programme."],
            priv_cta="Tea experiences for businesses",
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
            priv_h2="Частные и корпоративные чайные события",
            priv=["Выше – расписание открытых мероприятий. Для частной дегустации, командной встречи, события для гостей отеля или церемонии на вашей площадке готовим отдельную программу."],
            priv_cta="Чайные мероприятия для бизнеса",
        ),
    ),
    contact=dict(
        en=dict(
            title="Contact &amp; Visit Moychay Phuket | Tea House in Bangtao",
            desc="Moychay Phuket tea house: 2nd floor, Boat Avenue, Bangtao, Phuket. Open daily 11:00-22:00. Get directions, message us on WhatsApp or write to us.",
            crumb="Contact", h1="Visit Moychay Phuket",
            lead="2nd floor, Boat Avenue, Bangtao. Open daily 11:00-22:00 – for a walk-in tasting just come by.",
            alt_hero="Moychay Phuket entrance on Boat Avenue",
            visit_h2="Address and contacts",
            social_l="Follow us",
            social=SOCIAL_EN,
            form_h2="Get in touch",
            form_lead="For bookings the quickest way is WhatsApp. For anything else, write to us here and we'll reply by email.",
        ),
        ru=dict(
            title="Контакты Moychay Phuket – Чайная в Бангтао",
            desc="Чайная Moychay Phuket: 2 этаж, Boat Avenue, Бангтао, Пхукет. Ежедневно 11:00-22:00. Маршрут, Telegram, WhatsApp и форма обратной связи.",
            crumb="Контакты", h1="Контакты Moychay Phuket",
            lead="2 этаж, Boat Avenue, Бангтао. Ежедневно 11:00-22:00 – на дегустацию можно прийти без записи.",
            alt_hero="Вход в Moychay Phuket на Boat Avenue",
            visit_h2="Адрес и контакты",
            social_l="Соцсети",
            social=SOCIAL_RU,
            form_h2="Напишите нам",
            form_lead="Записаться на церемонию быстрее всего в Telegram. По другим вопросам напишите здесь – ответим на email.",
        ),
    ),
    wholesale=dict(
        en=dict(
            title="Wholesale Tea &amp; Tea Solutions in Phuket | Moychay",
            desc="Tea supplier for restaurants, cafés, hotels and spas in Phuket: Chinese tea, matcha, tea menus, staff training, corporate gifts and private tea ceremonies.",
            crumb="Wholesale", h1="Wholesale tea &amp; tea solutions for businesses in Phuket",
            lead="We supply tea and help businesses create thoughtful tea experiences – from café and restaurant menus to guest service, staff training and private events.",
            cta="Discuss a partnership",
            alt_hero="Guests at a tea gathering at Moychay Phuket",
            net_h2="Part of the Moychay network",
            net=["Moychay Phuket is part of Moychay, an international tea culture company founded in 2009 in Amsterdam. Moychay works directly with tea farmers, tea factories and artisan workshops, places a strong emphasis on quality control and sells only natural loose-leaf tea.",
                 "For your business this means a range built on direct sourcing, and a local team on Boat Avenue that brews, serves and talks about tea every day."],
            net_nums=[("2009", "Moychay was founded in Amsterdam"), ("700+", "suppliers, tea farmers and production partners"), ("6", "cities with Moychay tea clubs: Amsterdam, Barcelona, Yerevan, Tbilisi, Phuket and Atlanta")],
            who_h2="Who we work with",
            who_note="Directions we can discuss with your team. Every proposal is built around your venue and your guests.",
            segments=[
                ("Restaurants &amp; cafés", "Tea for the menu, teas chosen for your kitchen, tea and food pairings, tea-based drinks and staff preparation."),
                ("Hotels &amp; resorts", "Welcome tea, tea at breakfast and in guest rooms, gifts for guests, tea corners and tea events for guests."),
                ("Spa &amp; wellness", "Tea service after treatments, a selection of drinks, tastings and tea events."),
                ("Fitness &amp; yoga studios", "Drinks, a tea shelf and themed gatherings for your community."),
                ("Real estate &amp; luxury hospitality", "Tea for client meetings, gift sets, branded teaware and tea events for residents."),
            ],
            offers_h2="What we can create together",
            offers_note="The products and the cost of additional services are set out in an individual proposal for your business.",
            offers=[
                ("supply", "Tea supply &amp; menu development", "A tea range chosen for your kitchen, your budget and the way you brew.",
                 "Tea supply, choice of teas, pairings with dishes, tea bases for drinks, including matcha and iced tea, recipe cards for your team"),
                ("training", "Staff training", "Your team learns to brew and serve tea the same way every time, in a language agreed with you.",
                 "Brewing and serving, standard steps, working with teaware, storage and brewing recommendations"),
                ("corners", "Tea corners &amp; retail shelves", "From a shelf of packaged tea that guests buy themselves to a corner where tea is prepared, or a separate tea room.",
                 "Tea shelf, tea corner with preparation, choice of teaware, design of the space"),
                ("gifts", "Corporate gifts &amp; branded teaware", "Gift sets and teaware for guests, clients and partners.",
                 "Gift sets, tea and teaware, packaging in your design, teaware with your brand, made to an agreed sample"),
                ("experiences", "Private tea experiences", "Tea ceremonies in English and Russian for hotel guests, private groups, client meetings and residents' events.",
                 "Ceremonies at your venue, group tastings, private events, themed evenings for clubs and studios"),
            ],
            products_h2="Products for your business",
            products=["Chinese tea and herbal blends", "Matcha", "Tea bases for drinks", "Non-alcoholic kombucha brewed on our tea",
                      "Wild honey from Chiang Mai", "Teaware and gift sets"],
            products_note="Range, packaging and prices are agreed for each order. For kombucha, the supply format and the product specification are agreed separately.",
            alt_products="Shelves of clay teapots and porcelain cups at Moychay Phuket",
            to_tea="Teas on our shelves",
            how_h2="How we work together",
            how=[
                ("Consultation", "We talk about your venue, your guests and what tea should do for them."),
                ("Tea selection &amp; tasting", "We choose the range and the way of serving, and taste the teas together."),
                ("Proposal", "We agree on products, services and commercial terms in an individual proposal."),
                ("Launch &amp; ongoing supply", "We train the team, check the service together and agree on a reorder schedule."),
            ],
            terms_h2="Wholesale terms",
            terms=["Wholesale terms depend on your order and the products selected. Contact us for a tailored quotation.",
                   "A chain can start with one location and add the others once the format works."],
            partners_h2="Our partners",
            faq_h2="Questions from businesses",
            faq=[
                ("Can we taste the teas before ordering?", "Yes – tasting is part of choosing the range. We'll agree on the format together, and you're always welcome at our tea house on Boat Avenue."),
                ("Do you train our staff?", "Yes. We prepare the training and recipe cards in a language agreed with your team."),
                ("Can a chain start with one location?", "Yes. You can start with one venue and expand once the format works."),
                ("How are prices calculated?", "They depend on the products, the volumes and the services included. Final terms are fixed in an individual commercial proposal."),
                ("Can you hold a tea ceremony at our venue?", "Yes. We agree on the duration, the number of guests, the host, teaware, space and travel. Ceremonies are held in English or Russian."),
            ],
            form_h2="Discuss a partnership",
            form_lead="Tell us about your business and what you need. We'll reply by email with the next steps.",
            direct="Prefer to call or email? Official enquiries:",
        ),
        ru=dict(
            title="Чай оптом и решения для бизнеса на Пхукете | Moychay",
            desc="Поставщик чая для ресторанов, кафе, отелей и SPA на Пхукете: китайский чай, матча, чайное меню, обучение персонала, подарки и выездные церемонии.",
            crumb="Оптовые поставки", h1="Чай и чайные решения для бизнеса на Пхукете",
            lead="Поставляем качественный чай и помогаем организовать чайный сервис – от меню кафе и ресторанов до обучения персонала, подарков и мероприятий.",
            cta="Обсудить сотрудничество",
            alt_hero="Гости на чайной встрече в Moychay Phuket",
            net_h2="Часть сети Moychay",
            net=["Moychay Phuket – часть Moychay, международной компании чайной культуры, основанной в 2009 году в Амстердаме. Moychay работает напрямую с чайными фермерами, фабриками и мастерскими, уделяет большое внимание контролю качества и продаёт только натуральный листовой чай.",
                 "Для вашего бизнеса это ассортимент, основанный на прямых поставках, и местная команда на Boat Avenue, которая каждый день заваривает, подаёт и рассказывает о чае."],
            net_nums=[("2009", "год основания Moychay в Амстердаме"), ("700+", "поставщиков, чайных фермеров и производственных партнёров"), ("6", "городов с чайными клубами Moychay: Амстердам, Барселона, Ереван, Тбилиси, Пхукет и Атланта")],
            who_h2="Для каких заведений",
            who_note="Направления, которые можно обсудить с вашей командой. Каждое предложение строим под заведение и ваших гостей.",
            segments=[
                ("Рестораны и кафе", "Чай для меню, подбор сортов под кухню, сочетания чая с блюдами, чайные напитки и подготовка персонала."),
                ("Отели и курорты", "Welcome tea, чай на завтраках и в номерах, подарки гостям, чайные уголки и чайные события для гостей."),
                ("SPA и wellness", "Чайная подача после процедур, подбор напитков, дегустации и чайные события."),
                ("Фитнес и йога-студии", "Напитки, чайная полка и тематические встречи для сообщества."),
                ("Недвижимость и luxury hospitality", "Чай для встреч с клиентами, подарочные наборы, посуда с брендом и чайные мероприятия для резидентов."),
            ],
            offers_h2="Форматы сотрудничества",
            offers_note="Состав поставки и стоимость дополнительных услуг фиксируем в индивидуальном предложении.",
            offers=[
                ("supply", "Поставки чая и чайное меню", "Ассортимент под вашу кухню, бюджет и способ приготовления.",
                 "Поставки чая, подбор сортов, сочетания с блюдами, чайные основы для напитков, в том числе матча и холодный чай, техкарты для команды"),
                ("training", "Обучение персонала", "Команда учится готовить и подавать чай одинаково хорошо – на согласованном с вами языке.",
                 "Приготовление и подача, стандарты, работа с чайной посудой, рекомендации по хранению и завариванию"),
                ("corners", "Чайная полка и чайный уголок", "От полки с упакованным чаем, где гость выбирает сам, до уголка с приготовлением или отдельной чайной комнаты.",
                 "Чайная полка, уголок с приготовлением, подбор посуды, оформление пространства"),
                ("gifts", "Корпоративные подарки и посуда с брендом", "Подарочные наборы и посуда для гостей, клиентов и партнёров.",
                 "Подарочные наборы, чай и посуда, упаковка в вашем оформлении, посуда с вашим брендом по согласованному образцу"),
                ("experiences", "Частные чайные мероприятия", "Чайные церемонии на русском и английском для гостей отелей, частных групп, клиентских встреч и мероприятий резидентов.",
                 "Выездные церемонии, групповые дегустации, частные мероприятия, тематические вечера для клубов и студий"),
            ],
            products_h2="Продукты для бизнеса",
            products=["Китайский чай и травяные сборы", "Матча", "Чайные основы для напитков", "Безалкогольная комбуча на нашем чае",
                      "Дикий мёд из Чиангмая", "Посуда и подарочные наборы"],
            products_note="Ассортимент, фасовку и цены согласуем под каждый заказ. Для комбучи формат поставки и спецификацию продукта согласуем отдельно.",
            alt_products="Полки с глиняными чайниками и фарфоровыми чашками в Moychay Phuket",
            to_tea="Чай на наших полках",
            how_h2="Как проходит сотрудничество",
            how=[
                ("Обсуждаем задачи", "Говорим о заведении, гостях и о том, какую роль в сервисе должен играть чай."),
                ("Подбираем ассортимент и проводим дегустацию", "Выбираем сорта и способ подачи, пробуем чай вместе."),
                ("Согласовываем предложение", "Фиксируем товары, услуги и коммерческие условия в индивидуальном предложении."),
                ("Организуем запуск и поставки", "Обучаем команду, вместе проверяем подачу и договариваемся о графике пополнения."),
            ],
            terms_h2="Оптовые условия",
            terms=["Оптовые условия зависят от объёма и состава заказа. Подготовим индивидуальное предложение для вашего бизнеса.",
                   "Сетевой проект можно начать с одного заведения и подключить остальные, когда формат себя покажет."],
            partners_h2="Наши партнёры",
            faq_h2="Вопросы от бизнеса",
            faq=[
                ("Можно ли попробовать чай до заказа?", "Да – дегустация входит в подбор ассортимента. Формат обсудим вместе, а в нашей чайной на Boat Avenue вам всегда рады."),
                ("Вы обучаете персонал?", "Да. Готовим обучение и техкарты на согласованном с вашей командой языке."),
                ("Может ли сеть начать с одного заведения?", "Да. Можно начать с одной площадки и расширяться, когда формат заработает."),
                ("Как формируется цена?", "Она зависит от товаров, объёмов и включённых услуг. Окончательные условия фиксируются в индивидуальном коммерческом предложении."),
                ("Можете провести чайную церемонию у нас?", "Да. Согласуем длительность, число гостей, ведущего, посуду, пространство и выезд. Церемонии проводим на русском или английском."),
            ],
            form_h2="Обсудить сотрудничество",
            form_lead="Расскажите о бизнесе и о том, что вам нужно. Ответим на email и предложим следующие шаги.",
            direct="Удобнее позвонить или написать на почту? Для официальных запросов:",
        ),
    ),
)

# Page order (footer, sitemap)
SLUGS = ["ceremonies", "tea", "matcha", "events", "contact", "wholesale"]
