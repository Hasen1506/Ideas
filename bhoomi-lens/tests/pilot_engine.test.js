const test = require("node:test");
const assert = require("node:assert/strict");

globalThis.window = globalThis;
require("../js/pilot_engine.js");
const PE = globalThis.BL.PilotEngine;

test("normalizes Tamil Nadu district spelling aliases consistently", () => {
  assert.equal(PE.normalizeDistrict("Thiruvallur"), "Tiruvallur");
  assert.equal(PE.normalizeDistrict("Tiruvallur"), "Tiruvallur");
  assert.equal(PE.normalizeDistrict("Kanchipuram"), "Kancheepuram");
  assert.equal(PE.normalizeDistrict("Kancheepuram"), "Kancheepuram");
  assert.equal(PE.isPilotDistrict("Thiruvallur"), true);
  assert.equal(PE.isPilotDistrict("Kanchipuram"), true);
  assert.equal(PE.isPilotDistrict("Chengalpattu"), true);
  assert.equal(PE.isPilotDistrict("Madurai"), false);
});

test("converts TN guideline units accurately to INR per sq ft", () => {
  assert.equal(PE.toSqftRate(1000, "ft2"), 1000);
  assert.ok(Math.abs(PE.toSqftRate(10763.91, "m2") - 1000) < 0.01);
  assert.equal(PE.toSqftRate(9000, "sqyd"), 1000);
  assert.equal(PE.toSqftRate(2400000, "ground"), 1000);
  assert.equal(PE.toSqftRate(43560000, "ac"), 1000);
  assert.equal(PE.toSqftRate(-5, "ft2"), null);
  assert.equal(PE.toSqftRate(100, "unknown"), null);
});

test("deduplicates syndicated URLs and keeps evidence strata strictly separated", () => {
  const entries = [
    { d: 1.0, p: { loc: "Kelambakkam", type: "listing", typ: 4200, price: 3780, src: "https://example.com/a", lat: 12.78, lon: 80.22 } },
    // Duplicate same URL & rounded asking price — must be dropped
    { d: 1.1, p: { loc: "Kelambakkam", type: "listing", typ: 4200, price: 3780, src: "https://example.com/a", lat: 12.78, lon: 80.22 } },
    // Different domain asking
    { d: 2.0, p: { loc: "Padur", type: "consensus", typ: 4500, price: 4050, src: "https://other.in/padur", lat: 12.80, lon: 80.22 } },
    // Auction / allotment stratum
    { d: 2.5, p: { loc: "Siruseri", type: "govt_allotment", price: 3200, src: "https://sipcot.tn.gov.in/plot", lat: 12.82, lon: 80.21 } },
    // Proxy and compensation must NEVER enter independentCount
    { d: 0.5, p: { loc: "Derived Village", type: "derived_gv", derived: true, price: 2900, src: "https://tnreginet.gov.in/", lat: 12.79, lon: 80.22 } },
    { d: 0.8, p: { loc: "Parandur", type: "compensation", price: 1500, src: "https://tn.gov.in/comp", lat: 12.90, lon: 79.80 } }
  ];

  const out = PE.stratifyEvidence(entries);
  assert.equal(out.droppedDuplicates, 1);
  assert.equal(out.strata.asking.length, 2);
  // Asking price must use raw recorded typ (4200), not the -10% discounted model input (3780)
  assert.equal(out.strata.asking[0].value, 4200);
  assert.equal(out.strata.auction.length, 1);
  assert.equal(out.strata.proxy.length, 1);
  assert.equal(out.strata.compensation.length, 1);
  // Independent non-proxy count excludes proxy and compensation
  assert.equal(out.independentCount, 3);
  assert.equal(out.distinctDomainCount, 3);
});

test("abstains explicitly when independent evidence or distinct domains are below threshold", () => {
  const cv = {
    ok: true,
    medianMarketToGvRatio: 2.0,
    conformalLogRadius: 0.35,
    conformalNominalPct: 80,
    conformalEmpiricalCoveragePct: 81.2,
    anchorRelativeBaseline: { mdapePct: 18.5 },
    byDistrict: { Chengalpattu: { n: 20, medianRatio: 2.1 } }
  };

  // Only 2 non-proxy observations from 1 domain -> must ABSTAIN even if 10 proxies exist
  const sparseEntries = [
    { d: 1.0, p: { loc: "Spot A", type: "listing", typ: 3000, src: "https://same.com/1", lat: 12.8, lon: 80.1 } },
    { d: 1.5, p: { loc: "Spot B", type: "listing", typ: 3400, src: "https://same.com/2", lat: 12.8, lon: 80.1 } },
    { d: 0.2, p: { loc: "Proxy 1", type: "derived_gv", derived: true, price: 2500, src: "https://p1.in/1", lat: 12.8, lon: 80.1 } },
    { d: 0.3, p: { loc: "Proxy 2", type: "derived_gv", derived: true, price: 2600, src: "https://p2.in/2", lat: 12.8, lon: 80.1 } }
  ];

  const verdict = PE.evaluateQuote({
    askSqft: 3200,
    guidelineAnchor: { median: 1500, district: "Chengalpattu", distanceKm: 1.2 },
    nearbyEntries: sparseEntries,
    cvBenchmark: cv
  });

  assert.equal(verdict.status, "abstain");
  assert.ok(verdict.reasons.some((r) => r.includes("minimum 3")));
  assert.ok(verdict.reasons.some((r) => r.includes("minimum 2")));
  assert.equal(verdict.floorSqft, 1500);
  assert.equal(verdict.ratioToFloor, 2.13);
});

