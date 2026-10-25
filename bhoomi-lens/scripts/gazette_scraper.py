#!/usr/bin/env python3
"""
gazette_scraper.py - weekly scraper for central Gazette of India land-acquisition notices.
Scope: MoRTH National Highways Act 1956 s.3A / s.3D, Railways Act 1989 s.20A / s.20E.
Source: gazettetracker.com (per-state listing /location/<state>?page=N and per-notice /g/<gazette_id>),
        with egazette.gov.in PDF as fallback when the HTML page has no schedule.
Output: JSON records {gid, so, date, type, project, km, state, district, taluk,
        villages:[{t, v, sv:[...]}], url, parse_status}. Owner-name columns are dropped.
Incremental: already-parsed gids are skipped (state kept in the output file itself).
Usage:  pip install requests beautifulsoup4 pdfplumber
        python gazette_scraper.py --out gazette_notices.json [--since 2024-01-01] [--until 2026-10-25] [--max-per-state 0]
Be polite: 1 request every 2 s (DELAY).
"""
import argparse, json, os, re, sys, time, datetime as dt
import requests
from bs4 import BeautifulSoup

BASE = "https://gazettetracker.com"
DELAY = float(os.environ.get("GZ_DELAY", "2.0"))
UA = {"User-Agent": "Mozilla/5.0 (bhoomi-lens research scraper; weekly; contact owner)"}
STATES = ["andhra-pradesh","arunachal-pradesh","assam","bihar","chhattisgarh","goa","gujarat","haryana",
 "himachal-pradesh","jharkhand","karnataka","kerala","madhya-pradesh","maharashtra","manipur","meghalaya",
 "mizoram","nagaland","odisha","punjab","rajasthan","sikkim","tamil-nadu","telangana","tripura",
 "uttar-pradesh","uttarakhand","west-bengal","andaman-and-nicobar-islands","chandigarh",
 "dadra-and-nagar-haveli-and-daman-and-diu","delhi","jammu-and-kashmir","ladakh","lakshadweep","puducherry"]
TYPE_PATTERNS = [("3A", r"section\s*3\s*\(?A\)?(?![a-z])"), ("3D", r"section\s*3\s*\(?D\)?"),
                 ("20A", r"(section|clause)\s*\(?20\s*\(?A\)?"), ("20E", r"(section|clause)\s*\(?20\s*\(?E\)?")]
_last = [0.0]
def get(url, binary=False):
    wait = DELAY - (time.time() - _last[0])
    if wait > 0: time.sleep(wait)
    for attempt in range(3):
        try:
            r = requests.get(url, headers=UA, timeout=40); _last[0] = time.time()
            if r.status_code == 200: return r.content if binary else r.text
            if r.status_code in (404, 410): return None
        except requests.RequestException as e:
            print("  retry", url, e, file=sys.stderr)
        time.sleep(DELAY * (attempt + 2))
    return None

def gid_date(gid):
    m = re.search(r"-(\d{2})(\d{2})(\d{4})-", gid)
    return dt.date(int(m.group(3)), int(m.group(2)), int(m.group(1))) if m else None

def classify(text):
    t = text.lower()
    if "corrigendum" in t[:300] or "clause (a) of section 3 " in t or "competent authorit" in t[:400] and "3a" not in t[:200]:
        pass
    for typ, pat in TYPE_PATTERNS:
        if re.search(pat, t[:600], re.I): return typ
    return None

def list_state(slug, since, until, max_items=0):
    """Yield (gid, title) for land-acquisition notices in a state's listing, newest first."""
    page = 1
    while True:
        html = get(f"{BASE}/location/{slug}" + (f"?page={page}" if page > 1 else ""))
        if not html: return
        soup = BeautifulSoup(html, "html.parser")
        links = soup.select('a[href^="/g/"], a[href*="gazettetracker.com/g/"]')
        if not links: return
        seen_old = False; n = 0
        for a in links:
            gid = a["href"].rstrip("/").split("/g/")[-1].split("?")[0]
            title = a.get_text(" ", strip=True)
            d = gid_date(gid)
            if d and d < since: seen_old = True; continue
            if d and d > until: continue
            n += 1
            yield gid, title
        if seen_old or n == 0: return
        page += 1
        if max_items and page > 1 + max_items // 20: return

