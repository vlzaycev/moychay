"""Knowledge base for Cha, the AI tea assistant: the site itself is the source of truth.

Run by build.py after the pages are built. For every English page it extracts the visible
content of <main> (headings, paragraphs, lists, tables) into a small Markdown file in
_content/assistant/site/. Hand-written facts (shop terms, booking, FAQ) live next to it in
_content/assistant/knowledge/. `npm run kb:push` in _server/chat-worker uploads both folders to D1.

The Worker never reads HTML at runtime and the whole site is not pasted into every prompt:
these files are the compact, structured business knowledge (~a few thousand tokens).
"""
import os
import re
from html.parser import HTMLParser

PAGES = [("home", "index.html", "/"), ("ceremonies", "ceremonies/index.html", "/ceremonies/"),
         ("tea", "tea/index.html", "/tea/"), ("matcha", "matcha/index.html", "/matcha/"),
         ("events", "events/index.html", "/events/"), ("contact", "contact/index.html", "/contact/"),
         ("wholesale", "wholesale/index.html", "/wholesale/")]

SKIP = {"script", "style", "svg", "form", "noscript", "template", "button", "iframe", "figure", "nav"}
VOID = {"br", "img", "input", "meta", "link", "source", "wbr", "hr", "area", "col", "embed", "track"}
BLOCK = {"h1": "# ", "h2": "## ", "h3": "### ", "p": "", "li": "- ", "tr": "| ", "dt": "", "dd": ""}


class _Main(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.depth_main = 0
        self.skip = 0
        self.out, self.buf, self.prefix = [], [], None
        self.cells = None

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "main":
            self.depth_main += 1
        if not self.depth_main:
            return
        # dynamic blocks are not knowledge: events are loaded live, forms are UI
        if tag in VOID:
            if tag == "br" and not self.skip:
                self.buf.append(" ")
            return
        if self.skip or tag in SKIP or a.get("aria-hidden") == "true" or "hidden" in a or "sr-only" in (a.get("class") or ""):
            self.skip += 1
            return
        if tag in ("span", "b", "small", "strong", "em") and self.buf:
            self.buf.append(" ")        # "<b>2009</b><span>founded</span>" → "2009 founded"
        if tag == "tr":
            self.cells = []
        elif tag in ("td", "th") and self.cells is not None:
            self.buf = []
        elif tag in BLOCK:
            self.flush()
            self.prefix = BLOCK[tag]

    def handle_endtag(self, tag):
        if tag == "main" and self.depth_main:
            self.flush()
            self.depth_main -= 1
            return
        if not self.depth_main:
            return
        if tag in VOID:
            return
        if self.skip:
            self.skip -= 1
            return
        if tag in ("td", "th") and self.cells is not None:
            self.cells.append(_clean("".join(self.buf)))
            self.buf = []
        elif tag == "tr" and self.cells is not None:
            if any(self.cells):
                self.out.append("| " + " | ".join(self.cells) + " |")
            self.cells = None
        elif tag in BLOCK:
            self.flush()

    def handle_startendtag(self, tag, attrs):    # <path/>, <use/>: never change the nesting depth
        if tag == "br" and self.depth_main and not self.skip:
            self.buf.append(" ")

    def handle_data(self, data):
        if self.depth_main and not self.skip:
            self.buf.append(data)

    def flush(self):
        text = _clean("".join(self.buf))
        if text and self.cells is None:
            self.out.append((self.prefix or "") + text)
        if self.cells is None:
            self.buf = []
        self.prefix = None


def _clean(s):
    return re.sub(r"\s+", " ", s).strip()


def extract(html):
    p = _Main()
    p.feed(html)
    p.flush()
    lines, seen = [], set()
    for line in p.out:
        if line in seen and not line.startswith("#"):
            continue                       # the same CTA text repeated in several blocks
        seen.add(line)
        if line.startswith("#") and lines:
            lines.append("")
        lines.append(line)
    return "\n".join(lines).strip() + "\n"


def build(root, site_url):
    out_dir = os.path.join(root, "_content", "assistant", "site")
    os.makedirs(out_dir, exist_ok=True)
    for name, path, url in PAGES:
        with open(os.path.join(root, path), encoding="utf-8") as f:
            body = extract(f.read())
        doc = (f"---\nid: site-{name}\ntitle: Page {url} (generated from the site, do not edit)\n"
               f"source: {site_url}{url}\n---\n" + body)
        with open(os.path.join(out_dir, f"{name}.md"), "w", encoding="utf-8") as f:
            f.write(doc)
    # payment and online-shop terms: one source (commerce.py) for the pages and for Cha
    import commerce
    with open(os.path.join(out_dir, "payment-and-offers.md"), "w", encoding="utf-8") as f:
        f.write(commerce.knowledge_md())
    print("built assistant knowledge from", len(PAGES), "pages")
