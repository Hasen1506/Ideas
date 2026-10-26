#!/usr/bin/env python3
"""
Tamil Nadu official street-wise guideline values (tnreginet.gov.in) -> bhoomi-lens/data/tn_gv/

Source: Registration Department, Govt of Tamil Nadu, "Guideline value from 2002" search
(webHP?requestType=ApplicationRH&screenId=7000057). Plain cookieless GETs, no captcha.
The site only answers Indian IPs, so every request goes through public Indian proxies,
raced several at a time (first valid answer wins).

Scope: STREET-wise values (searchCriteria=1, txt_SearchCriteria=%) for every SRO / village,
revision by revision, newest first: 2024 (from 1-7-2024), 2023, 2017, 2012, 2007, 2003, 2002.
Survey-number values are out of scope.

Resumable: the district files themselves are the checkpoint (a village is done once its
entry has "items" >= 0). Safe to run several copies at once (GitHub Actions shards, sandbox):
each sync fetches origin/main, merges remote district files into memory (union), writes, commits
and pushes, retrying on a race.

Usage:
  python tn_gv_collect.py [--minutes 290] [--workers 24] [--shard i/n] [--reverse]
                          [--sync-minutes 25] [--no-git] [--seed-raw DIR --seed-state FILE]
Output files (all under bhoomi-lens/data/tn_gv/):
  <District>.json   one per district (compact; see "row_format" inside)
  progress.json     small per-district / per-revision status; "all_done": true when finished
  _meta.json        zones, districts, SRO lists and SRO->district map
  _proxies.json     proxies that recently worked
"""
import os, re, sys, json, time, html, random, argparse, threading, subprocess
import concurrent.futures as cf
import urllib.parse as up
import requests

requests.packages.urllib3.disable_warnings()

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
DATA_REL = "bhoomi-lens/data/tn_gv"
DATA = os.path.join(REPO, DATA_REL)
P = "https://tnreginet.gov.in/portal/"
PROBE = P + "images/svg/rod.svg"

REVS = {
    "2024": dict(fromDate="2024-7-1", toDate="", fromLabel="1-7-2024", toLabel="", eff="2024-07-01", to=None),
    "2023": dict(fromDate="2023-4-1", toDate="2024-06-30", fromLabel="1-4-2023", toLabel="30-6-2024", eff="2023-04-01", to="2024-06-30"),
    "2017": dict(fromDate="2017-6-9", toDate="2023-03-31", fromLabel="9-6-2017", toLabel="31-3-2023", eff="2017-06-09", to="2023-03-31"),
    "2012": dict(fromDate="2012-4-1", toDate="2017-6-8", fromLabel="1-4-2012", toLabel="8-6-2017", eff="2012-04-01", to="2017-06-08"),
    "2007": dict(fromDate="2007-8-1", toDate="2012-3-31", fromLabel="1-8-2007", toLabel="31-3-2012", eff="2007-08-01", to="2012-03-31"),
    "2003": dict(fromDate="2003-4-1", toDate="2007-7-31", fromLabel="1-4-2003", toLabel="31-7-2007", eff="2003-04-01", to="2007-07-31"),
    "2002": dict(fromDate="2002-4-1", toDate="2003-3-31", fromLabel="1-4-2002", toLabel="31-3-2003", eff="2002-04-01", to="2003-03-31"),
}
REV_ORDER = ["2024", "2023", "2017", "2012", "2007", "2003", "2002"]

ZONES = {"1": "சென்னை", "2": "கோயம்புத்தூர்", "3": "கடலூர்", "4": "மதுரை", "5": "சேலம்", "6": "திருச்சி",
         "7": "தஞ்சாவூர்", "8": "திருநெல்வேலி", "9": "வேலூர்", "13": "இராமநாதபுரம்", "15": "செங்கல்பட்டு"}
# district id (home-page search, screenId 7000054) -> English name, as listed on tnreginet's home page
DISTRICTS = {"17": "Ariyalur", "35": "Chengalpattu", "2": "Chennai", "12": "Coimbatore", "18": "Cuddalore",
             "5": "Dharmapuri", "13": "Dindigul", "10": "Erode", "33": "Kallakurichi", "3": "Kancheepuram",
             "30": "Kanniyakumari", "14": "Karur", "31": "Krishnagiri", "24": "Madurai", "38": "Mayiladuthurai",
             "19": "Nagapattinam", "9": "Namakkal", "11": "Nilgiris", "16": "Perambalur", "22": "Pudukkottai",
             "27": "Ramanathapuram", "37": "Ranipet", "8": "Salem", "23": "Sivagangai", "34": "Tenkasi",
             "21": "Thanjavur", "25": "Theni", "15": "Tiruchirappalli", "36": "Tirupathur", "20": "Tiruvarur",
             "28": "Thoothukkudi", "29": "Tirunelveli", "32": "Tiruppur", "1": "Tiruvallur", "6": "Tiruvannamalai",
             "4": "Vellore", "7": "Viluppuram", "26": "Virudhunagar"}
