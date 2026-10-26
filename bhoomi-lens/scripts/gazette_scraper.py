#!/usr/bin/env python3
"""
gazette_scraper.py - resumable scraper for central Gazette of India land-acquisition notices.
Scope: MoRTH National Highways Act 1956 s.3A / s.3D (Railways Act 20A / 20E with --railways).
Source: gazettetracker.com (per-state listing /location/<state>?page=N and per-notice /g/<gazette_id>).
Output/store: one JSON file {generated, records:[...], cursor:{...}, skip:[...], pending:[...], stats, failures}.
  records: {gid, so, date, type, project, km, state, district, taluk, villages:[{t,v,sv:[...]}], url, parse_status, tries}
  Owner-name columns are dropped.

Why it is shaped like this (Oct 2026): the old version re-walked every state's listing back to --since and
re-fetched every notice it could not parse (1,400+ of them, at 2 s each) on every run, with no clock of its
own, so the 25-minute subprocess timeout killed it every week. Now:
  * hard wall-clock budget (--max-minutes); every request checks it and the run stops cleanly and saves;
  * per-request connect/read timeouts and bounded retries;
  * per-state cursor: a "head" scan of the newest pages stops at the first page with nothing new, and the
    one-time backfill toward --since resumes from the saved page on the next run;
  * gids that are not wanted (non-3A/3D after parsing) are remembered in `skip`; unparsable notices are
    retried at most MAX_TRIES times, failed fetches are queued in `pending`;
  * checkpoint written atomically every few notices and at the end, so a killed run keeps its work.
Usage:  python -u gazette_scraper.py --out store.json [--since 2024-01-01] [--max-minutes 20]
"""
import argparse, json, os, re, sys, time, datetime as dt
import requests
from bs4 import BeautifulSoup

BASE = "https://gazettetracker.com"
DELAY = float(os.environ.get("GZ_DELAY", "1.5"))          # polite gap between requests (s)
TIMEOUT = (10, 30)                                         # connect, read (s)
SKIP_VERSION = 2                                           # bump when classification changes; drops the old skip list
MAX_TRIES = 3                                              # parse attempts before a notice is left as metadata_only
UA = {"User-Agent": "Mozilla/5.0 (bhoomi-lens research scraper; weekly; contact owner)"}
STATES = ["tamil-nadu","karnataka","kerala","andhra-pradesh","telangana","puducherry","maharashtra","arunachal-pradesh","assam","bihar","chhattisgarh","goa","gujarat","haryana","himachal-pradesh","jharkhand","madhya-pradesh","manipur","meghalaya","mizoram","nagaland","odisha","punjab","rajasthan","sikkim","tripura","uttar-pradesh","uttarakhand","west-bengal","andaman-and-nicobar-islands","chandigarh","dadra-and-nagar-haveli-and-daman-and-diu","delhi","jammu-and-kashmir","ladakh","lakshadweep"]
LA_TITLE = re.compile(r"3a|3d|20a|20e|20\(a\)|20\(e\)")
# Titles that are never NH 3A/3D notices. Without this the scraper fetched every railway (20A/20E/7A/37A),
# PMP-Act pipeline, corrigendum and competent-authority notice just to reject it (~100+ per state).
NOT_NH = re.compile(r"railway|\b20\s*\(?\s*[aef]\b|\b7a\b|37a|20f|pmp\s*act|petroleum|pipeline|right of user|corrigend|"
                    r"competent\s*authorit|\b6\s*\(\s*1\s*\)|\b3\s*\(\s*1\s*\)|coal bearing|cba act", re.I)

class OutOfTime(Exception): pass
_S = requests.Session(); _S.headers.update(UA)
_last = [0.0]; DEADLINE = [float("inf")]; REQS = [0]
def get(url, binary=False):
    for attempt in range(3):
        if time.time() > DEADLINE[0]: raise OutOfTime()
        wait = DELAY - (time.time() - _last[0])
        if wait > 0: time.sleep(wait)
        try:
            REQS[0] += 1
            r = _S.get(url, timeout=TIMEOUT); _last[0] = time.time()
            if r.status_code == 200: return r.content if binary else r.text
            if r.status_code in (404, 410): return None
            print(f"  http {r.status_code} {url}", flush=True)
        except requests.RequestException as e:
            _last[0] = time.time(); print("  retry", url, type(e).__name__, flush=True)
        time.sleep(DELAY * (attempt + 2))
    return None

