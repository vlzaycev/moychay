"""
Tea Knowledge (blog): Markdown articles in _content/blog/<slug>.<lang>.md → /blog/<slug>/ and /ru/blog/<slug>/.

Front matter (between --- lines), one "key: value" per line, lists as [a, b]:
  title, slug, description, language (en|ru), author, reviewer, published_at, updated_at (YYYY-MM-DD),
  hero_image (e.g. people/8_people), image_alt, category, related_pages ([ceremonies, tea, shop]),
  seo_title, seo_description, status (draft|published), verify ([...] facts for the tea master), photos ([...])

Publishing rules (enforced at build time):
  • only status: published AND a real published_at date go to the site, the sitemap and the footer;
  • drafts are rendered only to _preview/ (never published: GitHub Pages skips "_" folders);
  • no date is ever invented: the page shows the dates from the file, or none.
No dependencies: a small Markdown subset is converted here (headings, paragraphs, lists, tables, links, bold, italics, notes).
"""
import datetime
import html
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
CONTENT = os.path.join(os.path.dirname(HERE), "_content", "blog")
SITE = "https://teaphuket.com"
SHOP = "https://phuket.moychay.asia/"

FIELDS = {"title", "slug", "description", "language", "author", "reviewer", "published_at", "updated_at", "hero_image",
          "image_alt", "category", "related_pages", "seo_title", "seo_description", "status", "verify", "photos"}
PAGES = {"home": "", "ceremonies": "ceremonies/", "tea": "tea/", "matcha": "matcha/", "events": "events/",
         "contact": "contact/", "wholesale": "wholesale/"}


# ── loading ─────────────────────────────────────────────────────
def _value(v):
    v = v.strip()
    if v.startswith("[") and v.endswith("]"):
        return [x.strip().strip('"') for x in v[1:-1].split("|" if "|" in v else ",") if x.strip()]
    return v.strip('"')


def load():
    posts = []
    if not os.path.isdir(CONTENT):
        return posts
    for f in sorted(os.listdir(CONTENT)):
        if not f.endswith(".md"):
            continue
        raw = open(os.path.join(CONTENT, f), encoding="utf-8").read()
        m = re.match(r"---\n(.*?)\n---\n(.*)$", raw, re.S)
        if not m:
            raise SystemExit(f"{f}: missing front matter")
        meta = {}
        for line in m.group(1).splitlines():
            if not line.strip() or line.lstrip().startswith("#"):
                continue
            k, _, v = line.partition(":")
            k = k.strip()
            if k not in FIELDS:
                raise SystemExit(f"{f}: unknown field {k}")
            meta[k] = _value(v)
        meta.setdefault("status", "draft")
        for k in ("title", "slug", "description", "language", "category"):
            if not meta.get(k):
                raise SystemExit(f"{f}: {k} is required")
        if f != f"{meta['slug']}.{meta['language']}.md":
            raise SystemExit(f"{f}: file name must be <slug>.<language>.md")
        for k in ("published_at", "updated_at"):
            if meta.get(k):
                datetime.date.fromisoformat(meta[k])          # real dates only
        if meta["status"] == "published" and not meta.get("published_at"):
            raise SystemExit(f"{f}: a published article needs published_at (the real date)")
        meta["published"] = meta["status"] == "published"
        meta["body"] = m.group(2)
        meta["words"] = len(re.findall(r"\w+", m.group(2)))
        posts.append(meta)
    return posts


# ── Markdown subset ─────────────────────────────────────────────
def _inline(s, ctx):
    s = html.escape(s, quote=False)

    def link(m):
        text, href = m.group(1), m.group(2)
        if href.startswith("/"):
            return f'<a href="{href}" data-track="blog_cta_click" data-place="{ctx["slug"]}">{text}</a>'
        if href.startswith(SHOP):
            return f'<a href="{href}" target="_blank" rel="noopener" data-track="online_shop_click" data-place="blog">{text}</a>'
        return f'<a href="{href}" target="_blank" rel="noopener">{text}</a>'
    s = re.sub(r"\[([^\]]+)\]\(([^)\s]+)\)", link, s)
    s = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", s)
    s = re.sub(r"(?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?![\w*])", r"<em>\1</em>", s)
    return s


def markdown(text, ctx):
    out, lines, i = [], text.strip().split("\n"), 0
    while i < len(lines):
        line = lines[i]
        if not line.strip():
            i += 1
            continue
        if line.startswith("### "):
            out.append(f"<h3>{_inline(line[4:], ctx)}</h3>")
            i += 1
        elif line.startswith("## "):
            out.append(f"<h2>{_inline(line[3:], ctx)}</h2>")
            i += 1
        elif line.startswith("|"):
            rows = []
            while i < len(lines) and lines[i].startswith("|"):
                rows.append([c.strip() for c in lines[i].strip().strip("|").split("|")])
                i += 1
            head, body = rows[0], [r for r in rows[1:] if not all(re.fullmatch(r":?-+:?", c) for c in r)]
            th = "".join(f'<th scope="col">{_inline(c, ctx)}</th>' for c in head)
            trs = "".join("<tr>" + "".join((f'<th scope="row">{_inline(c, ctx)}</th>' if j == 0 else f'<td data-label="{html.escape(re.sub(r"[*_]", "", head[j]))}">{_inline(c, ctx)}</td>')
                                           for j, c in enumerate(r)) + "</tr>" for r in body)
            out.append(f'<div class="tbl"><table><thead><tr>{th}</tr></thead><tbody>{trs}</tbody></table></div>')
        elif re.match(r"(- |\d+\. )", line):
            ordered = bool(re.match(r"\d+\. ", line))
            items = []
            while i < len(lines) and re.match(r"(- |\d+\. )", lines[i]):
                items.append(re.sub(r"^(- |\d+\. )", "", lines[i]))
                i += 1
            tag = "ol" if ordered else "ul"
            out.append(f"<{tag}>" + "".join(f"<li>{_inline(x, ctx)}</li>" for x in items) + f"</{tag}>")
        elif line.startswith("> "):
            quote = []
            while i < len(lines) and lines[i].startswith("> "):
                quote.append(lines[i][2:])
                i += 1
            out.append(f'<aside class="note"><p>{_inline(" ".join(quote), ctx)}</p></aside>')
        else:
            para = []
            while i < len(lines) and lines[i].strip() and not re.match(r"(#{2,3} |\||- |\d+\. |> )", lines[i]):
                para.append(lines[i].strip())
                i += 1
            out.append(f"<p>{_inline(' '.join(para), ctx)}</p>")
    return "\n".join(out)


# ── helpers ─────────────────────────────────────────────────────
def lp(lang):
    return "/ru/" if lang == "ru" else "/"


def url(lang, slug=""):
    return f"{SITE}{lp(lang)}blog/{slug + '/' if slug else ''}"


def fmt_date(d, lang):
    d = datetime.date.fromisoformat(d)
    months = (["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"]
              if lang == "ru" else ["January", "February", "March", "April", "May", "June", "July", "August", "September",
                                    "October", "November", "December"])
    return f"{d.day} {months[d.month - 1]} {d.year}" if lang == "ru" else f"{d.day} {months[d.month - 1]} {d.year}"


def translation(posts, p):
    """The other-language version of the same article (same slug), if it exists and is visible at the same level."""
    for q in posts:
        if q["slug"] == p["slug"] and q["language"] != p["language"] and q["published"] == p["published"]:
            return q
    return None
