#!/usr/bin/env python3
"""Bhoomi Lens weekly re-check. Free to run (GitHub Actions + public pages + Google News RSS).
For every tracked project it:
  1. pulls the last 14 days of Google News headlines for the project name, keeping only ones
     that contain a status keyword (cancelled, terminated, tender, delay, land acquisition, inaugurated ...);
  2. re-fetches the project's own source links and notes if the page text changed.
Nothing here changes a project's status automatically. Hits are written to data/updates.js as
"needs review" so a person (or a later step) confirms them before the model uses them."""
import json, re, sys, time, hashlib, html, urllib.request, urllib.parse, datetime, os
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
    x = get(url).decode("utf-8", "ignore"); out = []
    for it in re.findall(r"<item>(.*?)</item>", x, re.S)[:20]:
        t = html.unescape(re.sub(r"<.*?>", "", (re.search(r"<title>(.*?)</title>", it, re.S) or [None, ""])[1]))
        l = (re.search(r"<link>(.*?)</link>", it, re.S) or [None, ""])[1].strip()
        d = (re.search(r"<pubDate>(.*?)</pubDate>", it) or [None, ""])[1]
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

def gazette(prev):
    """Central Gazette land notices (NH 3A/3D) for all states via scripts/gazette_scraper.py, incremental and time-capped.
    Villages are placed on Census 2011 village points (approximate). Owner names are never kept."""
    import subprocess
    here = os.path.dirname(os.path.abspath(__file__)); work = os.path.join(ROOT, ".gz"); os.makedirs(work, exist_ok=True)
    store = os.path.join(work, "gz.json")
    json.dump({"records": (prev or {}).get("raw", [])}, open(store, "w"))
    try:
        subprocess.run([sys.executable, "-m", "pip", "install", "-q", "requests", "beautifulsoup4", "pyarrow"], check=False, timeout=300)
        subprocess.run([sys.executable, os.path.join(here, "gazette_scraper.py"), "--out", store, "--since", "2024-01-01"],
                       timeout=int(os.environ.get("GZ_MINUTES", "25")) * 60, check=False)
    except Exception as e: print("gazette step stopped:", e, file=sys.stderr)
    try: recs = json.load(open(store)).get("records", [])
    except Exception: recs = (prev or {}).get("raw", [])
    pts = {}
    try:
        import pyarrow.parquet as pq
        cv = os.path.join(work, "cv.parquet")
        if not os.path.exists(cv):
            open(cv, "wb").write(get("https://github.com/ramSeraph/indian_admin_boundaries/releases/download/census-2011/Census_Villages.parquet", 300))
        n = lambda x: re.sub(r"[^a-z]", "", re.sub(r"\(.*?\)|\d+", "", (x or "").lower()))
        for r in pq.read_table(cv, columns=["stname", "dtname", "vilname", "Long", "Lat"]).to_pylist():
            pts.setdefault((n(r["stname"]), n(r["dtname"])[:5], n(r["vilname"])), (round(r["Long"], 5), round(r["Lat"], 5)))
    except Exception as e: print("census points unavailable:", e, file=sys.stderr)
    out = []
    for r in recs:
        st = re.sub(r"[^a-z]", "", (r.get("state") or "").lower()); dt5 = re.sub(r"[^a-z]", "", (r.get("district") or "").lower())[:5]
        for v in r.get("villages") or []:
            ll = pts.get((st, dt5, re.sub(r"[^a-z]", "", re.sub(r"\(.*?\)|\d+", "", (v.get("v") or "").lower()))))
            out.append({"v": v.get("v"), "tk": v.get("t"), "d": r.get("district"), "s": r.get("state"), "sv": v.get("sv") or [],
                        "nt": r.get("type"), "dt": r.get("date"), "so": r.get("so"), "p": r.get("project"), "km": r.get("km"),
                        "u": r.get("url"), "ll": list(ll) if ll else None})
    return {"gen": datetime.date.today().isoformat(), "notices": len(recs), "villages": out, "raw": recs}

def main(limit=None):
    P = load_projects()[: int(limit) if limit else None]
    path = os.path.join(ROOT, "data/updates.js")
    prev = {"items": [], "hashes": {}}
    if os.path.exists(path):
        s = open(path, encoding="utf-8").read(); prev = json.loads(s[s.index("{"):].rstrip().rstrip(";"))
    today = datetime.date.today().isoformat(); seen = {(i["pid"], i.get("url")) for i in prev["items"]}
    items, hashes, n = list(prev["items"]), dict(prev.get("hashes", {})), 0
    for p in P:
        try:
            for h in news(p["n"]):
                if (p["id"], h["url"]) in seen: continue
                items.append({"pid": p["id"], "kind": "news", "found": today, **h, "review": "needs review"}); n += 1
        except Exception as e: print("news fail", p["id"], e, file=sys.stderr)
        for k in ("src", "src2"):
            u = p.get(k)
            if not u: continue
            hv = page_hash(u); key = p["id"] + "|" + k
            if hv and key in hashes and hashes[key] != hv:
                items.append({"pid": p["id"], "kind": "source-changed", "found": today, "title": "Official/source page changed since last check", "url": u, "date": today, "tags": [], "review": "needs review"}); n += 1
            if hv: hashes[key] = hv
        time.sleep(1.0)
    cutoff = (datetime.date.today() - datetime.timedelta(days=120)).isoformat()
    items = [i for i in items if i["found"] >= cutoff]
    items.sort(key=lambda i: (i.get("date") or i["found"]), reverse=True)
    gz = prev.get("gazette")
    if os.environ.get("GZ_SKIP") != "1": gz = gazette(gz)
    out = {"gen": today, "checked": len(P), "items": items, "hashes": hashes, "gazette": gz}
    open(path, "w", encoding="utf-8").write("/* Weekly re-check output (scripts/recheck.py). Items are leads to review, not confirmed status changes. */\nwindow.BL_UPDATES=" + json.dumps(out, ensure_ascii=False, separators=(",", ":")) + ";\n")
    print("checked", len(P), "new", n, "total", len(items))
if __name__ == "__main__": main(sys.argv[1] if len(sys.argv) > 1 else None)
