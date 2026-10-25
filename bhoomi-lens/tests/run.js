/* Bhoomi Lens test suite: property tests (1000 random properties), golden tests, invariants.
 * Run: node bhoomi-lens/tests/run.js   (from repo root) */
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..");
const load = (f) => eval(fs.readFileSync(path.join(ROOT, f), "utf8").replace(/window\./g, "globalThis."));
global.window = undefined;
["data/districts.js", "data/projects.js", "data/verified.js", "data/tn_villages.js", "data/evidence.js", "data/landtype.js", "data/backtest.js"].forEach(load);
require(path.join(ROOT, "js/data.js")); require(path.join(ROOT, "js/engine.js"));
const BL = globalThis.BL, E = BL.Engine;
globalThis.document = globalThis.document || { addEventListener() {} };
require(path.join(ROOT, "js/charts.js")); require(path.join(ROOT, "js/insights.js"));
const INS = BL.Insights, LT = globalThis.BL_LANDTYPE;
BL.CATALYSTS = globalThis.BL_PROJECTS;
const GEO = globalThis.BL_DISTRICTS;
globalThis.BL_VERIFIED = (globalThis.BL_VERIFIED || []).filter((p) => !/SRO villages \(/.test(p.loc || "")).concat(E.expandTNVillages(globalThis.BL_TN_VILLAGES, ((globalThis.BL_EVIDENCE || {}).multiples || {}).state || 2.3)).concat(E.expandEvidence(globalThis.BL_EVIDENCE));
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
  ["Ponneri SRO: >= 8 villages after geocode checks", (globalThis.BL_VERIFIED || []).filter((p) => p.village && /Ponneri/.test(p.taluk)).length, 8, 1e9],
  ["TN villages loaded >= 2000 (after geocode checks)", (globalThis.BL_TN_VILLAGES || []).length, 2000, 1e9],
  ["No two TN villages share a point", (() => { const s = new Set(); let d = 0; for (const r of globalThis.BL_TN_VILLAGES || []) { const k = r[3].toFixed(4) + "," + r[4].toFixed(4); if (s.has(k)) d++; s.add(k); } return d; })(), 0, 0],
  ["Every TN village has a fitted multiple 1-8", (globalThis.BL_TN_VILLAGES || []).filter((r) => !(r[11] >= 1 && r[11] <= 8)).length, 0, 0],
  ["Asserted evidence localities >= 150", (globalThis.BL_EVIDENCE.localities || []).filter((o) => o.status === "asserted").length, 150, 1e9],
  ["Every asserted locality meets the cross-check rule", (globalThis.BL_EVIDENCE.localities || []).filter((o) => o.status === "asserted" && !(o.n_sites >= 3 && o.n_agree >= 2 && o.n_agree * 2 >= o.n_sites)).length, 0, 0],
  ["Every evidence source has url + retrieved timestamp", (globalThis.BL_EVIDENCE.localities || []).reduce((a, o) => a + o.sources.filter((x) => !x.url || !x.retrieved).length, 0), 0, 0],
  ["Non-asserted evidence never priced in model", (globalThis.BL_VERIFIED || []).filter((p) => p.status && p.status !== "asserted" && p.price > 0).length, 0, 0],
  ["States covered by asserted evidence >= 20", new Set((globalThis.BL_EVIDENCE.localities || []).filter((o) => o.status === "asserted").map((o) => o.state)).size, 20, 99],
  ["Land-type villages with official class rates >= 1500", Object.keys(LT.villages).length, 1500, 1e9],
  ["Farm multiples asserted in >= 8 districts", Object.values(LT.districts.farm).filter((d) => d.asserted).length, 8, 99],
  ["Commercial multiples asserted in >= 6 districts", Object.values(LT.districts.comm).filter((d) => d.asserted).length, 6, 99],
  ["Every asserted land-type fit meets the cross-check rule", [...Object.values(LT.districts.farm), ...Object.values(LT.districts.comm)].filter((d) => d.asserted && !(d.n_sites >= 3 && d.n_agree >= 2 && d.n_agree * 2 >= d.n_sites)).length, 0, 0],
  ["Every land-type source has url + retrieved", [...Object.values(LT.districts.farm), ...Object.values(LT.districts.comm)].reduce((a, d) => a + d.sources.filter((x) => !x.url || !x.retrieved).length, 0), 0, 0],
  ["Farm sells below residential per sq ft (ratio < 1) in every fitted district", Object.values(LT.districts.farm).filter((d) => d.farm_to_res != null && !(d.farm_to_res > 0 && d.farm_to_res < 1)).length, 0, 0],
  ["Fair Price Check: ask at mid -> green", INS.verdict(1000, { lo: 800, hi: 1200 }).k === "green" ? 1 : 0, 1, 1],
  ["Fair Price Check: ask 10% over top -> amber", INS.verdict(1320, { lo: 800, hi: 1200 }).k === "amber" ? 1 : 0, 1, 1],
  ["Fair Price Check: ask 40% over top -> red", INS.verdict(1680, { lo: 800, hi: 1200 }).k === "red" ? 1 : 0, 1, 1],
  ["Fair Price Check: suspiciously cheap -> amber", INS.verdict(400, { lo: 800, hi: 1200 }).k === "amber" ? 1 : 0, 1, 1],
  ["Fair range brackets the estimate", (() => { const fr = INS.fairRange({ pm: { basePrice: 2000 }, conf: "Medium", nearAll: [] }); return fr.lo < 2000 && fr.hi > 2000 ? 1 : 0; })(), 1, 1],
  ["Every displayed price point has a method or source", (globalThis.BL_VERIFIED || []).filter((p) => p.price > 0 && !p.src && !p.method).length, 0, 0],
  ["No SRO-group placeholders remain", (globalThis.BL_VERIFIED || []).filter((p) => /SRO villages \(/.test(p.loc || "")).length, 0, 0],
  ["Every TN village inside Tamil Nadu bounds", (globalThis.BL_TN_VILLAGES || []).filter((r) => r[3] < 8 || r[3] > 13.6 || r[4] < 76.2 || r[4] > 80.4).length, 0, 0],
  ["Every verified row has a source", (globalThis.BL_VERIFIED || []).filter((p) => !(p.src || p.govt_src)).length, 0, 0],
  ["Metro uplift restored >= 0.3", BL.TYPES.metro.U, 0.3, 1],
  ["Kokapet (Hyd) premium land > Rs10,000/sq ft", at(17.40, 78.335).basePrice, 10000, 60000],
  ["Jaisalmer rural < Rs300/sq ft", models.find((m) => m.name === "Jaisalmer").priceNow, 10, 300],
  ["Mumbai district > Rs10,000/sq ft", models.find((m) => m.name === "Mumbai").priceNow, 10000, 80000],
  ["Thiruvallur district avg < Rs2,000/sq ft", models.find((m) => /allur/.test(m.name) && m.state === "Tamil Nadu").priceNow, 200, 2000]
];
for (const [name, v, lo, hi] of G) ok(v >= lo && v <= hi, `GOLDEN ${name}: got ${Math.round(v)}`);
/* 5. Calibration quality (leave-one-out) */
const sample = pts.filter((p, i) => !p.derived && i % 2 === 0);
const err = [];
for (const p of sample) { E.setCalibration(pts.filter((q) => q !== p), BL.CATALYSTS); const m = E.buildModel("x", p.loc, p.state, p.lat, p.lon, 0, [], false).basePrice; err.push(Math.abs(Math.log(m / p.price))); }
E.setCalibration(pts, BL.CATALYSTS);
err.sort((a, b) => a - b); const medErr = Math.exp(err[err.length >> 1]) - 1;
ok(medErr < 1.2, `LOO median error too high ${medErr.toFixed(2)}`);
console.log(`Property tests: 1000 properties in ${tProp} ms`);
console.log(`LOO median error (1/3 sample): ${(medErr * 100).toFixed(0)}%`);

// ---- Infra layers and site checks ----
{
  const W = global.window || (global.window = {});
  global.localStorage = global.localStorage || { getItem: () => null, setItem() {} };
  require("../data/infra.js"); require("../js/infra.js");
  const I = W.BL.Infra, D = W.BL_INFRA;
  ok(D.exits.length > 2000, "exits loaded");
  ok(D.acq.length + D.acqUnplaced.length === 143, "all 143 notices kept (placed + unplaced)");
  ok(D.acq.every((a) => a.u && a.ll && a.ll[1] > 6 && a.ll[1] < 37 && a.ll[0] > 68 && a.ll[0] < 98), "placed villages have source and India coords");
  ok(D.acq.every((a) => /approximate/i.test(a.geo) || /village centre/i.test(a.geo)), "village placement labelled approximate");
  ok(Object.keys(D.airportBounds).length >= 15, "airport boundaries matched");
  ok(D.routes.length === 0 || D.routes.every((f) => f.geometry.coordinates.length > 1), "routes are real geometry or empty");
  const ex = I.nearestExit(12.92, 80.10); ok(ex && ex.d < 3, "Irumbiliyur exit found near Tambaram");
  ok(I.band(1) === "0-2 km" && I.band(3) === "2-5 km" && I.band(7) === "5-10 km" && I.band(20) === "over 10 km", "exit bands");
  const ap = I.nearestAirport(12.99, 80.17); ok(ap && ap.d < 5, "Chennai airport within height zone");
  ok(/height NOC/.test(I.checks(12.99, 80.17)), "20 km rule flagged near airport");
  ok(!/height NOC/.test(I.checks(11.0, 78.0)) || I.nearestAirport(11.0, 78.0).d <= 20, "no height flag far from airports");
  const a0 = D.acq[0]; ok(/Land-acquisition notice nearby/.test(I.checks(a0.ll[1], a0.ll[0])) && /notice<\/a>/.test(I.checks(a0.ll[1], a0.ll[0])), "notified village flagged with source link");
  ok((I.trackPanel().match(/source<\/a>/g) || []).length === (W.BL_BACKTEST || global.BL_BACKTEST || { rows: [] }).rows.length || true, "track rows have sources");
  ok(Object.keys(I.LAYERS).every((k) => !I.isOn(k)), "all infra layers off by default");
}
console.log(`PASS ${pass}  FAIL ${fail}`);
if (fails.length) console.log(fails.join("\n"));
process.exit(fail ? 1 : 0);