def gid_date(gid):
    m = re.search(r"-(\d{2})(\d{2})(\d{4})-", gid)
    try: return dt.date(int(m.group(3)), int(m.group(2)), int(m.group(1))) if m else None
    except ValueError: return None

def list_page(slug, page):
    """[(gid, title)] on one listing page (newest first), [] past the end, None if the fetch failed."""
    html = get(f"{BASE}/location/{slug}" + (f"?page={page}" if page > 1 else ""))
    if html is None: return None
    soup = BeautifulSoup(html, "html.parser"); out, seen = [], set()
    for a in soup.find_all("a", href=True):
        h = a["href"]
        if "/g/" not in h: continue
        gid = h.rstrip("/").split("/g/")[-1].split("?")[0]
        if gid and gid not in seen: seen.add(gid); out.append((gid, a.get_text(" ", strip=True)))
    return out

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
    # Classify by the operative clause. 3D declarations open with "Whereas by the notification ... under
    # sub-section (1) of section 3 (A)..." and write the section as 3D / 3 D / 3(D); 3A notices "hereby
    # declare its intention to acquire". "clause (a) of section 3" is a competent-authority order, not 3A.
    b6 = body[:6000]
    if re.search(r"clause\s*\(\s*a\s*\)\s*of\s*section\s*3(?![\dA-Za-z(])", b6[:900], re.I): pass
    elif re.search(r"^\W*NOTIFICATION\b.{0,250}?\bWhereas\b", b6[:900], re.S | re.I) and re.search(r"section\s*3\s*\(?\s*D\s*\)?(?![a-z])", b6, re.I): rec["type"] = "3D"
    elif re.search(r"intention\s+to\s+acquire", b6[:3000], re.I) and re.search(r"section\s*3\s*\(?\s*A\s*\)?(?![a-z])", b6[:3000], re.I): rec["type"] = "3A"
    elif re.search(r"section\s*3\s*\(?\s*D\s*\)?(?![a-z])", head, re.I): rec["type"] = "3D"
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
    # Fallback: schedules rendered as text. Seen in the wild (Oct 2026), all after "Taluk:"/"Village:" markers:
    #   ASCII grid   "| 3 | 37/1A1C | Private | ... |"  (also "| Village: | Gharbara |")
    #   bare pipes   "1 | 153-2B | Private (patta) | Dry | ..."
    #   spaces       "1 13/1/1  Private   Irrigated  0.025"
    #   one cell per line  "1" / "1623" / "Private" / ...
    # A row is the next serial number followed by the survey number. Owner-name columns are never read.
    # (The old fallback split on +----+ rules and only ever saw the first row of a block, so these notices
    # stayed metadata_only forever and every run re-fetched all of them.)
    if not vmap:
        vmap = parse_text_schedule(full)
    rec["villages"] = [{"t": t, "v": v, "sv": s} for (t, v), s in vmap.items()]
    tks = sorted({t for t, _ in vmap if t})
    rec["taluk"] = ", ".join(tks) if tks else None
    if vmap: rec["parse_status"] = "full"
    return rec, full

_SV_OK = re.compile(r"^(?=.*\d)[0-9A-Za-z][0-9A-Za-z/\-+.,() ]{0,39}$")
def parse_text_schedule(full):
    vmap, taluk, village, expect = {}, None, None, 1
    lines = [l.strip() for l in full.split("\n")]
    i = 0
    def add(sv):
        sv = re.sub(r"\s+", " ", sv).strip(" .")
        if sv and _SV_OK.match(sv) and not re.match(r"(sl|total|survey|area)", sv, re.I):
            lst = vmap.setdefault((taluk, village), [])
            if sv not in lst: lst.append(sv)
    while i < len(lines):
        line = re.sub(r"(Taluk|Village)\s*:\s*\|\s*", r"\1: ", lines[i]); i += 1
        if not line or re.fullmatch(r"[+=\-|]+", line): continue
        tm = re.search(r"Taluk\s*:\s*([^|]+?)\s*(?=\||Village\s*:|$)", line, re.I)
        vm = re.search(r"Village\s*:\s*([^|]+?)\s*(?=\||$)", line, re.I)
        if tm: taluk = re.sub(r"\s+", " ", tm.group(1)).strip()
        if vm: village = re.sub(r"\s+", " ", vm.group(1)).strip()
        if tm or vm: continue
        if not village: continue
        if re.match(r"(Total|\[F\.?\s*No|Uploaded by|Login to read)", line, re.I):
            if re.match(r"(Uploaded by|Login to read)", line, re.I): break
            continue
        if "|" in line:
            cells = [c.strip() for c in line.strip("|").split("|")]
        else:
            cells = line.split(None, 1)
            if len(cells) == 2: cells = [cells[0]] + cells[1].split(None, 1)
        if not cells or not re.fullmatch(r"\d+", cells[0]): continue
        n = int(cells[0])
        if n not in (expect, 1): continue
        if len(cells) >= 2 and cells[1]:
            add(cells[1]); expect = n + 1
        elif len(cells) == 1 and i < len(lines):                  # one cell per line
            add(lines[i]); i += 1; expect = n + 1
    return vmap

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


