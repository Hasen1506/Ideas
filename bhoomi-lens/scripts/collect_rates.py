#!/usr/bin/env python3
"""
Bhoomi Lens: collect official land rates from your own computer (in India).

  Tamil Nadu guideline values (tnreginet.gov.in): Chengalpattu, Kancheepuram, Tiruvallur;
      2012, 2017 and 2024 revisions; agricultural (per acre / hectare) rows first.
  Maharashtra ready reckoner / eASR (igrmaharashtra.gov.in): Raigad, Thane, Palghar, Pune;
      2017-18 to 2026-27.

Output (same fields as the Bhoomi Lens research files, ready to upload):
  out/tn_gv_new.json   [{district, sro, village, cls, rev, value, unit, rs_sqft, rs_acre, src}]
  out/mh_rr_new.json   [{district, taluka, village, zone, cls, year, value, unit, rs_sqm, rs_acre, src}]
  out/raw/...          every result page saved as HTML + any JSON the site loaded (so it can be re-parsed later)

SETUP (once):
  python -m pip install playwright beautifulsoup4
  python -m playwright install chromium

RUN:
  python collect_rates.py tn          # Tamil Nadu
  python collect_rates.py mh          # Maharashtra
  python collect_rates.py tn --manual # if AUTO cannot find the dropdowns: you click, the script records

HOW IT WORKS
  A normal (visible) Chrome window opens. The script finds the dropdowns on the search page
  (district / SRO or taluka / village / period or year), walks through every option for the target
  districts, presses Search and saves each result table. When the site shows a captcha, the script
  pauses: type the captcha in the browser window, then press Enter in this terminal.
  If the site layout does not match (AUTO finds no dropdowns), use --manual: pick each
  district/village/period yourself and press Enter in the terminal after each result appears.
  Every result page is saved under out/raw even if parsing fails, so nothing is lost.
  It is slow on purpose (about 2 s between searches). You can stop with Ctrl+C at any time and run it
  again: finished combinations are skipped (progress is kept in out/progress.json).
"""
import json, os, re, sys, time, hashlib, datetime as dt
from bs4 import BeautifulSoup

OUT = "out"; RAW = os.path.join(OUT, "raw"); os.makedirs(RAW, exist_ok=True)
PROG = os.path.join(OUT, "progress.json")
DELAY = 2.0

TN = {
    "start": "https://tnreginet.gov.in/portal/",
    "hint": "Menu: 'Guideline Value' (top menu or 'More' > 'Guideline Value'). Choose search by Village / Survey number.",
    "districts": ["chengalpattu", "kancheepuram", "kanchipuram", "tiruvallur", "thiruvallur"],
    "out": os.path.join(OUT, "tn_gv_new.json"),
}
MH = {
    "start": "https://igrmaharashtra.gov.in/",
    "hint": "Link: 'eASR' / 'Ready Reckoner' (opens igreval.maharashtra.gov.in eASR). Choose year, district, taluka, village.",
    "districts": ["raigad", "thane", "palghar", "pune"],
    "years": [f"{y}-{str(y + 1)[2:]}" for y in range(2017, 2027)],
    "out": os.path.join(OUT, "mh_rr_new.json"),
}
ROLE_WORDS = {
    "period": ["period", "guideline value", "revision", "effective", "w.e.f", "year", "वर्ष"],
    "district": ["district", "जिल्हा"],
    "sro": ["sro", "sub registrar", "sub-registrar", "office"],
    "taluka": ["taluka", "taluk", "तालुका"],
    "village": ["village", "गाव", "locality"],
}

# ---------------------------------------------------------------- helpers
def load(p, d):
    try: return json.load(open(p, encoding="utf-8"))
    except Exception: return d
