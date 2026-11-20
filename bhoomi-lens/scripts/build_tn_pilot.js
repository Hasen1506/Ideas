#!/usr/bin/env node
/**
 * Build reproducible Tamil Nadu Residential Plot Pilot artifacts from raw
 * street-level official guideline registers (data/tn_gv/*.json) and existing
 * market/evidence snapshots.
 *
 * Outputs:
 *   - bhoomi-lens/data/tn_pilot.js        (compact browser bundle for pilot UI)
 *   - bhoomi-lens/data/tn_pilot_report.json (audit & spatial CV benchmark report)
 *
 * Zero external scraping, zero PII, zero unlicensed transaction feeds.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
globalThis.window = globalThis;
require(path.join(ROOT, "js/data.js"));
require(path.join(ROOT, "js/engine.js"));
require(path.join(ROOT, "js/pilot_engine.js"));
require(path.join(ROOT, "data/verified.js"));
require(path.join(ROOT, "data/evidence.js"));
require(path.join(ROOT, "data/tn_gv_history.js"));
require(path.join(ROOT, "data/tn_villages.js"));
require(path.join(ROOT, "data/projects.js"));

const E = globalThis.BL.Engine;
const PE = globalThis.BL.PilotEngine;
const PILOT_DISTRICTS = PE.PILOT_DISTRICTS;

function loadRawStreetStats(district) {
  const file2024 = path.join(ROOT, "data/tn_gv", `${district}.json`);
  const file2017 = path.join(ROOT, "data/tn_gv/2017", `${district}.json`);
  const j24 = JSON.parse(fs.readFileSync(file2024, "utf8"));
  const j17 = fs.existsSync(file2017) ? JSON.parse(fs.readFileSync(file2017, "utf8")) : null;

  const classes24 = j24.classes || [];
  const classes17 = (j17 && j17.classes) || [];

  // Build 2017 residential median lookup by (sroId, villageTamil)
  const med17 = new Map();
  if (j17) {
    for (const [sroId, sro] of Object.entries(j17.sros || {})) {
      const rev = (sro.revs || {})["2017"] || {};
      for (const vobj of Object.values(rev.d || {})) {
        if (!vobj || !Array.isArray(vobj.rows)) continue;
        const rates = [];
        for (const r of vobj.rows) {
          const cls = classes17[r[3]] || "";
          if ((r[2] === "ft2" || r[2] === "m2") && /குடியிருப்பு|Residential/i.test(cls)) {
            const sq = PE.toSqftRate(r[1], r[2]);
            if (sq && sq > 0) rates.push(sq);
          }
        }
        if (rates.length) {
          med17.set(`${sroId}|${String(vobj.n || "").trim()}`, PE.median(rates));
        }
      }
    }
  }

  let totalStreets = 0;
  let residentialStreets = 0;
  let updated2025 = 0;
  const villagesByKey = new Map();

  for (const [sroId, sro] of Object.entries(j24.sros || {})) {
    const rev = (sro.revs || {})["2024"] || {};
    for (const vobj of Object.values(rev.d || {})) {
      if (!vobj || !Array.isArray(vobj.rows)) continue;
      const vTamil = String(vobj.n || "").trim();
      const resRates = [];
      let v2025 = 0;
      for (const r of vobj.rows) {
        totalStreets++;
        const cls = classes24[r[3]] || "";
        if ((r[2] === "ft2" || r[2] === "m2") && /குடியிருப்பு|Residential/i.test(cls)) {
          const sq = PE.toSqftRate(r[1], r[2]);
          if (sq && sq > 0) {
            residentialStreets++;
            resRates.push(sq);
            if (r[4] && String(r[4]).startsWith("2025")) {
              updated2025++;
              v2025++;
            }
          }
        }
      }
      if (!resRates.length) continue;
      resRates.sort((a, b) => a - b);
      const m24 = PE.median(resRates);
      const m17 = med17.get(`${sroId}|${vTamil}`) || null;
      const key = `${String(sro.name || "").trim()}|${vTamil}`;
      villagesByKey.set(key, {
        sroId,
        sro: String(sro.name || "").trim(),
        tamil: vTamil,
        district,
        streetCount: resRates.length,
        p10: Math.round(PE.quantile(resRates, 0.1)),
        median: Math.round(m24),
        p90: Math.round(PE.quantile(resRates, 0.9)),
        updated2025: v2025,
        rev2017Median: m17 ? Math.round(m17) : null,
        growth17to24Pct: m17 && m17 > 0 ? Math.round((m24 / m17 - 1) * 1000) / 10 : null
      });
    }
  }

  return {
    district,
    sroCount: Object.keys(j24.sros || {}).length,
    totalStreets,
    residentialStreets,
    updated2025,
    villagesWithResidentialStreets: villagesByKey.size,
    villagesByKey
  };
}

function buildPilot() {
  const gvh = globalThis.BL_TN_GV || { rev: [], rows: [] };
  const rawStats = {};
  const pilotVillages = [];

  // Load street-level registers for the 3 pilot districts
  for (const d of PILOT_DISTRICTS) {
    rawStats[d] = loadRawStreetStats(d);
  }

  // Match geocoded Tamil Nadu guideline-history villages to raw 2024 street-level residential distributions
  for (const row of gvh.rows || []) {
    const dist = PE.normalizeDistrict(row[3]);
    if (!PE.isPilotDistrict(dist)) continue;
    const eng = String(row[0] || "").trim();
    const tamil = String(row[1] || "").trim();
    const sro = String(row[2] || "").trim();
    const lat = Number(row[4]);
    const lon = Number(row[5]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

    const rawMatch = rawStats[dist].villagesByKey.get(`${sro}|${tamil}`) || null;
    const gv2024 = Number.isFinite(row[6]) && row[6] > 0 ? row[6] : null;
    const gv2017 = Number.isFinite(row[8]) && row[8] > 0 ? row[8] : null;

    const medianSqft = rawMatch ? rawMatch.median : gv2024;
    if (!medianSqft || medianSqft <= 0) continue;

    const hist = {};
    (gvh.rev || []).forEach((rev, idx) => {
      const val = row[6 + idx];
      if (Number.isFinite(val) && val > 0) hist[rev] = Math.round(val);
    });

    pilotVillages.push({
      v: eng,
      ta: tamil,
      sro,
      d: dist,
      lat: Math.round(lat * 10000) / 10000,
      lon: Math.round(lon * 10000) / 10000,
      med: Math.round(medianSqft),
      p10: rawMatch ? rawMatch.p10 : null,
      p90: rawMatch ? rawMatch.p90 : null,
      nSt: rawMatch ? rawMatch.streetCount : 0,
      u25: rawMatch ? rawMatch.updated2025 : 0,
      g17: rawMatch && rawMatch.growth17to24Pct != null
        ? rawMatch.growth17to24Pct
        : gv2017 && medianSqft
          ? Math.round((medianSqft / gv2017 - 1) * 1000) / 10
          : null,
      hist
    });
  }

  // Collect all non-proxy observations inside the 3 pilot districts (normalizing district aliases)
  const rawV = (globalThis.BL_VERIFIED || []).filter((p) => !/SRO villages \(/.test(p.loc || ""));
  const evExp = E.expandEvidence(globalThis.BL_EVIDENCE);
  const allPoints = rawV.concat(evExp);

  // Set up existing heuristic engine calibration for honest comparison
  const catalysts = globalThis.BL_PROJECTS && globalThis.BL_PROJECTS.length ? globalThis.BL_PROJECTS : globalThis.BL.CATALYSTS;
  E.setCalibration(allPoints.filter((p) => p.price > 0), catalysts);

  const pilotRawEntries = [];
  for (const p of allPoints) {
    const dist = PE.normalizeDistrict(p.district);
    if (!PE.isPilotDistrict(dist)) continue;
    const kind = PE.canonicalEvidenceKind(p);
    if (!["asking", "auction", "reported"].includes(kind)) continue;
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lon)) continue;
    // Residential plot / plotted land focus: exclude explicit industrial-only rows from residential plot benchmark
    if (String(p.land || "").toLowerCase() === "industrial") continue;
    pilotRawEntries.push({ p: Object.assign({}, p, { district: dist }), d: 0 });
  }

  const strat = PE.stratifyEvidence(pilotRawEntries);
  const nonProxy = [...strat.strata.reported, ...strat.strata.auction, ...strat.strata.asking];

  // Pair each deduplicated non-proxy observation with its nearest official residential guideline anchor (inline or matched village within 5 km)
  const paired = [];
  for (const obs of nonProxy) {
    let gv = obs.govtSqft;
    let gvSource = gv ? "inline_record" : "";
    let nearestVil = null;
    let minD = Infinity;
    for (const v of pilotVillages) {
      const distKm = PE.hav(obs.lat, obs.lon, v.lat, v.lon);
      if (distKm < minD) {
        minD = distKm;
        nearestVil = v;
      }
    }
    if (!gv && nearestVil && minD <= 5) {
      gv = nearestVil.med;
      gvSource = "matched_village_2024";
    }
    if (!gv || gv <= 0) continue;

    // Spatial cluster key (~3 km grid cell + canonical locality) to prevent nearby leakage across folds
    const cluster = `${obs.district}|${Math.round(obs.lat / 0.03)}_${Math.round(obs.lon / 0.03)}`;
    const heuristic = E.buildModel("pilot", obs.loc, "Tamil Nadu", obs.lat, obs.lon, 0, catalysts, true).basePrice;

    paired.push({
      cluster,
      district: obs.district,
      loc: obs.loc,
      kind: obs.kind,
      price: obs.value,
      gv,
      gvSource,
      heuristicPrice: heuristic
    });
  }

  const cv = PE.evaluateAnchorRelativeCV(paired, 0.2);

  // Compute pilot village evidence coverage counts (how many villages pass the abstention gate today)
  let benchmarkableVillages = 0;
  for (const v of pilotVillages) {
    const near = nonProxy
      .map((obs) => ({
        p: {
          loc: obs.loc,
          district: obs.district,
          state: "Tamil Nadu",
          type: obs.type,
          price: obs.value,
          typ: obs.kind === "asking" ? obs.value : null,
          src: obs.source,
          lat: obs.lat,
          lon: obs.lon,
          date: obs.date
        },
        d: PE.hav(v.lat, v.lon, obs.lat, obs.lon)
      }))
      .filter((x) => x.d <= PE.DEFAULT_GATE.maxRadiusKm);
    const s = PE.stratifyEvidence(near);
    v.evN = s.independentCount;
    v.evDom = s.distinctDomainCount;
    v.gate = s.independentCount >= PE.DEFAULT_GATE.minIndependentObs && s.distinctDomainCount >= PE.DEFAULT_GATE.minDistinctDomains ? 1 : 0;
    if (v.gate) benchmarkableVillages++;
  }

  // Sort pilot villages: benchmarkable first, then highest residential street count
  pilotVillages.sort((a, b) => b.gate - a.gate || b.nSt - a.nSt || a.v.localeCompare(b.v));

  const districtSummary = PILOT_DISTRICTS.map((d) => ({
    district: d,
    sroCount: rawStats[d].sroCount,
    totalStreets2024: rawStats[d].totalStreets,
    residentialStreets2024: rawStats[d].residentialStreets,
    midCycle2025Updates: rawStats[d].updated2025,
    matchedGeocodedVillages: pilotVillages.filter((v) => v.d === d).length,
    benchmarkableVillages: pilotVillages.filter((v) => v.d === d && v.gate).length,
    deduplicatedNonProxyObs: nonProxy.filter((o) => o.district === d).length,
    pairedWithGuidelineAnchor: paired.filter((p) => p.district === d).length
  }));

  const payload = {
    version: "2026-11-pilot-v1",
    scope: "Residential plots in 3 Tamil Nadu Greater Chennai growth-corridor districts (Chengalpattu, Kancheepuram, Tiruvallur)",
    generatedUtc: new Date().toISOString(),
    gate: PE.DEFAULT_GATE,
    districts: districtSummary,
    totals: {
      residentialStreets2024: districtSummary.reduce((s, x) => s + x.residentialStreets2024, 0),
      midCycle2025Updates: districtSummary.reduce((s, x) => s + x.midCycle2025Updates, 0),
      matchedGeocodedVillages: pilotVillages.length,
      benchmarkableVillages,
      abstainedVillages: pilotVillages.length - benchmarkableVillages,
      deduplicatedNonProxyObs: nonProxy.length,
      droppedDuplicates: strat.droppedDuplicates,
      pairedObsForCV: paired.length
    },
    cv,
    villages: pilotVillages
  };

  const outJs = path.join(ROOT, "data/tn_pilot.js");
  const outJson = path.join(ROOT, "data/tn_pilot_report.json");

  fs.writeFileSync(
    outJs,
    `/* Generated by scripts/build_tn_pilot.js — do not edit by hand. */\nwindow.BL_TN_PILOT = ${JSON.stringify(payload)};\n`,
    "utf8"
  );
  const reportOnly = Object.assign({}, payload, { villages: undefined, sampleVillages: pilotVillages.slice(0, 12) });
  fs.writeFileSync(outJson, JSON.stringify(reportOnly, null, 2) + "\n", "utf8");

  console.log(JSON.stringify(reportOnly, null, 2));
}

buildPilot();