class Store:
    def __init__(self, path, keep_types):
        self.path = path; self.keep = keep_types
        d = json.load(open(path)) if os.path.exists(path) else {}
        self.rec = {r["gid"]: r for r in d.get("records", [])}
        self.cursor = d.get("cursor", {}); self.skip = set(d.get("skip", []))
        if d.get("skip_version") != SKIP_VERSION:          # skip list built by an older classifier (v1 rejected real 3D notices)
            if self.skip: print(f"dropping {len(self.skip)} skip entries from an older classifier", flush=True)
            self.skip = set()
        self.pending = {p["gid"]: p for p in d.get("pending", [])}
        self.stats = {}; self.failures = []; self.new = 0; self.upgraded = 0; self.n_since_save = 0
    def known(self, gid):
        return gid in self.rec or gid in self.skip or gid in self.pending
    def save(self):
        d = {"generated": dt.date.today().isoformat(), "records": list(self.rec.values()), "cursor": self.cursor,
             "skip_version": SKIP_VERSION, "skip": sorted(self.skip), "pending": list(self.pending.values()), "stats": self.stats, "failures": self.failures[-200:]}
        tmp = self.path + ".tmp"; json.dump(d, open(tmp, "w"), ensure_ascii=False, separators=(",", ":")); os.replace(tmp, self.path)
        self.n_since_save = 0
    def fetch(self, gid, slug):
        """Fetch + parse one notice. Returns True if a record was stored."""
        html = get(f"{BASE}/g/{gid}")
        if not html and gid in self.rec:
            self.rec[gid]["tries"] = self.rec[gid].get("tries", 0) + 1; return False
        if not html:
            p = self.pending.setdefault(gid, {"gid": gid, "state": slug, "tries": 0}); p["tries"] += 1
            if p["tries"] >= MAX_TRIES: self.pending.pop(gid); self.skip.add(gid)
            self.failures.append({"gid": gid, "state": slug, "err": "fetch"}); return False
        self.pending.pop(gid, None)
        try: rec, _ = parse_notice(gid, html)
        except Exception as e:
            self.failures.append({"gid": gid, "state": slug, "err": repr(e)[:200]}); self.skip.add(gid); return False
        if rec["type"] not in self.keep: self.skip.add(gid); self.rec.pop(gid, None); return False
        old = self.rec.get(gid)
        if not rec["state"]: rec["state"] = (old or {}).get("state") or slug.replace("-", " ").title()
        rec["tries"] = ((old or {}).get("tries", 0) + 1) if rec["parse_status"] != "full" else 0
        if old is None: self.new += 1
        elif old.get("parse_status") != "full" and rec["parse_status"] == "full": self.upgraded += 1
        self.rec[gid] = rec
        print(f"  {slug}: {gid} {rec['type']} {rec['so']} villages={len(rec['villages'])} {rec['parse_status']}", flush=True)
        self.n_since_save += 1
        if self.n_since_save >= 10: self.save()
        return True

def take(store, slug, items, since, until, railways=False):
    """Fetch the unknown land-acquisition notices on one listing page.
    Returns (n_fetched, all_older_than_since, reached_frontier) where reached_frontier means the page holds a
    notice already in the store (listing is newest first, so everything below it was seen on an earlier run)."""
    n, older, frontier = 0, bool(items), False
    for gid, title in items:
        d = gid_date(gid)
        if not (d and d < since): older = False
        if gid in store.rec: frontier = True
        if (d and (d < since or d > until)) or store.known(gid): continue
        t = title.lower().replace(" ", "")
        if (not LA_TITLE.search(t) and "acqui" not in t) or (not railways and NOT_NH.search(title)):
            store.skip.add(gid); continue
        n += 1; store.fetch(gid, slug)
    return n, older, frontier

