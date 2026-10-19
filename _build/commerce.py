"""Public commercial terms – the one place to change them. Used by the pages (build.py, pages.py) and by the
knowledge base of Cha (assistant_kb.py), so the site and the assistant always say the same thing.

PROMO_ENABLED = False keeps the promo percentage off the site and out of Cha's answers: the code itself is
shown as "a discount with the promo code", which the owner has confirmed. Set it to True only after the
discount size and its conditions are confirmed, then rebuild (python3 _build/build.py) and run `npm run kb:push`.
"""

SHOP_URL = "https://phuket.moychay.asia/"
FREE_SHIPPING_THB = 2000              # free delivery across Thailand from this order total (online shop)
WORLDWIDE_DHL = True                  # worldwide shipping with DHL (owner)

PROMO_CODE = "MOYCHAY"
PROMO_PERCENT = 10
PROMO_ENABLED = True                  # confirmed by the owner on 19.10.2026: 10 % off the first order in the online shop
PROMO_FIRST_ORDER = True              # the discount applies to the first order only

SBP_IN_STORE = True                   # roubles via SBP when paying at the tea house (RU pages only)
SBP_TELEGRAM_ORDERS = True            # also for tea ordered through Telegram (owner, 18.10.2026)


def thb(n, lang):
    """2000 → "2 000 ฿" (RU) / "฿2,000" (EN)."""
    return f"{n:,}".replace(",", " ") + " ฿" if lang == "ru" else f"฿{n:,}"


def promo_phrase(lang):
    """Short mention for running text (FAQ): "the promo code MOYCHAY gives 10% off your first order"."""
    if lang == "ru":
        return (f"по промокоду {PROMO_CODE} скидка {PROMO_PERCENT}%" + (" на первый заказ" if PROMO_FIRST_ORDER else "")) if PROMO_ENABLED \
            else f"по промокоду {PROMO_CODE} скидка"
    return (f"the promo code {PROMO_CODE} gives {PROMO_PERCENT}% off" + (" your first order" if PROMO_FIRST_ORDER else "")) if PROMO_ENABLED \
        else f"the promo code {PROMO_CODE} gives a discount"


def knowledge_md():
    """Payment and online-shop terms for Cha (English, like the rest of the knowledge base)."""
    promo = (f"- Promo code {PROMO_CODE} gives {PROMO_PERCENT}% off" + (" the first order" if PROMO_FIRST_ORDER else "") + " in the online shop. "
             "No other conditions are published (minimum order, end date, combining with other offers) – do not invent any; the shop applies the code at checkout."
             if PROMO_ENABLED else
             f"- Promo code {PROMO_CODE} gives a discount in the online shop. The size of the discount is not published – never state a percentage or conditions.")
    sbp = ["- Paying in Russian roubles via SBP (Sistema Bystrykh Platezhey, Russia's Faster Payments System) is possible "
           "at the tea house itself" + (" and for tea ordered through Telegram (https://t.me/moychay_phuket)." if SBP_TELEGRAM_ORDERS else "."),
           "- SBP is NOT available in the online shop phuket.moychay.asia. No exchange rate, fees or other SBP conditions are published – "
           "do not state any; for details offer to ask the team.",
           "- Prices stay in Thai baht (฿). Never convert prices into roubles."] if SBP_IN_STORE else []
    lines = ["---", "id: payment-and-offers", "title: Payment at the tea house and online shop offers (generated from _build/commerce.py)", "---",
             "# Payment at the tea house", *sbp,
             "", "# Online shop offers",
             f"- Official online shop: {SHOP_URL}",
             f"- Free delivery across Thailand on online orders from {FREE_SHIPPING_THB} THB.",
             *(["- Worldwide shipping with DHL."] if WORLDWIDE_DHL else []),
             promo]
    return "\n".join(lines) + "\n"