# Tamil name stems used to pick the home district of an SRO listed under several districts
DIST_TA = {"Ariyalur": "அரியலூர்", "Chengalpattu": "செங்கல்பட்டு", "Chennai": "சென்னை", "Coimbatore": "கோயம்புத்தூர்|கோவை",
           "Cuddalore": "கடலூர்", "Dharmapuri": "தர்மபுரி", "Dindigul": "திண்டுக்கல்", "Erode": "ஈரோடு",
           "Kallakurichi": "கள்ளக்குறிச்சி", "Kancheepuram": "காஞ்சிபுரம்", "Kanniyakumari": "கன்னியாகுமரி|நாகர்கோவில்",
           "Karur": "கரூர்", "Krishnagiri": "கிருஷ்ணகிரி", "Madurai": "மதுரை", "Mayiladuthurai": "மயிலாடுதுறை",
           "Nagapattinam": "நாகப்பட்டி", "Namakkal": "நாமக்கல்", "Nilgiris": "உதகமண்டலம்|ஊட்டி", "Perambalur": "பெரம்பலூர்",
           "Pudukkottai": "புதுக்கோட்டை", "Ramanathapuram": "இராமநாதபுரம்|ராமநாதபுரம்", "Ranipet": "ராணிப்பேட்டை",
           "Salem": "சேலம்", "Sivagangai": "சிவகங்கை", "Tenkasi": "தென்காசி", "Thanjavur": "தஞ்சாவூர்", "Theni": "தேனி",
           "Tiruchirappalli": "திருச்சி", "Tirupathur": "திருப்பத்தூர்", "Tiruvarur": "திருவாரூர்", "Thoothukkudi": "தூத்துக்குடி",
           "Tirunelveli": "திருநெல்வேலி", "Tiruppur": "திருப்பூர்", "Tiruvallur": "திருவள்ளூர்", "Tiruvannamalai": "திருவண்ணாமலை",
           "Vellore": "வேலூர்", "Viluppuram": "விழுப்புரம்", "Virudhunagar": "விருதுநகர்"}
# hand-checked homes (taluk geography) for SROs listed under several districts where the rule below picks wrong
SRO_HOME = {"20052": "Chennai", "20089": "Kancheepuram", "20090": "Kancheepuram", "20062": "Kancheepuram",
            "20112": "Coimbatore", "20129": "Coimbatore", "20130": "Coimbatore", "20133": "Coimbatore", "22607": "Coimbatore",
            "20148": "Erode", "20166": "Erode", "20167": "Erode", "20180": "Viluppuram", "20181": "Viluppuram",
            "20224": "Cuddalore", "20225": "Cuddalore", "20226": "Cuddalore", "20260": "Dindigul", "20262": "Sivagangai",
            "20266": "Pudukkottai", "20321": "Virudhunagar", "20326": "Sivagangai", "20331": "Sivagangai", "20332": "Virudhunagar",
            "20333": "Dharmapuri", "20337": "Dharmapuri", "20377": "Salem", "20378": "Salem", "20380": "Salem", "20395": "Salem",
            "20406": "Tiruchirappalli", "20409": "Tiruchirappalli", "20424": "Karur", "20425": "Karur", "20470": "Nagapattinam",
            "20476": "Nagapattinam", "20479": "Nagapattinam", "20490": "Thanjavur", "20492": "Thanjavur", "20494": "Tiruvarur",
            "20506": "Thanjavur", "20511": "Tirunelveli", "20516": "Tirunelveli", "20519": "Tirunelveli", "20545": "Thoothukkudi",
            "20546": "Thoothukkudi", "20548": "Thoothukkudi", "20551": "Thoothukkudi", "20555": "Thoothukkudi",
            "20614": "Tiruvannamalai", "20619": "Tiruvannamalai", "20622": "Tiruvannamalai", "20646": "Vellore", "20647": "Vellore"}
UNMAPPED = "_Unmapped"  # SROs present in the historical zone lists but not under any current district

