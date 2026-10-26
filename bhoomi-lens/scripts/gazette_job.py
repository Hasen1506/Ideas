#!/usr/bin/env python3
"""Bhoomi Lens gazette job (runs as its own job in .github/workflows/bhoomi-recheck.yml).

Central Gazette land notices (NH 3A/3D) for all states via gazette_scraper.py, incremental and time-capped,
then villages are placed on Census 2011 village points (approximate). Owner names are never kept.

Files this job owns (and the only files it commits):
  data/gazette_raw.json  scraper store + checkpoint (records, per-state cursor, skip/pending lists). Not loaded by the page.
  data/gazette.js        window.BL_GAZETTE = {gen, notices, villages:[...]} for the map (js/infra.js).
The weekly re-check (recheck.py) owns data/updates.js and no longer touches gazette data, so the two jobs
can push in any order without overwriting each other.

First run after the split: if data/gazette_raw.json does not exist yet, the store is seeded from the
`gazette.raw` block that older versions of recheck.py wrote into data/updates.js.
"""
import json, os, re, sys, datetime, urllib.request, argparse

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
import gazette_scraper as gs

STORE = os.path.join(ROOT, "data/gazette_raw.json")
OUT = os.path.join(ROOT, "data/gazette.js")
CV = os.path.join(ROOT, ".gz/cv.parquet")
CV_URL = "https://github.com/ramSeraph/indian_admin_boundaries/releases/download/census-2011/Census_Villages.parquet"

def seed_store():
    if os.path.exists(STORE): return
    recs = []
    try:
        s = open(os.path.join(ROOT, "data/updates.js"), encoding="utf-8").read()
        recs = (json.loads(s[s.index("{"):].rstrip().rstrip(";")).get("gazette") or {}).get("raw", [])
    except Exception as e: print("no gazette block in updates.js to seed from:", e)
    json.dump({"records": recs}, open(STORE, "w"), ensure_ascii=False, separators=(",", ":"))
    print(f"seeded store with {len(recs)} records from updates.js")

def census_points():
    pts = {}
    try:
        import pyarrow.parquet as pq
        if not os.path.exists(CV):
            os.makedirs(os.path.dirname(CV), exist_ok=True)
            req = urllib.request.Request(CV_URL, headers={"User-Agent": "BhoomiLens-gazette/1.0"})
            with urllib.request.urlopen(req, timeout=300) as r: open(CV, "wb").write(r.read())
        n = lambda x: re.sub(r"[^a-z]", "", re.sub(r"\(.*?\)|\d+", "", (x or "").lower()))
        for r in pq.read_table(CV, columns=["stname", "dtname", "vilname", "Long", "Lat"]).to_pylist():
            pts.setdefault((n(r["stname"]), n(r["dtname"])[:5], n(r["vilname"])), (round(r["Long"], 5), round(r["Lat"], 5)))
    except Exception as e: print("census points unavailable:", e, file=sys.stderr)
    return pts

def build(recs, pts):
    out, placed = [], 0
    for r in recs:
        st = re.sub(r"[^a-z]", "", (r.get("state") or "").lower()); dt5 = re.sub(r"[^a-z]", "", (r.get("district") or "").lower())[:5]
        for v in r.get("villages") or []:
            ll = pts.get((st, dt5, re.sub(r"[^a-z]", "", re.sub(r"\(.*?\)|\d+", "", (v.get("v") or "").lower()))))
            placed += bool(ll)
            out.append({"v": v.get("v"), "tk": v.get("t"), "d": r.get("district"), "s": r.get("state"), "sv": v.get("sv") or [],
                        "nt": r.get("type"), "dt": r.get("date"), "so": r.get("so"), "p": r.get("project"), "km": r.get("km"),
                        "u": r.get("url"), "ll": list(ll) if ll else None})
    return out, placed

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--max-minutes", type=float, default=float(os.environ.get("GZ_MINUTES", "20")))
    ap.add_argument("--since", default="2024-01-01")
    ap.add_argument("--no-scrape", action="store_true", help="only rebuild data/gazette.js from the store")
    a = ap.parse_args()
    seed_store()
    if not a.no_scrape:
        sa = argparse.Namespace(out=STORE, since=a.since, until=datetime.date.today().isoformat(), max_minutes=a.max_minutes,
                                head_pages=5, states=",".join(gs.STATES), railways=False)
        gs.run(sa)
    recs = json.load(open(STORE)).get("records", [])
    if not recs and os.path.exists(OUT):
        print("store is empty; leaving data/gazette.js as it is"); return
    pts = census_points()
    if not pts and os.path.exists(OUT):
        print("no census points; keeping the previous data/gazette.js"); return
    vil, placed = build(recs, pts)
    # The map only draws villages that landed on a census point, so only those ship to the page.
    g = {"gen": datetime.date.today().isoformat(), "notices": len(recs), "villages_total": len(vil), "villages": [v for v in vil if v["ll"]]}
    open(OUT, "w", encoding="utf-8").write("/* Gazette land notices (scripts/gazette_job.py). Villages on Census 2011 points (approximate). */\n"
                                           "window.BL_GAZETTE=" + json.dumps(g, ensure_ascii=False, separators=(",", ":")) + ";\n")
    print(f"gazette.js: {len(recs)} notices, {len(vil)} villages, {placed} placed on census points")

if __name__ == "__main__": main()