def save(p, x): json.dump(x, open(p, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
def num(s):
    s = (s or "").replace(",", "")
    m = re.search(r"\d+(?:\.\d+)?", s)
    return float(m.group()) if m else None
def unit_of(text):
    t = (text or "").lower().replace(" ", "")
    if "hect" in t or "/ha" in t or "हेक्टर" in t: return "Rs/hectare"
    if "acre" in t: return "Rs/acre"
    if "sq.ft" in t or "sqft" in t or "squarefeet" in t or "sq.feet" in t: return "Rs/sqft"
    if "sq.m" in t or "sqm" in t or "squaremet" in t or "चौ.मी" in t: return "Rs/sqm"
    return None
def norm(value, unit):
    """returns rs_sqft, rs_sqm, rs_acre"""
    if value is None or not unit: return None, None, None
    acre = {"Rs/acre": value, "Rs/hectare": value / 2.4711, "Rs/sqft": value * 43560, "Rs/sqm": value * 4046.86}[unit]
    return round(acre / 43560, 2), round(acre / 4046.86, 2), round(acre)
def rev_of(text):
    t = text or ""
    if re.search(r"2012", t): return "2012"
    if re.search(r"2017", t): return "2017"
    if re.search(r"2023|2024|2025|2026|current|present", t, re.I): return "2024"
    return None
def is_agri(text): return bool(re.search(r"agri|dry|wet|nanjai|punjai|manavari|farm|शेती|जिरायत|बागायत|hect|acre", text or "", re.I))

def save_raw(page, tag):
    html = page.content(); h = hashlib.md5(html.encode()).hexdigest()[:10]
    fn = os.path.join(RAW, f"{tag}_{h}.html"); open(fn, "w", encoding="utf-8").write(html); return html, fn

def parse_tables(html):
    """Generic: every table row with a number that looks like a rate becomes a row dict."""
    soup = BeautifulSoup(html, "html.parser"); rows = []
    for tb in soup.find_all("table"):
        heads = [th.get_text(" ", strip=True) for th in tb.find_all("th")]
        head_txt = " ".join(heads)
        for tr in tb.find_all("tr"):
            cells = [td.get_text(" ", strip=True) for td in tr.find_all("td")]
            if len(cells) < 2: continue
            # rate = last numeric cell with a plausible value
            vals = [(i, num(c)) for i, c in enumerate(cells) if num(c) and num(c) >= 10 and not re.fullmatch(r"\d{1,3}", c.strip())]
            if not vals: continue
            i, v = vals[-1]
            label = " | ".join(c for j, c in enumerate(cells) if j != i)
            u = unit_of(heads[i] if i < len(heads) else "") or unit_of(head_txt) or unit_of(label)
            rows.append({"label": label, "value": v, "unit": u, "head": head_txt})
    return rows

def find_selects(page):
    """Map role -> select element handle using the label / id / name / first option text."""
    found = {}
    for el in page.query_selector_all("select"):
        try:
            if not el.is_visible(): continue
            meta = " ".join(filter(None, [el.get_attribute("id"), el.get_attribute("name"), el.get_attribute("aria-label")])).lower()
            lab = page.evaluate("(e)=>{const l=e.id&&document.querySelector(`label[for='${e.id}']`);return (l?l.innerText:'')+' '+(e.closest('div,td,tr')?.innerText||'').slice(0,80)}", el).lower()
            first = (el.query_selector("option") or el).inner_text().lower()
            text = f"{meta} {lab} {first}"
            for role, words in ROLE_WORDS.items():
                if role not in found and any(w in text for w in words): found[role] = el; break
        except Exception: pass
    return found

def options(el):
    return [(o.get_attribute("value"), o.inner_text().strip()) for o in el.query_selector_all("option")
            if o.get_attribute("value") not in (None, "", "0", "-1") and o.inner_text().strip() and not o.inner_text().lower().startswith("select")]

def choose(page, el, value):
    el.select_option(value=value); page.wait_for_timeout(1500)

def captcha_wait(page):
    if page.query_selector("img[src*='aptcha' i], input[id*='aptcha' i], input[name*='aptcha' i]"):
        input("  Captcha on the page: type it in the browser (do not press Search), then press Enter here... ")

def click_search(page):
    for sel in ["button:has-text('Search')", "input[type=submit]", "button:has-text('Submit')", "button:has-text('Show')",
                "input[value*='Search' i]", "button:has-text('शोधा')"]:
        b = page.query_selector(sel)
        if b and b.is_visible(): b.click(); page.wait_for_timeout(2500); return True
    return False

# ---------------------------------------------------------------- record builders
def tn_records(rows, ctx, src):
    out = []
    for r in rows:
        u = r["unit"]; v = r["value"]; sqft, sqm, acre = norm(v, u)
        out.append({"district": ctx.get("district"), "sro": ctx.get("sro"), "village": ctx.get("village"), "cls": r["label"][:160],
                    "rev": ctx.get("rev"), "value": v, "unit": u, "rs_sqft": sqft, "rs_acre": acre, "src": src,
                    "agri": is_agri(r["label"] + " " + (u or "")), "official": True, "retrieved": dt.date.today().isoformat()})
    out.sort(key=lambda x: not x["agri"])          # agricultural first
    return out

def mh_records(rows, ctx, src):
    out = []
    for r in rows:
        u = r["unit"]; v = r["value"]; sqft, sqm, acre = norm(v, u)
        out.append({"district": ctx.get("district"), "taluka": ctx.get("taluka"), "village": ctx.get("village"),
                    "zone": r["label"][:120], "cls": r["head"][:120], "year": ctx.get("year"), "value": v, "unit": u,
                    "rs_sqm": sqm, "rs_acre": acre, "src": src, "official": True, "retrieved": dt.date.today().isoformat()})
    return out

# ---------------------------------------------------------------- AUTO walk
def walk(page, cfg, state, kind):
    prog = load(PROG, {}); data = load(cfg["out"], [])
    S = find_selects(page)
    print("  dropdowns found:", {k: True for k in S})
    if "district" not in S or "village" not in S:
        print("  AUTO could not identify the district/village dropdowns on this page. Use --manual."); return False
    periods = options(S["period"]) if "period" in S else [(None, None)]
    if kind == "tn": periods = [p for p in periods if p[0] is None or rev_of(p[1])]
    if kind == "mh": periods = [p for p in periods if p[0] is None or any(y in p[1] for y in cfg["years"]) or re.search(r"20(1[7-9]|2[0-6])", p[1])]
    for pv, pt in periods:
        if pv: choose(page, find_selects(page)["period"], pv)
        for dv, dtxt in options(find_selects(page)["district"]):
            if not any(d in dtxt.lower() for d in cfg["districts"]): continue
            choose(page, find_selects(page)["district"], dv)
            mid_role = "sro" if kind == "tn" else "taluka"
            mids = options(find_selects(page)[mid_role]) if mid_role in find_selects(page) else [(None, None)]
            for mv, mtxt in mids:
                if mv: choose(page, find_selects(page)[mid_role], mv)
                for vv, vtxt in options(find_selects(page)["village"]):
                    key = f"{kind}|{pt}|{dtxt}|{mtxt}|{vtxt}"
                    if prog.get(key): continue
                    try:
                        choose(page, find_selects(page)["village"], vv); captcha_wait(page); click_search(page)
                        html, fn = save_raw(page, kind)
                        ctx = {"district": dtxt, mid_role: mtxt, "village": vtxt,
                               "rev": rev_of(pt or "") or rev_of(html[:20000]), "year": pt}
                        rows = parse_tables(html)
                        data += (tn_records if kind == "tn" else mh_records)(rows, ctx, page.url)
                        prog[key] = len(rows); save(cfg["out"], data); save(PROG, prog)
                        print(f"  {pt or ''} | {dtxt} | {mtxt or ''} | {vtxt}: {len(rows)} rows")
                        page.go_back() if not find_selects(page).get("village") else None
                        time.sleep(DELAY)
                    except KeyboardInterrupt: raise
                    except Exception as e:
                        print("   skipped:", vtxt, e); prog[key] = "error"; save(PROG, prog)
    return True

# ---------------------------------------------------------------- MANUAL record
def manual(page, cfg, kind):
    data = load(cfg["out"], [])
    print("\nMANUAL mode. For each search: choose period/year, district, SRO/taluka, village in the browser,")
    print("press Search, wait for the table, then come back here.")
    while True:
        cmd = input("Enter = save this result | q = quit: ").strip().lower()
        if cmd == "q": break
        html, fn = save_raw(page, kind)
        sel = page.evaluate("()=>Array.from(document.querySelectorAll('select')).map(s=>s.options[s.selectedIndex]?.text||'')")
        print("  selected:", sel)
        ctx = {}
        for t in sel:
            tl = t.lower()
            if any(d in tl for d in cfg["districts"]): ctx["district"] = t
            elif rev_of(t) and kind == "tn": ctx["rev"] = rev_of(t)
            elif re.search(r"20\d\d", t) and kind == "mh": ctx["year"] = t
        others = [t for t in sel if t and t not in ctx.values() and not t.lower().startswith("select")]
        if others: ctx["village"] = others[-1]
        if len(others) > 1: ctx["sro" if kind == "tn" else "taluka"] = others[-2]
        if kind == "tn" and not ctx.get("rev"): ctx["rev"] = input("  Which revision is this (2012/2017/2024)? ").strip()
        if kind == "mh" and not ctx.get("year"): ctx["year"] = input("  Which year is this (e.g. 2021-22)? ").strip()
        rows = parse_tables(html)
        data += (tn_records if kind == "tn" else mh_records)(rows, ctx, page.url); save(cfg["out"], data)
        print(f"  saved {len(rows)} rows (total {len(data)}). Raw page: {fn}")

def main():
    if len(sys.argv) < 2 or sys.argv[1] not in ("tn", "mh"): print(__doc__); sys.exit(1)
    kind = sys.argv[1]; cfg = TN if kind == "tn" else MH; man = "--manual" in sys.argv
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        br = p.chromium.launch(headless=False); ctxb = br.new_context(accept_downloads=True); page = ctxb.new_page()
        def keep_json(resp):
            try:
                if "json" in (resp.headers.get("content-type") or ""):
                    fn = os.path.join(RAW, f"{kind}_xhr_{hashlib.md5(resp.url.encode()).hexdigest()[:10]}.json")
                    open(fn, "w", encoding="utf-8").write(json.dumps({"url": resp.url, "body": resp.text()}, ensure_ascii=False))
            except Exception: pass
        page.on("response", keep_json)
        page.goto(cfg["start"], wait_until="domcontentloaded")
        print("\nOpened", cfg["start"]); print("  ", cfg["hint"])
        input("Navigate to the rate search page in the browser (log in / accept terms if asked), then press Enter here... ")
        page = ctxb.pages[-1]; page.on("response", keep_json)
        try:
            if man or not walk(page, cfg, {}, kind): manual(page, cfg, kind)
        except KeyboardInterrupt: print("\nStopped. Progress saved; run again to continue.")
        br.close()
    d = load(cfg["out"], [])
    print(f"\nDone. {len(d)} rows in {cfg['out']}. Upload that file (and, if possible, a zip of out/raw) to Bhoomi Lens.")

if __name__ == "__main__": main()
