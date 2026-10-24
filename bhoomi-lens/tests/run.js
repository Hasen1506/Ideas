/* Bhoomi Lens test suite: property tests (1000 random properties), golden tests, invariants.
 * Run: node bhoomi-lens/tests/run.js   (from repo root) */
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..");
const load = (f) => eval(fs.readFileSync(path.join(ROOT, f), "utf8").replace(/window\./g, "globalThis."));
global.window = undefined;
["data/districts.js", "data/projects.js", "data/verified.js", "data/backtest.js"].forEach(load);
require(path.join(ROOT, "js/data.js")); require(path.join(ROOT, "js/engine.js"));
const BL = globalThis.BL, E = BL.Engine;
BL.CATALYSTS = globalThis.BL_PROJECTS;
const GEO = globalThis.BL_DISTRICTS;
const pts = (globalThis.BL_VERIFIED || []).filter((p) => p.price > 0);
E.setCalibration(pts, BL.CATALYSTS);
const models = E.prepare(GEO.features, BL.CATALYSTS);
E.calibrateDistricts(models, GEO.features, BL.CATALYSTS);
E.evaluate(models, {});
let pass = 0, fail = 0; const fails = [];
const ok = (c, msg) => { if (c) pass++; else { fail++; if (fails.length < 40) fails.push(msg); } };
// deterministic RNG
let seed = 42; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
function randomPoint() {
  for (;;) {
    const f = GEO.features[Math.floor(rnd() * GEO.features.length)];
    const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
    const ring = polys[0][0]; let b = [180, 90, -180, -90];
    for (const [x, y] of ring) { b = [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)]; }
    for (let k = 0; k < 30; k++) { const x = b[0] + rnd() * (b[2] - b[0]), y = b[1] + rnd() * (b[3] - b[1]); if (E.pointInPoly(x, y, ring)) return [x, y, f.properties]; }
  }
}
/* 1. Property tests: 1000 random properties across India */
const t0 = Date.now();
for (let i = 0; i < 1000; i++) {
  const [lon, lat, pr] = randomPoint();
  const tag = `#${i} ${pr.n},${pr.s} (${lat.toFixed(3)},${lon.toFixed(3)})`;
  const base = E.pointModel(lat, lon, BL.CATALYSTS, models, { horizon: 5, scenario: "base" });
  const bear = E.pointModel(lat, lon, BL.CATALYSTS, models, { horizon: 5, scenario: "bear" });
  const bull = E.pointModel(lat, lon, BL.CATALYSTS, models, { horizon: 5, scenario: "bull" });
  ok(isFinite(base.basePrice) && base.basePrice > 5 && base.basePrice < 400000, `${tag} price out of range ${base.basePrice}`);
  ok(base.mult > 0.5 && base.mult < 6, `${tag} 5y multiple out of range ${base.mult}`);
  ok(bear.mult <= base.mult + 1e-9 && base.mult <= bull.mult + 1e-9, `${tag} scenario order bear ${bear.mult.toFixed(3)} base ${base.mult.toFixed(3)} bull ${bull.mult.toFixed(3)}`);
  const ser = E.series(base, "base");
  ok(ser.every((s) => s.lo <= s.p + 1e-6 && s.p <= s.hi + 1e-6 && s.p > 0), `${tag} band not containing price`);
  ok(Math.abs(ser.find((s) => s.y === BL.MODEL_YEAR).p - base.basePrice) / base.basePrice < 1e-6, `${tag} today price mismatch`);
  // adding a credible operational airport next door must not lower value
  const extra = { id: "t", n: "test", t: "airport", pt: [lon + 0.05, lat], stage: 4, ann: 2020, eta: 2025, cred: 0.9 };
  const withAir = E.pointModel(lat, lon, BL.CATALYSTS.concat([extra]), models, { horizon: 5 });
  ok(E.priceAt(withAir, 2030, "base") >= E.priceAt(base, 2030, "base") - 1e-6, `${tag} new airport lowered 2030 price`);
  const f = E.calibFactor(lat, lon); ok(f > 0.02 && f < 50, `${tag} calibration factor extreme ${f}`);
}
const tProp = Date.now() - t0;
/* 2. Invariants on all districts */
for (const m of models) {
  ok(m.opp >= 3 && m.opp <= 95, `opp out of range ${m.name} ${m.opp}`);
  ok(m.risk.total >= 0 && m.risk.total <= 100, `risk out of range ${m.name}`);
  ok(m.circle > 0 && m.circle <= m.priceNow * 1.35, `circle rate implausible ${m.name} ${m.circle} vs ${m.priceNow}`);
  ok(m.lo <= m.mult && m.mult <= m.hi, `band ${m.name}`);
}
for (const c of BL.CATALYSTS) {
  const p = E.completionP(c, "base"); ok(p >= 0 && p <= 1, `completionP ${c.id}`);
  ok(c.src && /^https?:/.test(c.src), `missing source ${c.id}`);
  ok(c.asof, `missing as-of ${c.id}`);
  for (const y of [2015, 2020, 2026, 2030, 2036]) { const e = E.eff(c, y, "base"); ok(e >= 0 && e <= 1.0001, `eff range ${c.id} ${y} ${e}`); }
}
/* 3. Scrapped / delayed behaviour */
const par = BL.CATALYSTS.find((c) => c.id === "parandur_chennai");
ok(par && par.cancelled && par.scrapYear, "Parandur flagged cancelled with scrap year");
if (par) {
  ok(E.eff(par, par.scrapYear - 1) > E.eff(par, par.scrapYear + 2), "Parandur premium unwinds after scrap");
  ok(E.eff(par, 2030) < 0.05, "Parandur premium mostly gone by 2030");
}
const prr = BL.CATALYSTS.find((c) => c.id === "chennai_prr");
ok(prr && prr.delays >= 1 && prr.eta >= 2029, "Chennai PRR marked delayed with eta >= 2029");
const delayed = Object.assign({}, prr, { eta: prr.eta + 3 });
ok(E.eff(delayed, 2028, "base") <= E.eff(prr, 2028, "base") + 1e-9, "Delay lowers priced-in share");
/* 4. Golden tests (real-data anchored) */
const at = (lat, lon) => E.pointModel(lat, lon, BL.CATALYSTS, models, { horizon: 5 });
const G = [
  ["Minjur (TN) within 0.5x-2.5x of verified ~Rs1,000/sq ft", at(13.28, 80.26).basePrice, 500, 2500],
  ["Kokapet (Hyd) premium land > Rs10,000/sq ft", at(17.40, 78.335).basePrice, 10000, 60000],
  ["Jaisalmer rural < Rs300/sq ft", models.find((m) => m.name === "Jaisalmer").priceNow, 10, 300],
  ["Mumbai district > Rs10,000/sq ft", models.find((m) => m.name === "Mumbai").priceNow, 10000, 80000],
  ["Thiruvallur district avg < Rs2,000/sq ft", models.find((m) => /allur/.test(m.name) && m.state === "Tamil Nadu").priceNow, 200, 2000]
];
for (const [name, v, lo, hi] of G) ok(v >= lo && v <= hi, `GOLDEN ${name}: got ${Math.round(v)}`);
/* 5. Calibration quality (leave-one-out) */
const sample = pts.filter((_, i) => i % 3 === 0);
const err = [];
for (const p of sample) { E.setCalibration(pts.filter((q) => q !== p), BL.CATALYSTS); const m = E.buildModel("x", p.loc, p.state, p.lat, p.lon, 0, [], false).basePrice; err.push(Math.abs(Math.log(m / p.price))); }
E.setCalibration(pts, BL.CATALYSTS);
err.sort((a, b) => a - b); const medErr = Math.exp(err[err.length >> 1]) - 1;
ok(medErr < 1.2, `LOO median error too high ${medErr.toFixed(2)}`);
console.log(`Property tests: 1000 properties in ${tProp} ms`);
console.log(`LOO median error (1/3 sample): ${(medErr * 100).toFixed(0)}%`);
console.log(`PASS ${pass}  FAIL ${fail}`);
if (fails.length) console.log(fails.join("\n"));
process.exit(fail ? 1 : 0);