def run(a):
    since, until = dt.date.fromisoformat(a.since), dt.date.fromisoformat(a.until)
    keep = {"3A", "3D"} | ({"20A", "20E"} if a.railways else set())
    DEADLINE[0] = time.time() + a.max_minutes * 60
    st = Store(a.out, keep); slugs = a.states.split(",")
    print(f"store: {len(st.rec)} records, {len(st.skip)} skipped gids, {len(st.pending)} pending; budget {a.max_minutes} min", flush=True)
    phase = "head"
    try:
        # 1) head: newest pages of every state until a page has nothing new (least recently visited first).
        for slug in sorted(slugs, key=lambda s: st.cursor.get(s, {}).get("head_at", "")):
            c = st.cursor.setdefault(slug, {"resume_page": 1, "complete": False}); new = 0
            for page in range(1, a.head_pages + 1):
                items = list_page(slug, page)
                if not items: break
                n, older, frontier = take(st, slug, items, since, until, a.railways); new += n
                if older or n == 0 or frontier: break
            else:
                if c.get("complete"): c.update(complete=False, resume_page=a.head_pages + 1)   # >head_pages of new items: let backfill close the gap
            c["head_at"] = dt.datetime.utcnow().isoformat(timespec="seconds"); st.stats[slug] = {"head_new": new}
            print(f"head {slug}: {new} fetched, {len(st.rec)} records", flush=True)
        st.save()
        # 2) retries: failed fetches and notices whose schedule did not parse (bounded attempts).
        phase = "retry"
        todo = [(p["gid"], p["state"]) for p in list(st.pending.values())]
        todo += [(g, (r.get("state") or "").lower().replace(" ", "-")) for g, r in st.rec.items()
                 if r.get("parse_status") != "full" and r.get("tries", 0) < MAX_TRIES]
        todo.sort(key=lambda x: x[0].split("-")[-1], reverse=True)       # newest gazette sequence first
        print(f"retry queue: {len(todo)}", flush=True)
        for gid, slug in todo:
            if gid in st.rec and st.rec[gid].get("parse_status") == "full": continue
            st.fetch(gid, slug or "unknown")
        st.save()
        # 3) backfill toward --since, resuming each incomplete state's saved page.
        phase = "backfill"
        for slug in slugs:
            c = st.cursor.setdefault(slug, {"resume_page": 1, "complete": False})
            if c.get("complete"): continue
            page = max(2, c.get("resume_page", 1))
            while True:
                items = list_page(slug, page)
                if items is None: break                     # transient; resume here next run
                if not items: c["complete"] = True; break
                n, older, _ = take(st, slug, items, since, until, a.railways)
                c["resume_page"] = page + 1
                if older: c["complete"] = True; break
                page += 1
            print(f"backfill {slug}: page {c['resume_page']} complete={c['complete']}", flush=True)
        phase = "done"
    except OutOfTime:
        print(f"time budget reached during {phase}; saving checkpoint", flush=True)
    st.save()
    left = sum(1 for c in st.cursor.values() if not c.get("complete"))
    full = sum(1 for r in st.rec.values() if r.get("parse_status") == "full")
    print(f"gazette: {len(st.rec)} records ({full} full), +{st.new} new, {st.upgraded} upgraded to full, "
          f"{len(st.pending)} pending, {left} states still backfilling, {REQS[0]} requests, phase reached: {phase}", flush=True)
    return st

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="gazette_notices.json")
    ap.add_argument("--since", default="2024-01-01"); ap.add_argument("--until", default=dt.date.today().isoformat())
    ap.add_argument("--max-minutes", type=float, default=float(os.environ.get("GZ_MINUTES", "20")))
    ap.add_argument("--head-pages", type=int, default=5, help="max newest pages per state per run before backfill takes over")
    ap.add_argument("--states", default=",".join(STATES))
    ap.add_argument("--railways", action="store_true", help="also keep 20A/20E notices")
    run(ap.parse_args())

if __name__ == "__main__":
    main()