ROW_SKIP = re.compile(r"^(sl\.?\s*no|total|\d+\s*$)", re.I)
def parse_notice(gid, html):
    soup = BeautifulSoup(html, "html.parser")
    full = soup.get_text("\n", strip=True)
    rec = {"gid": gid, "url": f"{BASE}/g/{gid}", "so": None, "date": None, "type": None, "project": None,
           "km": None, "state": None, "district": None, "taluk": None, "villages": [], "parse_status": "metadata_only"}
    m = re.search(r"S\.\s*O\.\s*(\d+)\s*\(E\)", full); rec["so"] = f"S.O. {m.group(1)}(E)" if m else None
    m = re.search(r"New Delhi,\s*the\s*(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+),?\s*(\d{4})", full)
    if m:
        try: rec["date"] = dt.datetime.strptime(f"{m.group(1)} {m.group(2)} {m.group(3)}", "%d %B %Y").date().isoformat()
        except ValueError: pass
    body = full[full.find("NOTIFICATION"):] if "NOTIFICATION" in full else full
    head = body[:1500]
    if re.search(r"sub-?\s*section\s*\(1\)\s*of\s*section\s*3A", head, re.I): rec["type"] = "3A"
    elif re.search(r"section\s*3D", head, re.I): rec["type"] = "3D"
    elif re.search(r"20\s*\(?E\)?", head) and "Railway" in head: rec["type"] = "20E"
    elif re.search(r"20\s*\(?A\)?", head) and "Railway" in head: rec["type"] = "20A"
    m = re.search(r"stretch of land\s*(?:in design chainage\s*)?from\s*(?:Km\.?\s*)?([\d./+]+)\s*to\s*(?:Km\.?\s*)?([\d./+]+)", head, re.I)
    if m: rec["km"] = f"{m.group(1).rstrip('.')}-{m.group(2).rstrip('.')}"
    m = re.search(r"operation of\s+(.{3,160}?)\s+(?:in the|on the|from)\s+stretch", head, re.I | re.S)
    if m: rec["project"] = re.sub(r"\s+", " ", m.group(1)).strip()
    m = re.search(r"district of\s+([A-Za-z .()&-]+?)\s+in the state of\s+([A-Za-z &]+?)\s*(?:,|hereby|\(|\.|$)", head, re.I)
    if m: rec["district"], rec["state"] = m.group(1).strip().title(), m.group(2).strip().title()
    m = re.search(r"State:\s*([A-Z &]+?)\s*(?:\||District|\n)", full)
    if m and not rec["state"]: rec["state"] = m.group(1).strip().title()
    m = re.search(r"District:\s*([A-Za-z .()-]+?)\s*(?:\||\n|$)", full)
    if m and not rec["district"]: rec["district"] = m.group(1).strip().title()

    # Walk the schedule in document order: Taluk:/Village: markers + table rows.
    taluk = village = None; vmap = {}
    for el in soup.find_all(["tr", "p", "div", "h3", "h4", "strong", "td"]):
        if el.name == "td": continue
        txt = el.get_text(" ", strip=True)
        tm = re.search(r"Taluk\s*:\s*([^|:]+?)(?:\s+Village\s*:|\s*\||$)", txt)
        vm = re.search(r"Village\s*:\s*([^|]+?)\s*(?:\||$)", txt)
        if tm: taluk = tm.group(1).strip()
        if vm: village = vm.group(1).strip()
        if el.name == "tr" and not (tm or vm):
            cells = [c.get_text(" ", strip=True) for c in el.find_all(["td", "th"])]
            if len(cells) >= 3 and re.fullmatch(r"\d+", cells[0] or "") and village:
                sv = cells[1].strip()
                if sv and not ROW_SKIP.match(sv) and sv.lower() not in ("2", "survey/plot number"):
                    key = (taluk, village)
                    vmap.setdefault(key, [])
                    if sv not in vmap[key]: vmap[key].append(sv)   # owner columns (6+) ignored
    # Fallback for pages rendered as ASCII grid text ("| 1 | 73// 18 Min | Private |")
    if not vmap:
        for line in re.split(r"\+[-=+]+\+", full):
            tm = re.search(r"Taluk\s*:\s*([^|]+)", line); vm = re.search(r"Village\s*:\s*([^|]+)", line)
            if tm: taluk = tm.group(1).strip()
            if vm: village = vm.group(1).strip(); continue
            m = re.match(r"\s*\|\s*(\d+)\s*\|\s*([^|]+?)\s*\|\s*(Private|Government|Common|Govt)", line, re.I)
            if m and village: vmap.setdefault((taluk, village), []).append(m.group(2).strip())
    rec["villages"] = [{"t": t, "v": v, "sv": s} for (t, v), s in vmap.items()]
    tks = sorted({t for t, _ in vmap if t})
    rec["taluk"] = ", ".join(tks) if tks else None
    if vmap: rec["parse_status"] = "full"
    return rec, full

