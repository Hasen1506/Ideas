#!/usr/bin/env node
/**
 * Tamil Nadu Residential Plot Pilot — 10-Quote Corridor Underwriting Brief Contract Suite
 *
 * Evaluates 10 representative residential plot quotes spanning all 3 pilot districts
 * (Chengalpattu, Kancheepuram, Tiruvallur), covering:
 *  - Benchmarked within-corridor, below-floor, and above-corridor quotes
 *  - Exact street-level statutory floor locking
 *  - Non-sqft buyer quote units (cent, ground, sq yd, total price)
 *  - Sparse villages where Tier 2 MUST explicitly ABSTAIN
 *
 * Asserts strict Tier 1 / Tier 2 / Tier 3 epistemic separation and writes
 * bhoomi-lens/data/tn_pilot_10quote_check.json.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");

function loadAll() {
  globalThis.window = globalThis;
  for (const rel of [
    "js/data.js",
    "js/engine.js",
    "data/verified.js",
    "data/evidence.js",
    "data/projects.js",
    "data/tn_pilot.js",
    "js/pilot_engine.js"
  ]) {
    require(path.join(ROOT, rel));
  }
  const PE = globalThis.BL.PilotEngine;
  const E = globalThis.BL.Engine;
  return {
    PE,
    pilot: globalThis.BL_TN_PILOT,
    verified: PE.collectPilotEvidencePool(globalThis.BL_VERIFIED, globalThis.BL_EVIDENCE, E.expandEvidence),
    projects: globalThis.BL_PROJECTS || []
  };
}

function run() {
  const { PE, pilot, verified, projects } = loadAll();
  const findVillage = (dist, gateFlag, idx = 0) => {
    const hits = pilot.villages.filter((v) => v.d === dist && Boolean(v.gate) === gateFlag);
    assert.ok(hits.length > idx, `Expected village in ${dist} with gate=${gateFlag}`);
    return hits[idx];
  };

  const vChPass0 = findVillage("Chengalpattu", true, 0);
  const vChPass1 = findVillage("Chengalpattu", true, 1);
  const vChAbs = findVillage("Chengalpattu", false, 0);
  const vKaPass = findVillage("Kancheepuram", true, 0);
  const vKaAbs = findVillage("Kancheepuram", false, 0);
  const vTiPass0 = findVillage("Tiruvallur", true, 0);
  const vTiPass1 = findVillage("Tiruvallur", true, 1);
  const vTiAbs = findVillage("Tiruvallur", false, 0);

  const cases = [
    {
      id: "Q01",
      label: "Chengalpattu benchmarked within-corridor (per sq ft)",
      village: vChPass0,
      askSqft: Math.round(vChPass0.med * 2.8),
      expectStatus: "benchmarked",
      expectPosition: "within_corridor"
    },
    {
      id: "Q02",
      label: "Chengalpattu benchmarked below statutory floor (Section 47A check)",
      village: vChPass0,
      askSqft: Math.max(100, Math.round(vChPass0.med * 0.75)),
      expectStatus: "benchmarked",
      expectPosition: "below_floor"
    },
    {
      id: "Q03",
      label: "Chengalpattu benchmarked above empirical corridor",
      village: vChPass1,
      askSqft: Math.round(vChPass1.med * 10),
      expectStatus: "benchmarked",
      expectPosition: "above_corridor"
    },
    {
      id: "Q04",
      label: "Chengalpattu exact street-floor override (P90 arterial street)",
      village: vChPass0,
      streetRate: vChPass0.p90,
      streetName: "Sample P90 Arterial Street",
      askSqft: Math.round(vChPass0.p90 * 2.5),
      expectStatus: "benchmarked",
      expectPosition: "within_corridor"
    },
    {
      id: "Q05",
      label: "Chengalpattu sparse village must ABSTAIN",
      village: vChAbs,
      askSqft: Math.round(vChAbs.med * 2.5),
      expectStatus: "abstain"
    },
    {
      id: "Q06",
      label: "Kancheepuram benchmarked plot quoted per cent (converted to sq ft)",
      village: vKaPass,
      askSqft: PE.toSqftRate(Math.round(vKaPass.med * 3.8 * 435.6), "cent"),
      expectStatus: "benchmarked",
      expectPosition: "within_corridor"
    },
    {
      id: "Q07",
      label: "Kancheepuram sparse village must ABSTAIN",
      village: vKaAbs,
      askSqft: Math.round(vKaAbs.med * 3.0),
      expectStatus: "abstain"
    },
    {
      id: "Q08",
      label: "Tiruvallur benchmarked plot quoted per ground (2400 sq ft)",
      village: vTiPass0,
      askSqft: PE.toSqftRate(Math.round(vTiPass0.med * 3.2 * 2400), "ground"),
      expectStatus: "benchmarked",
      expectPosition: "within_corridor"
    },
    {
      id: "Q09",
      label: "Tiruvallur benchmarked plot quoted below floor",
      village: vTiPass1,
      askSqft: Math.max(50, Math.round(vTiPass1.med * 0.6)),
      expectStatus: "benchmarked",
      expectPosition: "below_floor"
    },
    {
      id: "Q10",
      label: "Tiruvallur sparse village must ABSTAIN",
      village: vTiAbs,
      askSqft: Math.round(vTiAbs.med * 2.6),
      expectStatus: "abstain"
    }
  ];

  const summaries = [];
  for (const tc of cases) {
    const v = tc.village;
    const near = verified
      .map((p) => ({ p, d: PE.hav(v.lat, v.lon, p.lat, p.lon) }))
      .filter((x) => Number.isFinite(x.d) && x.d <= pilot.gate.maxRadiusKm);

    const anchor = {
      median: v.med,
      p10: v.p10,
      p90: v.p90,
      streetCount: v.nSt,
      village: v.v,
      sro: v.sro,
      district: v.d,
      distanceKm: 0,
      streetRate: tc.streetRate || null,
      streetName: tc.streetName || null
    };

    const res = PE.evaluateQuote({
      askSqft: tc.askSqft,
      guidelineAnchor: anchor,
      nearbyEntries: near,
      cvBenchmark: pilot.cv,
      gate: pilot.gate
    });

    assert.equal(res.status, tc.expectStatus, `${tc.id} (${tc.label}): expected ${tc.expectStatus}, got ${res.status}`);
    if (tc.expectPosition) {
      assert.equal(res.position, tc.expectPosition, `${tc.id}: expected ${tc.expectPosition}, got ${res.position}`);
    }

    const catalysts = PE.nearbyCatalysts(v.lat, v.lon, projects, 15, 5);
    const checklist = PE.dueDiligenceChecklist(res);
    assert.ok(checklist.length >= 3, `${tc.id}: checklist must have >=3 items`);

    const memo = PE.formatUnderwritingMemoMarkdown(res, {
      village: v,
      street: tc.streetRate ? { street: tc.streetName, rateSqft: tc.streetRate } : null,
      catalysts,
      heuristicSqft: Math.round(v.med * 2.4)
    });

    assert.match(memo, /## Tier 1 · Observed Primary Evidence/);
    assert.match(memo, /## Tier 2 · Benchmarked Estimate/);
    assert.match(memo, /## Tier 3 · Heuristic Context/);
    assert.match(memo, /## Buyer Due-Diligence Checklist/);
    assert.match(memo, /TNREGINET/);
    if (tc.expectStatus === "abstain") {
      assert.match(memo, /ABSTAIN/);
    }
    if (tc.expectPosition === "below_floor") {
      assert.match(memo, /Section 47A/);
    }

    summaries.push({
      id: tc.id,
      label: tc.label,
      district: v.d,
      village: v.v,
      askSqft: res.askSqft,
      floorSqft: res.floorSqft,
      status: res.status,
      position: res.position || "abstain",
      independentObs: res.evidence.independentCount,
      distinctDomains: res.evidence.distinctDomainCount,
      nearbyCatalystsCount: catalysts.length,
      checklistItems: checklist.length,
      passed: true
    });
  }

  const outPath = path.join(ROOT, "data/tn_pilot_10quote_check.json");
  fs.writeFileSync(
    outPath,
    JSON.stringify(
      {
        version: "2026-11-pilot-10quote-v1",
        generatedUtc: new Date().toISOString(),
        totalQuotes: summaries.length,
        passedQuotes: summaries.filter((s) => s.passed).length,
        benchmarkedQuotes: summaries.filter((s) => s.status === "benchmarked").length,
        abstainedQuotes: summaries.filter((s) => s.status === "abstain").length,
        cases: summaries
      },
      null,
      2
    ) + "\n",
    "utf8"
  );
  console.log(`PASS 10/10 corridor quote underwriting brief contracts -> ${outPath}`);
}

run();
