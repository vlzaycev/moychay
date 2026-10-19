"""The international Moychay network – one source for every page (home, /tea/, /wholesale/, EN/RU) and for Cha.
Cities with a Moychay tea house; the first is the headquarters. Add a new location here and rebuild.
Utrecht (Oudkerkhof 28) – the 7th location, announced by the founder in October 2026."""

CITIES = [
    # en, ru (nominative), ru (where: "в Барселоне")
    ("Amsterdam", "Амстердам", "в Амстердаме"),
    ("Barcelona", "Барселона", "в Барселоне"),
    ("Yerevan", "Ереван", "в Ереване"),
    ("Tbilisi", "Тбилиси", "в Тбилиси"),
    ("Phuket", "Пхукет", "на Пхукете"),
    ("Atlanta", "Атланта", "в Атланте"),
    ("Utrecht", "Утрехт", "в Утрехте"),
]
COUNT = len(CITIES)


def _join(items, last):
    return ", ".join(items[:-1]) + f" {last} " + items[-1]


def city_list(lang):
    """"Amsterdam, Barcelona, … and Utrecht" / "Амстердам, Барселона, … и Утрехт"."""
    return _join([c[0] for c in CITIES], "and") if lang == "en" else _join([c[1] for c in CITIES], "и")


def clubs_outside_hq(lang):
    """Tea clubs besides the headquarters: "Barcelona, …, Atlanta and Utrecht" / "в Барселоне, …, в Атланте и Утрехте"."""
    if lang == "en":
        return _join([c[0] for c in CITIES[1:]], "and")
    # Russian style of the existing text: "в Барселоне, Ереване, Тбилиси, на Пхукете, в Атланте и Утрехте" –
    # the preposition is repeated only when it changes
    out, prev = [], ""
    for loc in (c[2] for c in CITIES[1:]):
        prep, word = loc.split(" ", 1)
        out.append(word if prep == prev else loc)
        prev = prep
    return _join(out, "и")