UNIT = {"சதுரடி": "ft2", "சதுர மீட்டர்": "m2", "ஏக்கர்": "ac", "ஹெக்டேர்": "ha", "ஏர்ஸ்": "are", "சென்ட்": "cent"}
MON = {m: i for i, m in enumerate(["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], 1)}

PROXY_SOURCES = [
    "https://cdn.jsdelivr.net/gh/proxifly/free-proxy-list@main/proxies/countries/IN/data.txt",
    "https://raw.githubusercontent.com/proxifly/free-proxy-list/main/proxies/countries/IN/data.txt",
    "https://api.proxyscrape.com/v2/?request=getproxies&protocol=http&timeout=10000&country=IN&ssl=all&anonymity=all",
    "https://api.proxyscrape.com/v4/free-proxy-list/get?request=display_proxies&country=in&proxy_format=protocolipport&format=text",
    "geonode:1", "geonode:2", "geonode:3",
]

LOCK = threading.RLock()
T0 = time.time()
STOP = threading.Event()


def log(*a):
    print(time.strftime("%H:%M:%S"), f"[{int(time.time() - T0)}s]", *a, flush=True)


def jload(path, default):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return default


def jdump(path, obj, pretty=False):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        if pretty:
            json.dump(obj, f, ensure_ascii=False, indent=1, sort_keys=True)
        else:
            json.dump(obj, f, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
        f.write("\n")
    os.replace(tmp, path)


# ----------------------------------------------------------------------------- proxies
class Proxies:
    def __init__(self, extra_files=()):
        self.path = os.path.join(DATA, "_proxies.json")
        d = jload(self.path, {})
        self.good = list(dict.fromkeys(d.get("good", [])))
        self.extra_files = extra_files
        self.score = {p: [1, 1] for p in self.good}  # [ok, fail]
        self.last_refresh = 0
        self.fail_streak = 0
        self.lock = threading.Lock()

    @staticmethod
    def norm(p):
        p = p.strip()
        if not p or p.startswith("#"):
            return None
        if "://" not in p:
            p = "http://" + p
        if p.startswith("https://"):  # an "https" proxy in these lists is an HTTP CONNECT proxy on port 443 etc.
            p = "http://" + p[8:]
        return p

    def candidates(self):
        out = []
        for src in PROXY_SOURCES:
            try:
                if src.startswith("geonode:"):
                    u = ("https://proxylist.geonode.com/api/proxy-list?country=IN&limit=500&page=%s"
                         "&sort_by=lastChecked&sort_type=desc" % src.split(":")[1])
                    for x in requests.get(u, timeout=20).json().get("data", []):
                        for proto in x.get("protocols", ["http"]):
                            proto = "http" if proto == "https" else proto
                            out.append(f"{proto}://{x['ip']}:{x['port']}")
                else:
                    out += requests.get(src, timeout=20).text.split()
            except Exception as e:
                log("proxy source failed", src[:60], type(e).__name__)
        for f in self.extra_files:
            try:
                out += open(f).read().split()
            except Exception:
                pass
        return [p for p in dict.fromkeys(self.norm(x) for x in out) if p]

    @staticmethod
    def test(p):
        try:
            r = requests.get(PROBE, proxies={"https": p, "http": p}, timeout=12, verify=False)
            return p, r.status_code == 200 and b"svg" in r.content[:800]
        except Exception:
            return p, False

    def refresh(self, force=False):
        with self.lock:
            if time.time() - self.last_refresh < (60 if force else 600):
                return
            self.last_refresh = time.time()
        cands = list(dict.fromkeys(self.candidates() + self.good))
        with cf.ThreadPoolExecutor(150) as ex:
            res = list(ex.map(self.test, cands))
        alive = [p for p, ok in res if ok]
        with self.lock:
            # keep the previously good ones too (the site has bad spells where every proxy fails)
            keep = [p for p in self.good if self.score.get(p, [1, 1])[0] > 1] + alive
            self.good = list(dict.fromkeys(keep))[:400] or self.good
            for p in alive:
                self.score.setdefault(p, [1, 1])
            self.fail_streak = 0
        log("proxy refresh: candidates", len(cands), "alive now", len(alive), "pool", len(self.good))

    def pick(self, k):
        with self.lock:
            pool = self.good or []
            if not pool:
                return []
            w = [(self.score.get(p, [1, 1])[0] + 0.5) / (sum(self.score.get(p, [1, 1])) + 1) for p in pool]
            chosen = set()
            for _ in range(k * 4):
                if len(chosen) >= min(k, len(pool)):
                    break
                chosen.add(random.choices(pool, weights=w)[0])
            return list(chosen)

    def mark(self, p, ok):
        with self.lock:
            s = self.score.setdefault(p, [1, 1])
            s[0 if ok else 1] += 1
            self.fail_streak = 0 if ok else self.fail_streak + 1

    def save(self):
        with self.lock:
            ranked = sorted(self.good, key=lambda p: -(self.score.get(p, [1, 1])[0] / sum(self.score.get(p, [1, 1]))))
        jdump(self.path, {"good": ranked[:150], "updated": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}, pretty=True)


PX = None
EX = cf.ThreadPoolExecutor(300)


def _one(p, url):
    r = requests.get(url, proxies={"https": p, "http": p}, timeout=45, verify=False)
    if r.status_code >= 500:
        raise RuntimeError(r.status_code)
    return p, r


def ok_page(t):
    return ("தேடுதல் வரையறை" in t) or ("Error Page" in t) or t.lstrip().startswith("<?xml") or "<option" in t


def race(url, width=7, rounds=60):
    """GET url through `width` random proxies at once; first valid page wins."""
    for rd in range(rounds):
        if STOP.is_set():
            raise RuntimeError("stopping")
        ps = PX.pick(width)
        if len(ps) < 3:
            PX.refresh(force=True)
            ps = PX.pick(width)
        futs = {EX.submit(_one, p, url): p for p in ps}
        won = None
        for f in cf.as_completed(futs):
            p = futs[f]
            try:
                _, r = f.result()
                if ok_page(r.text):
                    PX.mark(p, True)
                    won = r.text
                    break
                PX.mark(p, False)
            except Exception:
                PX.mark(p, False)
        if won is not None:
            return won
        if PX.fail_streak > 400:
            threading.Thread(target=PX.refresh, daemon=True).start()
        time.sleep(min(30, 3 + rd))
    raise RuntimeError("race failed: " + url[:160])


def q_url(**q):
    return P + "webHP?" + up.urlencode(dict(requestType="ApplicationRH", **q))


def get(**q):
    """fetch; retry a few times when the site answers with its generic error page"""
    url = q_url(**q)
    t = ""
    for _ in range(3):
        t = race(url)
        if "Error Page" in t and "தேடுதல் வரையறை" not in t:
            time.sleep(3)
            continue
        return url, t
    return url, t


def opts(x):
    return [[a, re.sub(r"\s+", " ", html.unescape(b)).strip()]
            for a, b in re.findall(r"<option value='(-?\d+)'>([^<]*)</option>", x) if a not in ("-1", "0")]


# ----------------------------------------------------------------------------- parsing
def n_items(h):
    if "Nothing found" in h or "காட்சிமைப்படுத்த எதுவும் இல்லை" in h:
        return 0
    m = re.search(r"([\d,]+) items found", h)
    if m:
        return int(m.group(1).replace(",", ""))
    if "One item found" in h:
        return 1
    return -1


def cells(tr):
    return [re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", td))).strip()
            for td in re.findall(r"<td[^>]*>(.*?)</td>", tr, re.S)]


def val_unit(s):
    m = re.match(r"([\d.,]+)\s*/\s*(.+)", s.strip())
    if not m:
        return None, None
    v = float(m.group(1).replace(",", ""))
    v = int(v) if v.is_integer() else v
    u = m.group(2).strip()
    return v, UNIT.get(u, u)


def iso(s, rev):
    m = re.match(r"(\d{2})-([A-Za-z]{3})-(\d{4})", s.strip())
    if not m:
        return ""
    d = f"{m.group(3)}-{MON[m.group(2)]:02d}-{m.group(1)}"
    return "" if d == REVS[rev]["eff"] else d


def parse_rows(h, rev):
    """-> list of (street, rate, unit, class_text, effective_from_or_'')"""
    tm = re.search(r'<table class="its" id="(?:surveyTable|searchTable)">(.*?)</table>', h, re.S)
    if not tm:
        return None
    out = []
    for tr in re.findall(r'<tr class="(?:odd|even)">(.*?)</tr>', tm.group(1), re.S):
        c = cells(tr)
        if len(c) < 6:
            continue
        _, street, brit, metric, cls, date = c[:6]
        v, u = val_unit(brit)
        if v is None:
            v, u = val_unit(metric)
        out.append((street, v, u, cls, iso(date, rev)))
    return out


# ----------------------------------------------------------------------------- data model
class Store:
    """district files in memory.  file = {district, district_id, classes[], sros{sid:{name,zone,revs{rev:{v:[[vid,name]], d:{vid:entry}}}}}}
    entry = {"n": name, "items": int, "rows": [[street, rate, unit, class_idx, eff]]}   (items = the site's 'N items found')
    or     {"n": name, "err": attempts}   (not done yet)"""

    def __init__(self):
        self.meta = jload(os.path.join(DATA, "_meta.json"), {})
        self.files = {}
        self.dirty = set()
        self.load_dir()

    def load_dir(self):
        for path in district_paths():
            d = jload(path, None)
            if d and "sros" in d:
                self.merge_remote(d)

    def dfile(self, district):
        d = self.files.get(district)
        if d is None:
            did = next((k for k, v in DISTRICTS.items() if v == district), None)
            d = self.files[district] = {
                "district": district, "district_id": did,
                "source": "Registration Department, Government of Tamil Nadu - tnreginet.gov.in guideline value search (screenId 7000057), street-wise",
                "row_format": ["street", "rate", "unit", "class (index into classes)", "effective_from if different from the revision start, else ''"],
                "units": {"ft2": "Rs per sq ft", "m2": "Rs per sq m", "ac": "Rs per acre", "ha": "Rs per hectare"},
                "revisions": {r: {"from": REVS[r]["eff"], "to": REVS[r]["to"]} for r in REV_ORDER},
                "classes": [], "sros": {}}
        return d

    def sro(self, district, sid, name=None, zone=None):
        d = self.dfile(district)
        s = d["sros"].setdefault(sid, {"name": name, "zone": zone, "revs": {}})
        if name:
            s["name"] = name
        if zone:
            s["zone"] = zone
        return s

    def cls_idx(self, d, text):
        try:
            return d["classes"].index(text)
        except ValueError:
            d["classes"].append(text)
            return len(d["classes"]) - 1

    def put_village(self, district, sid, rev, vid, name, items, rows):
        with LOCK:
            d = self.dfile(district)
            r = self.sro(district, sid)["revs"].setdefault(rev, {"v": None, "d": {}})
            r["d"][vid] = {"n": name, "items": items,
                           "rows": [[s, v, u, self.cls_idx(d, c), e] for s, v, u, c, e in rows]}
            self.dirty.add(district)

    def put_err(self, district, sid, rev, vid, name):
        with LOCK:
            r = self.sro(district, sid)["revs"].setdefault(rev, {"v": None, "d": {}})
            e = r["d"].get(vid)
            if e and "items" in e:
                return
            r["d"][vid] = {"n": name, "err": (e or {}).get("err", 0) + 1}
            self.dirty.add(district)

    # -- merge a remote copy of a district file into memory (union; a finished entry beats an unfinished one)
    def merge_remote(self, rd):
        with LOCK:
            name = rd["district"]
            d = self.dfile(name)
            changed = False
            for sid, rs in rd.get("sros", {}).items():
                ls = self.sro(name, sid, rs.get("name"), rs.get("zone"))
                if rs.get("listed_under"):
                    ls["listed_under"] = rs["listed_under"]
                for rev, rr in rs.get("revs", {}).items():
                    lr = ls["revs"].setdefault(rev, {"v": None, "d": {}})
                    if lr.get("v") is None and rr.get("v") is not None:
                        lr["v"] = rr["v"]; changed = True
                    for vid, e in rr.get("d", {}).items():
                        le = lr["d"].get(vid)
                        if "items" in e and (le is None or "items" not in le):
                            lr["d"][vid] = {"n": e["n"], "items": e["items"],
                                            "rows": [[s, v, u, self.cls_idx(d, rd["classes"][c]), x] for s, v, u, c, x in e["rows"]]}
                            changed = True
                        elif le is None:
                            lr["d"][vid] = dict(e); changed = True
                        elif "err" in le and "err" in e and e["err"] > le["err"]:
                            le["err"] = e["err"]
            if changed:
                self.dirty.add(name)

    def merge_meta(self, rm):
        with LOCK:
            for k, v in rm.items():
                if k not in self.meta:
                    self.meta[k] = v
                elif isinstance(v, dict) and isinstance(self.meta[k], dict):
                    for kk, vv in v.items():
                        self.meta[k].setdefault(kk, vv)

    def write(self, all_files=False):
        with LOCK:
            os.makedirs(DATA, exist_ok=True)
            names = list(self.files) if all_files else list(self.dirty)
            for n in names:
                for rev, obj in split_by_rev(self.files[n]).items():
                    path = rev_path(n, rev)
                    os.makedirs(os.path.dirname(path), exist_ok=True)
                    jdump(path, obj)
            self.dirty.clear()
            jdump(os.path.join(DATA, "_meta.json"), self.meta, pretty=True)
            prog = self.progress()
            jdump(os.path.join(DATA, "progress.json"), prog, pretty=True)
            return prog

    def progress(self):
        sro_map = self.meta.get("sro_district", {})
        dists = {}
        tot = {r: {"sros": 0, "sros_done": 0, "villages": 0, "villages_done": 0, "villages_failed_attempts": 0, "rows": 0, "items_mismatch": 0} for r in REV_ORDER}
        for sid, dist in sro_map.items():
            dd = dists.setdefault(dist, {"sros": 0, "revs": {}})
            dd["sros"] += 1
            s = self.files.get(dist, {}).get("sros", {}).get(sid, {})
            for rev in REV_ORDER:
                rr = s.get("revs", {}).get(rev, {})
                v = rr.get("v")
                d = rr.get("d", {})
                done = sum(1 for vid, _ in (v or []) if "items" in d.get(vid, {}))
                rows = sum(len(e.get("rows", [])) for e in d.values())
                mism = sum(1 for e in d.values() if "items" in e and e["items"] != len(e["rows"]))
                fails = sum(1 for vid, _ in (v or []) if "err" in d.get(vid, {}))
                sdone = v is not None and done == len(v)
                x = dd["revs"].setdefault(rev, {"sros_done": 0, "villages": 0, "villages_done": 0, "rows": 0})
                x["sros_done"] += int(sdone); x["villages"] += len(v or []); x["villages_done"] += done; x["rows"] += rows
                t = tot[rev]
                t["sros"] += 1; t["sros_done"] += int(sdone); t["villages"] += len(v or []); t["villages_done"] += done
                t["rows"] += rows; t["items_mismatch"] += mism; t["villages_failed_attempts"] += fails
        for t in tot.values():
            t["complete"] = t["sros"] > 0 and t["sros_done"] == t["sros"]
        discovered = bool(sro_map) and self.meta.get("discovery_complete", False)
        cur = next((r for r in REV_ORDER if not tot[r]["complete"]), None)
        compact = {}
        for dist, dd in sorted(dists.items()):
            compact[dist] = {"sros": dd["sros"]}
            for rev, x in dd["revs"].items():
                compact[dist][rev] = f"{x['sros_done']}/{dd['sros']} sro, {x['villages_done']}/{x['villages']} vil, {x['rows']} rows"
        return {"updated": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                "scope": "street-wise guideline values, all SROs, revisions newest first", "revision_order": REV_ORDER,
                "districts_discovered": len([k for k in dists if k != UNMAPPED]), "sros_discovered": len(sro_map),
                "discovery_complete": discovered, "current_revision": cur,
                "all_done": discovered and cur is None, "totals": tot, "districts": compact}


def rev_path(district, rev):
    """current revision: tn_gv/<District>.json ; older revisions: tn_gv/<rev>/<District>.json (keeps every file small)"""
    if rev == REV_ORDER[0]:
        return os.path.join(DATA, safe_name(district) + ".json")
    return os.path.join(DATA, rev, safe_name(district) + ".json")


def district_paths():
    out = []
    if not os.path.isdir(DATA):
        return out
    for fn in os.listdir(DATA):
        if fn.endswith(".json") and not fn.startswith("_") and fn != "progress.json":
            out.append(os.path.join(DATA, fn))
    for rev in REV_ORDER[1:]:
        dd = os.path.join(DATA, rev)
        if os.path.isdir(dd):
            out += [os.path.join(dd, fn) for fn in os.listdir(dd) if fn.endswith(".json")]
    return out


def split_by_rev(d):
    out = {}
    for rev in REV_ORDER:
        sros = {}
        for sid, s in d["sros"].items():
            if rev in s["revs"]:
                sros[sid] = {k: v for k, v in s.items() if k != "revs"}
                sros[sid]["revs"] = {rev: s["revs"][rev]}
        if not sros:
            continue
        o = {k: v for k, v in d.items() if k not in ("sros", "revisions")}
        o["revision"] = rev
        o["valid"] = {"from": REVS[rev]["eff"], "to": REVS[rev]["to"]}
        o["sros"] = sros
        out[rev] = o
    return out


def safe_name(s):
    return re.sub(r"[^A-Za-z0-9_\-]+", "-", s).strip("-")


# ----------------------------------------------------------------------------- git sync
def git(*a, check=True):
    r = subprocess.run(["git", "-C", REPO] + list(a), capture_output=True, text=True)
    if check and r.returncode:
        raise RuntimeError("git " + " ".join(a) + ": " + r.stderr[-400:])
    return r


def sync(store, msg, use_git=True):
    if not use_git:
        return store.write()
    for attempt in range(8):
        try:
            git("fetch", "--depth=1", "origin", "main")
            with LOCK:
                git("reset", "-q", "--hard", "FETCH_HEAD")
                # fold whatever other runners pushed into memory, then write memory back out
                rm = jload(os.path.join(DATA, "_meta.json"), {})
                store.merge_meta(rm)
                store.load_dir()
                prog = store.write(all_files=True)
                PX.save()
            git("add", DATA_REL)
            if git("diff", "--cached", "--quiet", check=False).returncode == 0:
                return prog
            t = prog["totals"]
            m = f"{msg}: " + ", ".join(f"{r} {t[r]['villages_done']}/{t[r]['villages']} vil {t[r]['rows']} rows"
                                       for r in REV_ORDER if t[r]["villages_done"]) or msg
            git("-c", "user.name=tn-gv-collect", "-c", "user.email=actions@users.noreply.github.com", "commit", "-q", "-m", m[:240])
            r = git("push", "-q", "origin", "HEAD:main", check=False)
            if r.returncode == 0:
                log("pushed", git("rev-parse", "--short", "HEAD").stdout.strip(), m[:160])
                return prog
            log("push rejected, retrying", r.stderr[-200:])
        except Exception as e:
            log("sync error", e)
        time.sleep(5 + random.random() * 10 * (attempt + 1))
    log("sync gave up this round")
    return store.write(all_files=True)


# ----------------------------------------------------------------------------- crawl
def discover(store):
    m = store.meta
    if m.get("discovery_complete"):
        return
    m.setdefault("zones", {})
    m.setdefault("district_sros", {})
    jobs = [("z", z) for z in ZONES if z not in m["zones"]] + [("d", d) for d in DISTRICTS if d not in m["district_sros"]]

    def one(j):
        kind, k = j
        try:
            if kind == "z":
                _, x = get(actionVal="getSroByZone", screenId="7000057", zoneId=k)
            else:
                _, x = get(actionVal="getSroOptionByDistrict", screenId="7000054", districtId=k)
            o = opts(x)
            if not o:
                return j, None
            return j, o
        except Exception as e:
            log("discover fail", j, e)
            return j, None

    with cf.ThreadPoolExecutor(12) as ex:
        for (kind, k), o in ex.map(one, jobs):
            if o is None:
                continue
            with LOCK:
                (m["zones"] if kind == "z" else m["district_sros"])[k] = o
    if len(m["zones"]) == len(ZONES) and len(m["district_sros"]) == len(DISTRICTS):
        sd = {}
        listed = {}
        for did, lst in m["district_sros"].items():
            for sid, nm in lst:
                listed.setdefault(sid, []).append(did)
        m["sro_zone"] = {}
        m["sro_name"] = {}
        m["sro_listed_under"] = {}
        for z, lst in m["zones"].items():
            for sid, nm in lst:
                m["sro_zone"][sid] = z
                m["sro_name"][sid] = nm
                cands = sorted(listed.get(sid, []), key=int)
                if not cands:
                    sd[sid] = UNMAPPED
                    continue
                m["sro_listed_under"][sid] = [DISTRICTS[c] for c in cands]
                # an SRO can serve villages in several districts; file it under one:
                # 1) the district named in the SRO's own name, else 2) the newest (highest-id, carved-out) district listing it
                named = [c for c in cands if re.search(DIST_TA[DISTRICTS[c]], nm)]
                sd[sid] = SRO_HOME.get(sid) or DISTRICTS[(named or cands)[-1]]
        m["sro_district"] = sd
        m["discovery_complete"] = True
        m["discovered_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        log("discovery complete:", len(sd), "SROs,", len(set(sd.values())), "districts (incl. unmapped)")
    else:
        log("discovery partial", len(m["zones"]), "zones", len(m["district_sros"]), "districts")


def village_list(store, dist, sid, rev):
    s = store.sro(dist, sid, store.meta["sro_name"][sid], store.meta["sro_zone"][sid])
    s["listed_under"] = store.meta.get("sro_listed_under", {}).get(sid, [dist])
    r = s["revs"].setdefault(rev, {"v": None, "d": {}})
    if r["v"] is not None:
        return r["v"]
    R = REVS[rev]
    _, x = get(actionVal="getVillageBySro", screenId="7000057", sroId=sid, fromDate=R["fromDate"], toDate=R["toDate"])
    if "<option" not in x and "<?xml" not in x and "Error Page" in x:
        raise RuntimeError("village list error page")
    with LOCK:
        r["v"] = opts(x)
        store.dirty.add(dist)
    return r["v"]


def street_search(store, dist, sid, rev, vid, vname):
    R = REVS[rev]
    zone = store.meta["sro_zone"][sid]
    q = dict(actionVal="criteriaSearch", screenId="7000057", toDate=R["toDate"], fromDate=R["fromDate"],
             fromLabel=R["fromLabel"], toLabel=R["toLabel"], zoneName=ZONES[zone], sroName=store.meta["sro_name"][sid],
             villageName=vname, cmb_zone=zone, cmb_sub_registrar_office=sid, cmb_reg_village=vid,
             zoneIdoc=zone, SROIdoc=sid, villageIdoc=vid, cmbCategory="0", searchCriteria="1", txt_SearchCriteria="%")
    for attempt in range(3):
        _, h = get(**q)
        n = n_items(h)
        if n < 0:
            continue
        if n == 0:
            return 0, []
        rows = parse_rows(h, rev) or []
        pk = re.search(r"(d-\d+-p)=\d+", h)
        pages = (n + 9) // 10
        if pages > 1 and pk:
            def pg(k):
                for _ in range(3):
                    _, h2 = get(**dict(q, **{pk.group(1): str(k)}))
                    rr = parse_rows(h2, rev)
                    if rr:
                        return rr
                return []
            with cf.ThreadPoolExecutor(4) as ex:
                for rr in ex.map(pg, range(2, pages + 1)):
                    rows += rr
        if len(rows) == n:
            return n, rows
        log("count mismatch", dist, sid, rev, vname, "site", n, "got", len(rows), "attempt", attempt + 1)
        if attempt == 2:
            return n, rows  # keep what we have; progress.json flags it under items_mismatch
    raise RuntimeError("search failed")


def run(store, args):
    deadline = T0 + args.minutes * 60
    last_sync = time.time()
    pool = cf.ThreadPoolExecutor(args.workers)
    shard_i, shard_n = (int(x) for x in args.shard.split("/"))

    def maybe_sync(force=False):
        nonlocal last_sync
        if force or time.time() - last_sync > args.sync_minutes * 60:
            p = sync(store, f"TN GV {args.label}", not args.no_git)
            last_sync = time.time()
            return p

    discover(store)
    maybe_sync(force=True)
    if not store.meta.get("discovery_complete"):
        log("discovery incomplete; will retry next run")
        return
    sd = store.meta["sro_district"]
    dists = sorted(set(sd.values()), key=lambda n: (n == UNMAPPED, n))
    dists = [d for i, d in enumerate(dists) if i % shard_n == shard_i]
    if args.reverse:
        dists = dists[::-1]
    for rev in REV_ORDER:
        for dist in dists:
            if time.time() > deadline:
                break
            sids = sorted(s for s, d in sd.items() if d == dist)
            # village lists
            def vl(sid):
                for _ in range(3):
                    try:
                        return village_list(store, dist, sid, rev)
                    except Exception as e:
                        log("village list fail", dist, sid, rev, e)
                return None
            lists = dict(zip(sids, pool.map(vl, sids)))
            todo = []
            for sid, v in lists.items():
                if v is None:
                    continue
                d = store.files[dist]["sros"][sid]["revs"][rev]["d"]
                for vid, vn in v:
                    e = d.get(vid)
                    if e and "items" in e:
                        continue
                    if e and e.get("err", 0) >= args.max_err:
                        continue  # parked; a later run with --max-err raised retries it
                    todo.append((sid, vid, vn))
            if not todo:
                continue
            log("==", rev, dist, "SROs", len(sids), "villages to fetch", len(todo))

            def task(x):
                sid, vid, vn = x
                if time.time() > deadline or STOP.is_set():
                    return
                try:
                    n, rows = street_search(store, dist, sid, rev, vid, vn)
                    store.put_village(dist, sid, rev, vid, vn, n, rows)
                except Exception as e:
                    store.put_err(dist, sid, rev, vid, vn)
                    log("village fail", dist, sid, rev, vn, str(e)[:80])

            futs = [pool.submit(task, x) for x in todo]
            done = 0
            for f in cf.as_completed(futs):
                done += 1
                if done % 50 == 0:
                    log(rev, dist, f"{done}/{len(todo)}")
                maybe_sync()
            maybe_sync()
        if time.time() > deadline:
            break
    STOP.set()
    log("run finished")


# ----------------------------------------------------------------------------- seeding from the sandbox pilot
def seed(store, raw_dir, state_file):
    """Fold the Pallavaram pilot (raw result pages + its state) into the store."""
    st = jload(state_file, {"done": {}})
    meta = store.meta
    for k, v in st["done"].items():
        p = k.split("|")
        if p[0] == "vil":
            sid, rev = p[1], p[2]
            dist = meta.get("sro_district", {}).get(sid)
            if dist:
                so = store.sro(dist, sid, meta["sro_name"][sid], meta["sro_zone"][sid])
                so["listed_under"] = meta.get("sro_listed_under", {}).get(sid, [dist])
                r = so["revs"].setdefault(rev, {"v": None, "d": {}})
                if r["v"] is None:
                    r["v"] = [[a, re.sub(r"\s+", " ", b).strip()] for a, b in v]
    n_seeded = 0
    for k, v in st["done"].items():
        p = k.split("|")
        if p[0] != "st" or not isinstance(v, dict) or v.get("n", -1) < 0:
            continue
        sid, rev, vid = p[1], p[2], p[3]
        dist = meta["sro_district"].get(sid)
        r = store.files[dist]["sros"][sid]["revs"][rev]
        vname = next((b for a, b in r["v"] if a == vid), vid)
        rows = []
        files = sorted(v["files"], key=lambda f: int(re.search(r"_p(\d+)\.html$", f).group(1)))
        for f in files:
            h = open(os.path.join(raw_dir, f), encoding="utf-8", errors="ignore").read()
            rows += parse_rows(h, rev) or []
        store.put_village(dist, sid, rev, vid, vname, v["n"], rows)
        n_seeded += 1
    log("seeded", n_seeded, "village-revision street searches from the pilot")


def main():
    global PX
    ap = argparse.ArgumentParser()
    ap.add_argument("--minutes", type=float, default=290)
    ap.add_argument("--workers", type=int, default=24)
    ap.add_argument("--shard", default="0/1")
    ap.add_argument("--reverse", action="store_true")
    ap.add_argument("--sync-minutes", type=float, default=25)
    ap.add_argument("--max-err", type=int, default=6)
    ap.add_argument("--no-git", action="store_true")
    ap.add_argument("--label", default="collect")
    ap.add_argument("--proxy-files", nargs="*", default=[])
    ap.add_argument("--seed-raw")
    ap.add_argument("--seed-state")
    ap.add_argument("--discover-only", action="store_true")
    args = ap.parse_args()
    os.makedirs(DATA, exist_ok=True)
    store = Store()
    prog = jload(os.path.join(DATA, "progress.json"), {})
    if prog.get("all_done"):
        log("all revisions done; nothing to do")
        print("::notice::TN GV collection complete")
        return 0
    PX = Proxies(args.proxy_files)
    if len(PX.good) < 25:
        PX.refresh(force=True)
    if args.discover_only or args.seed_raw:
        discover(store)
        if args.seed_raw:
            seed(store, args.seed_raw, args.seed_state)
        sync(store, "TN GV seed/discovery", not args.no_git)
        return 0
    try:
        run(store, args)
    finally:
        STOP.set()
        prog = sync(store, f"TN GV {args.label} (end of run)", not args.no_git)
        log("totals", json.dumps(prog.get("totals", {}), ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