test("evaluates quote against anchor-relative corridor when coverage gate passes", () => {
  const cv = {
    ok: true,
    medianMarketToGvRatio: 2.0,
    conformalLogRadius: 0.3,
    conformalNominalPct: 80,
    conformalEmpiricalCoveragePct: 80.0,
    anchorRelativeBaseline: { mdapePct: 16.0 },
    byDistrict: { Chengalpattu: { n: 15, medianRatio: 2.0 } }
  };

  const denseEntries = [
    { d: 1.0, p: { loc: "A", type: "listing", typ: 3100, src: "https://site1.in/a", lat: 12.8, lon: 80.2 } },
    { d: 2.0, p: { loc: "B", type: "consensus", typ: 3300, src: "https://site2.in/b", lat: 12.81, lon: 80.2 } },
    { d: 3.0, p: { loc: "C", type: "govt_allotment", price: 2700, src: "https://tn.gov.in/c", lat: 12.82, lon: 80.2 } }
  ];

  const anchor = { median: 1500, streetRate: 1600, district: "Chengalpattu", distanceKm: 0.5 };

  // Street rate (1600) overrides village median (1500): mid = 3200
  const inside = PE.evaluateQuote({ askSqft: 3150, guidelineAnchor: anchor, nearbyEntries: denseEntries, cvBenchmark: cv });
  assert.equal(inside.status, "benchmarked");
  assert.equal(inside.floorSqft, 1600);
  assert.equal(inside.benchmark.midSqft, 3200);
  assert.equal(inside.position, "within_corridor");

  // Below statutory guideline floor
  const belowFloor = PE.evaluateQuote({ askSqft: 1200, guidelineAnchor: anchor, nearbyEntries: denseEntries, cvBenchmark: cv });
  assert.equal(belowFloor.status, "benchmarked");
  assert.equal(belowFloor.belowStatutoryFloor, true);
  assert.equal(belowFloor.position, "below_floor");

  // Above conformal upper corridor
  const above = PE.evaluateQuote({ askSqft: 5500, guidelineAnchor: anchor, nearbyEntries: denseEntries, cvBenchmark: cv });
  assert.equal(above.status, "benchmarked");
  assert.equal(above.position, "above_corridor");
});

test("spatially blocked CV shows anchor-relative baseline beats naive district median when GV tracks micro-location", () => {
  // Synthetic ground truth where price ≈ 2.2 × GV across very different street values
  const pairs = [
    { cluster: "c1", district: "Chengalpattu", gv: 500, price: 1120 },
    { cluster: "c2", district: "Chengalpattu", gv: 1000, price: 2150 },
    { cluster: "c3", district: "Chengalpattu", gv: 2000, price: 4500 },
    { cluster: "c4", district: "Chengalpattu", gv: 3500, price: 7600 },
    { cluster: "c5", district: "Kancheepuram", gv: 600, price: 1300 },
    { cluster: "c6", district: "Kancheepuram", gv: 1500, price: 3350 },
    { cluster: "c7", district: "Tiruvallur", gv: 800, price: 1780 },
    { cluster: "c8", district: "Tiruvallur", gv: 2500, price: 5400 }
  ];

  const cv = PE.evaluateAnchorRelativeCV(pairs, 0.2);
  assert.equal(cv.ok, true);
  assert.equal(cv.observations, 8);
  assert.equal(cv.clusters, 8);
  assert.ok(cv.anchorRelativeBaseline.mdapePct < cv.naiveDistrictMedian.mdapePct);
  assert.ok(cv.anchorRelativeBaseline.mdapePct < 5);
  assert.ok(cv.conformalEmpiricalCoveragePct >= 75);
});

test("nearbyCatalysts finds recorded projects across pt, path, and ring within radius", () => {
  const projects = [
    { id: "p1", n: "Point Hub", t: "airport", st: "Approved", pt: [80.18, 12.89], url: "https://gov.in/p1" },
    { id: "p2", n: "Corridor Line", t: "metro", st: "Under construction", path: [[80.15, 12.88], [80.20, 12.92]] },
    { id: "p3", n: "Far Project", t: "port", st: "Planned", pt: [77.0, 11.0] },
    { id: "p4", n: "User Sandbox", t: "metro", user: true, pt: [80.18, 12.89] }
  ];
  const near = PE.nearbyCatalysts(12.886, 80.183, projects, 15);
  assert.equal(near.length, 2);
  assert.equal(near[0].id, "p1");
  assert.equal(near[1].id, "p2");
  assert.ok(near.every((x) => x.id !== "p4"), "user sandbox items are excluded from factual catalysts");
});

