#!/usr/bin/env python3
"""Bhoomi Lens weekly re-check. Free to run (GitHub Actions + public pages + Google News RSS).
For every tracked project it:
  1. pulls the last 14 days of Google News headlines for the project name, keeping only ones
     that contain a status keyword (cancelled, terminated, tender, delay, land acquisition, inaugurated ...);
  2. re-fetches the project's own source links and notes if the page text changed.
Nothing here changes a project's status automatically. Hits are written to data/updates.js as
"needs review" so a person (or a later step) confirms them before the model uses them."""
import json, re, sys, time, hashlib, html, urllib.request, urllib.parse, datetime, os
import xml.etree.ElementTree as ET
from email.utils import parsedate_to_datetime
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UA = {"User-Agent": "BhoomiLens-recheck/1.0 (+https://github.com/Hasen1506/Ideas)"}
KW = {
  "cancelled": r"\b(cancel+ed|scrapp?ed|dropped|shelved|withdrawn)\b", "terminated": r"\b(terminat\w+|foreclos\w+)\b",
  "tender": r"\b(tender\w*|bid\w*|L1|awarded|contract)\b", "delay": r"\b(delay\w*|deadline|extended|stalled|halt\w*)\b",
  "land": r"\b(land acquisition|3A|3D|notification|acquir\w+|compensation)\b", "opened": r"\b(inaugurat\w+|opened|open to traffic|commission\w*|trial run)\b",
  "approved": r"\b(approv\w+|sanction\w*|cabinet nod|DPR)\b",
}
def get(url, t=20):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=t) as r: return r.read()
def load_projects():
    s = open(os.path.join(ROOT, "data/projects.js"), encoding="utf-8").read()
    return json.loads(s[s.index("["):].rstrip().rstrip(";"))
def news(name, days=14):
    q = '"%s" when:%dd' % (re.sub(r"\s*\(.*?\)", "", name).strip(), days)
    url = "https://news.google.com/rss/search?" + urllib.parse.urlencode({"q": q, "hl": "en-IN", "gl": "IN", "ceid": "IN:en"})
    root = ET.fromstring(get(url))
    if root.tag != "rss" or root.find("channel") is None:
        raise ValueError("News response is not an RSS channel")
    out = []
    for it in root.findall("./channel/item")[:20]:
        t = html.unescape(re.sub(r"<.*?>", "", it.findtext("title") or ""))
        l = (it.findtext("link") or "").strip()
        d = it.findtext("pubDate") or ""
        tags = [k for k, rx in KW.items() if re.search(rx, t, re.I)]
        if tags:
            try: d = parsedate_to_datetime(d).date().isoformat()
            except Exception: d = ""
            out.append({"title": t[:220], "url": l, "date": d, "tags": tags})
    return out
def page_hash(url):
    try:
        b = get(url, 15).decode("utf-8", "ignore")
        txt = re.sub(r"\s+", " ", re.sub(r"<(script|style)[^>]*>.*?</\1>|<[^>]+>", " ", b, flags=re.S|re.I))
        return hashlib.sha1(txt.encode()).hexdigest()[:16]
    except Exception: return None

# Gazette land notices moved to their own job (scripts/gazette_job.py -> data/gazette.js, data/gazette_raw.json)
# in Oct 2026: the scraper kept hitting its timeout inside this job and both wrote updates.js.

def main(limit=None):
    P = load_projects()[: int(limit) if limit else None]
    if not P:
        raise RuntimeError("No projects to check")
    path = os.path.join(ROOT, "data/updates.js")
    prev = {"items": [], "hashes": {}}
    if os.path.exists(path):
        s = open(path, encoding="utf-8").read(); prev = json.loads(s[s.index("{"):].rstrip().rstrip(";"))
    today = datetime.date.today().isoformat(); seen = {(i["pid"], i.get("url")) for i in prev["items"]}
    items, hashes, n = list(prev["items"]), dict(prev.get("hashes", {})), 0
    coverage = {"news_attempted": 0, "news_ok": 0, "sources_attempted": 0, "sources_ok": 0}
    for p in P:
        coverage["news_attempted"] += 1
        try:
            hits = news(p["n"])
            coverage["news_ok"] += 1
            for h in hits:
                if (p["id"], h["url"]) in seen: continue
                items.append({"pid": p["id"], "kind": "news", "found": today, **h, "review": "needs review"}); n += 1
        except Exception as e: print("news fail", p["id"], e, file=sys.stderr)
        for k in ("src", "src2"):
            u = p.get(k)
            if not u: continue
            coverage["sources_attempted"] += 1
            hv = page_hash(u); key = p["id"] + "|" + k
            if hv: coverage["sources_ok"] += 1
            if hv and key in hashes and hashes[key] != hv:
                items.append({"pid": p["id"], "kind": "source-changed", "found": today, "title": "Official/source page changed since last check", "url": u, "date": today, "tags": [], "review": "needs review"}); n += 1
            if hv: hashes[key] = hv
        time.sleep(1.0)
    if not coverage["news_ok"]:
        raise RuntimeError("Every news request failed; keeping the previous re-check data")
    cutoff = (datetime.date.today() - datetime.timedelta(days=120)).isoformat()
    items = [i for i in items if i["found"] >= cutoff]
    items.sort(key=lambda i: (i.get("date") or i["found"]), reverse=True)
    out = {"gen": today, "checked": len(P), "coverage": coverage, "items": items, "hashes": hashes}
    open(path, "w", encoding="utf-8").write("/* Weekly re-check output (scripts/recheck.py). Items are leads to review, not confirmed status changes. */\nwindow.BL_UPDATES=" + json.dumps(out, ensure_ascii=False, separators=(",", ":")) + ";\n")
    print("checked", len(P), "new", n, "total", len(items), "coverage", json.dumps(coverage), flush=True)
if __name__ == "__main__": main(sys.argv[1] if len(sys.argv) > 1 else None)