def egazette_pdf_fallback(gid, year):
    """Optional: egazette serves PDFs at /WriteReadData/<year>/<seq>.pdf where seq = trailing number of gid."""
    seq = gid.rsplit("-", 1)[-1]
    pdf = get(f"https://egazette.gov.in/WriteReadData/{year}/{seq}.pdf", binary=True)
    if not pdf: return None
    try:
        import pdfplumber, io
        with pdfplumber.open(io.BytesIO(pdf)) as p:
            return "\n".join((pg.extract_text() or "") for pg in p.pages)
    except Exception as e:
        print("  pdf parse fail", gid, e, file=sys.stderr); return None

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="gazette_notices.json")
    ap.add_argument("--since", default="2024-01-01"); ap.add_argument("--until", default=dt.date.today().isoformat())
    ap.add_argument("--max-per-state", type=int, default=0, help="0 = no cap")
    ap.add_argument("--states", default=",".join(STATES))
    ap.add_argument("--railways", action="store_true", help="also keep 20A/20E notices")
    a = ap.parse_args()
    since, until = dt.date.fromisoformat(a.since), dt.date.fromisoformat(a.until)
    data = json.load(open(a.out)) if os.path.exists(a.out) else {"records": []}
    done = {r["gid"]: r for r in data["records"] if r.get("parse_status") == "full"}
    keep_types = {"3A", "3D"} | ({"20A", "20E"} if a.railways else set())
    stats, failures = {}, []
    for slug in a.states.split(","):
        found = processed = 0
        for gid, title in list_state(slug, since, until, a.max_per_state):
            t = title.lower()
            if not re.search(r"3a|3d|3 a|3 d|20a|20e|20\(a\)|20\(e\)", t.replace(" ", "")) and "acqui" not in t:
                continue
            found += 1
            if gid in done: processed += 1; continue
            if a.max_per_state and processed >= a.max_per_state: continue
            html = get(f"{BASE}/g/{gid}")
            if not html: failures.append({"gid": gid, "state": slug, "err": "fetch"}); continue
            try:
                rec, _ = parse_notice(gid, html)
            except Exception as e:
                failures.append({"gid": gid, "state": slug, "err": repr(e)}); continue
            if rec["type"] not in keep_types: continue
            if not rec["state"]: rec["state"] = slug.replace("-", " ").title()
            done[gid] = rec; processed += 1
            print(f"{slug}: {gid} {rec['type']} {rec['so']} villages={len(rec['villages'])}")
        stats[slug] = {"found": found, "processed": processed}
        others = [r for r in data["records"] if r["gid"] not in done]
        data = {"generated": dt.date.today().isoformat(), "records": list(done.values()) + others,
                "stats": stats, "failures": failures}
        json.dump(data, open(a.out, "w"), ensure_ascii=False, indent=1)   # checkpoint per state
    print(json.dumps(stats, indent=1)); print("failures:", len(failures))

if __name__ == "__main__":
    main()