test("dueDiligenceChecklist and formatUnderwritingMemoMarkdown preserve strict Tier 1/2/3 separation", () => {
  const cv = {
    ok: true,
    medianMarketToGvRatio: 2.5,
    conformalLogRadius: 0.4,
    conformalNominalPct: 80,
    conformalEmpiricalCoveragePct: 79.5,
    anchorRelativeBaseline: { mdapePct: 22.0 },
    byDistrict: { Chengalpattu: { n: 20, medianRatio: 2.5 } }
  };
  const dense = [
    { d: 1.0, p: { loc: "A", type: "listing", typ: 4000, src: "https://a.in/1", lat: 12.88, lon: 80.18 } },
    { d: 1.5, p: { loc: "B", type: "govt_allotment", price: 3200, src: "https://b.gov.in/2", lat: 12.88, lon: 80.18 } },
    { d: 2.0, p: { loc: "C", type: "consensus", typ: 4200, src: "https://c.in/3", lat: 12.88, lon: 80.18 } }
  ];
  const below = PE.evaluateQuote({
    askSqft: 1100,
    guidelineAnchor: { median: 1650, district: "Chengalpattu", distanceKm: 0 },
    nearbyEntries: dense,
    cvBenchmark: cv
  });
  const checklist = PE.dueDiligenceChecklist(below);
  assert.equal(checklist[0].priority, "urgent");
  assert.match(checklist[0].detail, /Section 47A/);

  const memo = PE.formatUnderwritingMemoMarkdown(below, {
    village: { v: "Sittalapakkam", sro: "Tambaram", d: "Chengalpattu", nSt: 548, p10: 1320, p90: 3850, g17: 64.2 },
    heuristicSqft: 4585
  });
  assert.match(memo, /## Tier 1 · Observed Primary Evidence/);
  assert.match(memo, /## Tier 2 · Benchmarked Estimate/);
  assert.match(memo, /## Tier 3 · Heuristic Context/);
  assert.match(memo, /## Buyer Due-Diligence Checklist/);
});

test("evaluateBlindAuctionRows rejects leaked URLs, abstains in sparse zones, and scores unseen clearing prices", () => {
  const cv = {
    ok: true,
    medianMarketToGvRatio: 2.5,
    conformalLogRadius: 0.4,
    conformalNominalPct: 80,
    conformalEmpiricalCoveragePct: 80.0,
    anchorRelativeBaseline: { mdapePct: 20.0 },
    byDistrict: { Chengalpattu: { n: 20, medianRatio: 2.5 } }
  };
  const villages = [
    { v: "DenseVillage", sro: "SRO1", d: "Chengalpattu", lat: 12.88, lon: 80.18, med: 1500 },
    { v: "SparseVillage", sro: "SRO2", d: "Chengalpattu", lat: 12.40, lon: 79.80, med: 500 }
  ];
  const pool = [
    { loc: "A", type: "listing", typ: 3700, src: "https://a.in/1", lat: 12.88, lon: 80.18 },
    { loc: "B", type: "govt_allotment", price: 3400, src: "https://b.gov.in/2", lat: 12.89, lon: 80.18 },
    { loc: "C", type: "consensus", typ: 3900, src: "https://c.in/3", lat: 12.87, lon: 80.19 }
  ];
  const blind = [
    // Valid unseen auction in dense village (actual 3800 vs mid 3750 -> covered)
    { auctionId: "AUC-1", district: "Chengalpattu", lat: 12.881, lon: 80.181, priceSqft: 3800, sourceUrl: "https://tnhb.tn.gov.in/unseen-1" },
    // Valid unseen auction in sparse village -> must ABSTAIN
    { auctionId: "AUC-2", district: "Chengalpattu", lat: 12.401, lon: 79.801, priceSqft: 1400, sourceUrl: "https://tnhb.tn.gov.in/unseen-2" },
    // Leaked URL already present in nearbyPool -> must be rejected
    { auctionId: "AUC-LEAK", district: "Chengalpattu", lat: 12.881, lon: 80.181, priceSqft: 3400, sourceUrl: "https://b.gov.in/2" }
  ];
  const out = PE.evaluateBlindAuctionRows(blind, {
    villages,
    nearbyPool: pool,
    cvBenchmark: cv,
    districtMedians: { Chengalpattu: 2000 }
  });
  assert.equal(out.ok, true);
  assert.equal(out.leakageRejected, 1);
  assert.equal(out.evaluatedRows, 2);
  assert.equal(out.benchmarkedCount, 1);
  assert.equal(out.abstainedCount, 1);
  assert.equal(out.blindCoveragePct, 100);
  assert.equal(out.beatsNaiveOnMdape, true);
  assert.equal(out.meetsMinSampleGate, false);
});

