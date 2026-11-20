#!/usr/bin/env node
/**
 * Build reproducible Statewide Tamil Nadu (All 38 Districts) Residential Plot
 * Underwriting & 14-Feature Spatial Residual ML artifacts from raw street-level
 * official guideline registers (data/tn_gv/*.json), 23-year revision history
 * (data/tn_gv_history.js), dated infrastructure projects (data/projects.js),
 * coastline geometry (data/coast.js), official TN District CPI (data/tn_district_cpi.js),
 * and separated market/public-auction evidence (data/verified.js + data/evidence.js).
 *
 * Outputs:
 *   - bhoomi-lens/data/tn_pilot.js        (compact statewide browser bundle)
 *   - bhoomi-lens/data/tn_pilot_report.json (statewide audit & 4-model Spatial CV report)
 *
 * Zero fabricated sales, zero PII, zero unlicensed scraping.
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
require(path.join(ROOT, "data/tn_district_cpi.js"));
require(path.join(ROOT, "data/projects.js"));
require(path.join(ROOT, "data/coast.js"));
require(path.join(ROOT, "data/private.js"));
require(path.join(ROOT, "data/districts.js"));
require(path.join(ROOT, "data/backtest.js"));

const E = globalThis.BL.Engine;
const PE = globalThis.BL.PilotEngine;
const TN_DISTRICTS = PE.TN_DISTRICTS;

// Major Tamil Nadu economic & metro urban hubs (official city centers)
const TN_METRO_HUBS = [
  { name: "Chennai", lat: 13.0827, lon: 80.2707 },
  { name: "Coimbatore", lat: 11.0168, lon: 76.9558 },
  { name: "Madurai", lat: 9.9252, lon: 78.1198 },
  { name: "Tiruchirappalli", lat: 10.7905, lon: 78.7047 },
  { name: "Salem", lat: 11.6643, lon: 78.146 },
  { name: "Hosur", lat: 12.7409, lon: 77.8253 },
  { name: "Tiruppur", lat: 11.1085, lon: 77.3411 },
  { name: "Vellore", lat: 12.9165, lon: 79.1325 }
];

// Official commercial airports serving Tamil Nadu
const TN_AIRPORTS = [
  { name: "Chennai (MAA)", lat: 12.9941, lon: 80.1709 },
  { name: "Coimbatore (CJB)", lat: 11.03, lon: 77.0434 },
  { name: "Madurai (IXM)", lat: 9.8345, lon: 78.0934 },
  { name: "Trichy (TRZ)", lat: 10.7654, lon: 78.7097 },
  { name: "Salem (SXV)", lat: 11.7833, lon: 78.0656 },
  { name: "Tuticorin (TCR)", lat: 8.7242, lon: 78.0258 },
  { name: "Parandur Proposed", lat: 12.916, lon: 79.718 }
];

function buildDistrictCpiMap() {
  const cpiObj = globalThis.BL_TN_DISTRICT_CPI || { series: [] };
  const map = new Map();
  let stateFallback = 134.0;
  for (const s of cpiObj.series || []) {
    if (!s || !Array.isArray(s.points) || !s.points.length) continue;
    const latest = Number(s.points[s.points.length - 1][1]);
    if (!Number.isFinite(latest)) continue;
    if (String(s.area || "").toLowerCase() === "tamil nadu") {
      stateFallback = latest;
    } else {
      map.set(PE.normalizeDistrict(s.area), latest);
    }
  }
  // Child districts split from parent districts inherit parent CPI if not separately published by DES
  const parentFallback = {
    Chengalpattu: "Kancheepuram",
    Ranipet: "Vellore",
    Tirupathur: "Vellore",
    Kallakurichi: "Viluppuram",
    Tenkasi: "Tirunelveli",
    Mayiladuthurai: "Nagapattinam"
  };
  for (const d of TN_DISTRICTS) {
    if (!map.has(d)) {
      const p = parentFallback[d];
      map.set(d, (p && map.get(p)) || stateFallback);
    }
  }
  return { map, stateFallback };
}

function minDistToCoastKm(lat, lon, coastPts) {
  let best = 400;
  for (let i = 0; i < coastPts.length; i++) {
    const c = coastPts[i];
    if (Math.abs(c[1] - lat) > 3.5 || Math.abs(c[0] - lon) > 3.5) continue;
    const d = PE.hav(lat, lon, c[1], c[0]);
    if (d < best) best = d;
  }
  return best;
}

function minDistToProjects(lat, lon, projects) {
  let best = 250;
  for (let i = 0; i < projects.length; i++) {
    const d = PE.projectDistanceKm(lat, lon, projects[i]);
    if (Number.isFinite(d) && d < best) best = d;
  }
  return best;
}

function loadRawStreetStats(district) {
  const file2024 = path.join(ROOT, "data/tn_gv", `${district}.json`);
  const file2017 = path.join(ROOT, "data/tn_gv/2017", `${district}.json`);
  if (!fs.existsSync(file2024)) {
    return {
      district,
      sroCount: 0,
      totalStreets: 0,
      residentialStreets: 0,
      updated2025: 0,
      villagesWithResidentialStreets: 0,
      villagesByKey: new Map()
    };
  }
  const j24 = JSON.parse(fs.readFileSync(file2024, "utf8"));
  const j17 = fs.existsSync(file2017) ? JSON.parse(fs.readFileSync(file2017, "utf8")) : null;

  const classes24 = j24.classes || [];
  const classes17 = (j17 && j17.classes) || [];

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

function buildStatewide() {
  const gvh = globalThis.BL_TN_GV || { rev: [], rows: [] };
  const rawStats = {};
  const allVillages = [];

  for (const d of TN_DISTRICTS) {
    rawStats[d] = loadRawStreetStats(d);
  }

  const { map: cpiMap, stateFallback: cpiFallback } = buildDistrictCpiMap();
  const catalysts = globalThis.BL_PROJECTS && globalThis.BL_PROJECTS.length ? globalThis.BL_PROJECTS : globalThis.BL.CATALYSTS;
  const tnProjects = catalysts.filter((p) => {
    const pts = p.pt
      ? [p.pt]
      : Array.isArray(p.path)
        ? p.path
        : Array.isArray(p.ring)
          ? p.ring
          : p.ring && Number.isFinite(p.ring.lat)
            ? [[p.ring.lon, p.ring.lat]]
            : [];
    return pts.some(([lon, lat]) => lat >= 7.5 && lat <= 14.0 && lon >= 75.8 && lon <= 80.8);
  });
  const activeTnProjects = tnProjects.filter((p) => !p.cancelled && !/scrapped|cancelled/i.test(String(p.st || p.n || "")));
  const metroProjs = tnProjects.filter((p) => p.t === "metro");
  const highwayProjs = tnProjects.filter((p) => p.t === "expressway" || p.t === "ring");
  const industrialProjs = tnProjects.filter((p) => p.t === "industrial" || p.t === "finance" || p.t === "city" || p.t === "port");

  // District area (km²) from BL_DISTRICTS for residential urban street density
  const distAreaMap = new Map();
  for (const feat of (globalThis.BL_DISTRICTS && globalThis.BL_DISTRICTS.features) || []) {
    const pr = feat && feat.properties;
    if (!pr || pr.s !== "Tamil Nadu") continue;
    const dn = PE.normalizeDistrict(pr.n);
    if (PE.isTNDistrict(dn) && Number(pr.a) > 0) distAreaMap.set(dn, Number(pr.a));
  }

  // Real TNRERA filings (2,127 geocoded TN filings) & Private Industrial Capex (23 mega TN plants/parks)
  const tnRera = ((globalThis.BL_PRIVATE && globalThis.BL_PRIVATE.rera) || [])
    .filter((r) => Array.isArray(r) && Number.isFinite(r[0]) && Number.isFinite(r[1]) && r[1] >= 7.5 && r[1] <= 14.0 && r[0] >= 75.8 && r[0] <= 80.8)
    .map((r) => {
      const m = String(r[8] || "").match(/(\d+)/);
      return { lon: Number(r[0]), lat: Number(r[1]), units: m ? Number(m[1]) : 12 };
    });

  const tnPrivateInv = ((globalThis.BL_PRIVATE && globalThis.BL_PRIVATE.inv) || [])
    .filter((x) => x && Array.isArray(x.ll) && x.ll.length >= 2 && (x.st === "TN" || (x.ll[1] >= 7.5 && x.ll[1] <= 14.0 && x.ll[0] >= 75.8 && x.ll[0] <= 80.8)))
    .map((x) => ({
      lon: Number(x.ll[0]),
      lat: Number(x.ll[1]),
      cr: Number(x.cr) || 0,
      jobs: Number(x.jobs) || 0,
      co: String(x.co || ""),
      loc: String(x.loc || ""),
      p: String(x.p || "")
    }));

  // Flatten coastline coordinate points for Tamil Nadu region
  const coastPts = [];
  for (const seg of globalThis.BL_COAST || []) {
    if (Array.isArray(seg) && typeof seg[0] === "number") {
      if (seg[1] >= 7.5 && seg[1] <= 14.2 && seg[0] >= 75.5 && seg[0] <= 81.5) coastPts.push(seg);
    } else if (Array.isArray(seg)) {
      for (const pt of seg) {
        if (Array.isArray(pt) && pt.length >= 2 && pt[1] >= 7.5 && pt[1] <= 14.2 && pt[0] >= 75.5 && pt[0] <= 81.5) {
          coastPts.push(pt);
        }
      }
    }
  }

  function computeFeatureVector(lat, lon, dist, med, p10, p90, nSt, u25, hist) {
    const safeMed = Math.max(10, Number(med) || 100);
    const safeP10 = Math.max(10, Number(p10) || safeMed * 0.7);
    const safeP90 = Math.max(safeP10, Number(p90) || safeMed * 1.4);
    const gv17 = hist && hist["2017"] > 0 ? hist["2017"] : safeMed;
    const gv12 = hist && hist["2012"] > 0 ? hist["2012"] : gv17;

    const distChennai = PE.hav(lat, lon, 13.0827, 80.2707);
    let distHub = Infinity;
    for (const h of TN_METRO_HUBS) {
      const dh = PE.hav(lat, lon, h.lat, h.lon);
      if (dh < distHub) distHub = dh;
    }
    let distAirport = Infinity;
    for (const a of TN_AIRPORTS) {
      const da = PE.hav(lat, lon, a.lat, a.lon);
      if (da < distAirport) distAirport = da;
    }
    const distMetro = metroProjs.length ? minDistToProjects(lat, lon, metroProjs) : distChennai;
    const distHighway = highwayProjs.length ? minDistToProjects(lat, lon, highwayProjs) : distHub;
    const distIndustrial = industrialProjs.length ? minDistToProjects(lat, lon, industrialProjs) : distHub;
    const distCoast = coastPts.length ? minDistToCoastKm(lat, lon, coastPts) : 60;
    const cpi = cpiMap.get(dist) || cpiFallback;

    return [
      Math.round(Math.log(safeMed) * 1000) / 1000,
      Math.round(Math.log(safeP90 / safeP10) * 1000) / 1000,
      Math.round(Math.log1p(Math.max(0, nSt || 0)) * 1000) / 1000,
      Math.round(Math.log(safeMed / gv17) * 1000) / 1000,
      Math.round(Math.log(safeMed / gv12) * 1000) / 1000,
      Math.round(((u25 || 0) / Math.max(1, nSt || 1)) * 1000) / 1000,
      Math.round(Math.log1p(distChennai) * 1000) / 1000,
      Math.round(Math.log1p(distHub) * 1000) / 1000,
      Math.round(Math.log1p(distMetro) * 1000) / 1000,
      Math.round(Math.log1p(distAirport) * 1000) / 1000,
      Math.round(Math.log1p(distHighway) * 1000) / 1000,
      Math.round(Math.log1p(distIndustrial) * 1000) / 1000,
      Math.round(Math.log1p(distCoast) * 1000) / 1000,
      Math.round(cpi * 10) / 10
    ];
  }

  // Match all 5,428 geocoded Tamil Nadu villages across all 38 districts
  for (const row of gvh.rows || []) {
    const dist = PE.normalizeDistrict(row[3]);
    if (!PE.isTNDistrict(dist)) continue;
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

    const p10 = rawMatch ? rawMatch.p10 : null;
    const p90 = rawMatch ? rawMatch.p90 : null;
    const nSt = rawMatch ? rawMatch.streetCount : 0;
    const u25 = rawMatch ? rawMatch.updated2025 : 0;
    const g17 = rawMatch && rawMatch.growth17to24Pct != null
      ? rawMatch.growth17to24Pct
      : gv2017 && medianSqft
        ? Math.round((medianSqft / gv2017 - 1) * 1000) / 10
        : null;

    allVillages.push({
      v: eng,
      ta: tamil,
      sro,
      d: dist,
      lat: Math.round(lat * 10000) / 10000,
      lon: Math.round(lon * 10000) / 10000,
      med: Math.round(medianSqft),
      p10,
      p90,
      nSt,
      u25,
      g17,
      hist,
      f: computeFeatureVector(lat, lon, dist, medianSqft, p10, p90, nSt, u25, hist)
    });
  }

  // Canonical evidence pool across all of Tamil Nadu
  const allPoints = PE.collectPilotEvidencePool(globalThis.BL_VERIFIED, globalThis.BL_EVIDENCE, E.expandEvidence);
  E.setCalibration(allPoints.filter((p) => p.price > 0), catalysts);

  // Build fast nearest-village helper for resolving missing district names on TN rows
  function nearestVillage(lat, lon, maxKm = 15) {
    let best = null;
    let minD = Infinity;
    for (let i = 0; i < allVillages.length; i++) {
      const v = allVillages[i];
      if (Math.abs(v.lat - lat) > 0.25 || Math.abs(v.lon - lon) > 0.25) continue;
      const d = PE.hav(lat, lon, v.lat, v.lon);
      if (d < minD) {
        minD = d;
        best = v;
      }
    }
    return best && minD <= maxKm ? { village: best, distKm: minD } : null;
  }

  const tnAllRaw = [];
  const tnCoreRaw = []; // verified listings, multi-site consensus, govt auctions, reported deals (excludes single-source unverified for strict CV)
  for (const p of allPoints) {
    const isTN = p.state === "Tamil Nadu" || p.st === "TN" || PE.isTNDistrict(p.district);
    if (!isTN) continue;
    const kind = PE.canonicalEvidenceKind(p);
    if (!["asking", "auction", "reported"].includes(kind)) continue;
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lon)) continue;
    let dist = PE.normalizeDistrict(p.district);
    if (!PE.isTNDistrict(dist)) {
      const nv = nearestVillage(p.lat, p.lon, 20);
      if (nv) dist = nv.village.d;
    }
    if (!PE.isTNDistrict(dist)) continue;
    const cloned = Object.assign({}, p, { district: dist });
    tnAllRaw.push({ p: cloned, d: 0 });
    if (p.type !== "unverified") {
      tnCoreRaw.push({ p: cloned, d: 0 });
    }
  }

  const stratAll = PE.stratifyEvidence(tnAllRaw);
  const stratCore = PE.stratifyEvidence(tnCoreRaw);
  const nonProxyAll = [...stratAll.strata.reported, ...stratAll.strata.auction, ...stratAll.strata.asking];
  const nonProxyCore = [...stratCore.strata.reported, ...stratCore.strata.auction, ...stratCore.strata.asking];

  function buildPairedRows(obsList) {
    const paired = [];
    for (const obs of obsList) {
      const nv = nearestVillage(obs.lat, obs.lon, 8);
      const nearestVil = nv ? nv.village : null;
      let gv = obs.govtSqft;
      let gvSource = gv ? "inline_record" : "";
      if (!gv && nearestVil && nv.distKm <= 5) {
        gv = nearestVil.med;
        gvSource = "matched_village_2024";
      }
      if (!gv || gv <= 0) continue;

      const cluster = `${obs.district}|${Math.round(obs.lat / 0.03)}_${Math.round(obs.lon / 0.03)}`;
      const heuristic = E.buildModel("tn", obs.loc, "Tamil Nadu", obs.lat, obs.lon, 0, catalysts, true).basePrice;
      const features = nearestVil
        ? nearestVil.f.slice()
        : computeFeatureVector(obs.lat, obs.lon, obs.district, gv, null, null, 0, 0, null);
      // Sync log_gv_2024 feature to the actual paired gv anchor
      features[0] = Math.round(Math.log(Math.max(10, gv)) * 1000) / 1000;

      paired.push({
        cluster,
        district: obs.district,
        loc: obs.loc,
        kind: obs.kind,
        type: obs.type,
        price: obs.value,
        gv,
        gvSource,
        heuristicPrice: heuristic,
        features
      });
    }
    return paired;
  }

  const pairedCore = buildPairedRows(nonProxyCore);
  const pairedAll = buildPairedRows(nonProxyAll);

  // Primary statewide CV on verified + multi-site consensus + auction + reported pool
  const cv = PE.evaluateAnchorRelativeCV(pairedCore, 0.2);
  // Secondary ablation including single-source unverified rows (reported transparently in ML Lab)
  const cvWithSingleSource = PE.evaluateAnchorRelativeCV(pairedAll, 0.2);
  // Original 3-district pilot slice for exact continuity tracking
  const pairedPilot3 = pairedCore.filter((r) => PE.isPilotDistrict(r.district));
  const cvPilot3 = PE.evaluateAnchorRelativeCV(pairedPilot3, 0.2);

  // Compute abstention gate flags for all 5,428 geocoded villages (using full non-proxy pool with URL dedup)
  // Build spatial bucket index for fast 8 km lookup across 5,428 villages
  const evBuckets = new Map();
  for (const obs of nonProxyAll) {
    const bx = Math.floor(obs.lat / 0.1);
    const by = Math.floor(obs.lon / 0.1);
    const key = `${bx},${by}`;
    if (!evBuckets.has(key)) evBuckets.set(key, []);
    evBuckets.get(key).push(obs);
  }

  let benchmarkableVillages = 0;
  for (const v of allVillages) {
    const bx = Math.floor(v.lat / 0.1);
    const by = Math.floor(v.lon / 0.1);
    const near = [];
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const list = evBuckets.get(`${bx + dx},${by + dy}`);
        if (!list) continue;
        for (const obs of list) {
          const d = PE.hav(v.lat, v.lon, obs.lat, obs.lon);
          if (d <= PE.DEFAULT_GATE.maxRadiusKm) {
            near.push({
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
              d
            });
          }
        }
      }
    }
    const s = PE.stratifyEvidence(near);
    v.evN = s.independentCount;
    v.evDom = s.distinctDomainCount;
    v.gate = s.independentCount >= PE.DEFAULT_GATE.minIndependentObs && s.distinctDomainCount >= PE.DEFAULT_GATE.minDistinctDomains ? 1 : 0;
    if (v.gate) benchmarkableVillages++;
  }

  // Enrich all 5,143 geocoded TN villages with real Chain-Investment & Urban Density signals
  // and run strictly zero-leakage Leave-One-District-Out CV Repricing Momentum ML (19 features)
  const momentumRows = [];
  for (const v of allVillages) {
    let rc = 0;
    let ru = 0;
    for (let i = 0; i < tnRera.length; i++) {
      const r = tnRera[i];
      if (Math.abs(v.lat - r.lat) > 0.11 || Math.abs(v.lon - r.lon) > 0.11) continue;
      if (PE.hav(v.lat, v.lon, r.lat, r.lon) <= 10) {
        rc++;
        ru += r.units;
      }
    }
    let ic = 0;
    let ij = 0;
    for (let i = 0; i < tnPrivateInv.length; i++) {
      const inv = tnPrivateInv[i];
      if (Math.abs(v.lat - inv.lat) > 0.16 || Math.abs(v.lon - inv.lon) > 0.16) continue;
      if (PE.hav(v.lat, v.lon, inv.lat, inv.lon) <= 15) {
        ic += inv.cr;
        ij += inv.jobs;
      }
    }
    let isCnt = 0;
    for (let i = 0; i < activeTnProjects.length; i++) {
      if (PE.projectDistanceKm(v.lat, v.lon, activeTnProjects[i]) <= 15) isCnt++;
    }
    const areaKm2 = distAreaMap.get(v.d) || 3200;
    const dd = Math.round(((rawStats[v.d] ? rawStats[v.d].residentialStreets : 1000) / Math.max(100, areaKm2)) * 100) / 100;

    v.rc = rc;
    v.ru = Math.round(ru);
    v.ic = Math.round(ic);
    v.ij = Math.round(ij);
    v.is = isCnt;
    v.dd = dd;

    // Zero-leakage 19-feature vector: exclude index 5 (pct_updated_2025) from v.f
    const base13 = v.f.filter((_, idx) => idx !== 5);
    const feat19 = [
      ...base13,
      Math.round(Math.log1p(dd) * 1000) / 1000,
      Math.round(Math.log1p(isCnt) * 1000) / 1000,
      Math.round(Math.log1p(rc) * 1000) / 1000,
      Math.round(Math.log1p(ru) * 1000) / 1000,
      Math.round(Math.log1p(ic) * 1000) / 1000,
      Math.round(Math.log1p(ij) * 1000) / 1000
    ];
    momentumRows.push({
      district: v.d,
      y: v.u25 > 0 ? 1 : 0,
      features: feat19
    });
  }

  const momentumCV = PE.evaluateRepricingMomentumCV(momentumRows, 60);
  if (momentumCV.ok && Array.isArray(momentumCV.percentileByIdx)) {
    for (let i = 0; i < allVillages.length; i++) {
      allVillages[i].ms = momentumCV.percentileByIdx[i];
    }
  }

  // Empirical 4-Regime Chain-Investment Proof across all 5,143 TN villages
  const regimeBuckets = { none: [], infraOnly: [], chainOnly: [], infraPlusChain: [] };
  for (const v of allVillages) {
    const hasInfra = v.is > 0;
    const hasChain = v.rc >= 3 || v.ic >= 500;
    if (!hasInfra && !hasChain) regimeBuckets.none.push(v);
    else if (hasInfra && !hasChain) regimeBuckets.infraOnly.push(v);
    else if (!hasInfra && hasChain) regimeBuckets.chainOnly.push(v);
    else regimeBuckets.infraPlusChain.push(v);
  }
  const summarizeRegime = (list, label) => {
    const rep = list.filter((x) => x.u25 > 0).length;
    const gVals = list.map((x) => x.g17).filter((g) => Number.isFinite(g)).sort((a, b) => a - b);
    return {
      label,
      villages: list.length,
      repriced2025: rep,
      repriced2025Pct: list.length ? Math.round((rep / list.length) * 1000) / 10 : 0,
      medianGrowth17to24Pct: gVals.length ? Math.round(PE.median(gVals) * 10) / 10 : null,
      avgRera10km: list.length ? Math.round((list.reduce((s, x) => s + x.rc, 0) / list.length) * 10) / 10 : 0,
      avgCapexCr15km: list.length ? Math.round(list.reduce((s, x) => s + x.ic, 0) / list.length) : 0
    };
  };
  const regimeProof = {
    totalVillages: allVillages.length,
    tnReraFilingsIndexed: tnRera.length,
    tnPrivateCapexDealsIndexed: tnPrivateInv.length,
    tnPrivateCapexTotalCr: Math.round(tnPrivateInv.reduce((s, x) => s + x.cr, 0)),
    tnActiveInfraProjectsIndexed: activeTnProjects.length,
    none: summarizeRegime(regimeBuckets.none, "No Infra / No Chain"),
    infraOnly: summarizeRegime(regimeBuckets.infraOnly, "Infra Project Only"),
    chainOnly: summarizeRegime(regimeBuckets.chainOnly, "Private Chain Only"),
    infraPlusChain: summarizeRegime(regimeBuckets.infraPlusChain, "Infra + Private Chain")
  };
  regimeProof.liftOverInfraOnly =
    regimeProof.infraOnly.repriced2025Pct > 0
      ? Math.round((regimeProof.infraPlusChain.repriced2025Pct / regimeProof.infraOnly.repriced2025Pct) * 100) / 100
      : null;

  // 71-Case Indian Mega-Project Historical Analogue Engine (Leave-One-Project-Out CV across 34 projects)
  const backtestCases = PE.normalizeBacktestCases((globalThis.BL_BACKTEST && globalThis.BL_BACKTEST.rows) || []);
  const analogueCV = PE.evaluateAnalogueUpliftCV(backtestCases, 7);

  // Curate real Tamil Nadu Catalyst Presets mapped to real TN villages + live chain investment
  const presetDefs = [
    { id: "hosur_airport", name: "Hosur Greenfield Airport + EV Industrial Belt", type: "airport", stage: 1, distKm: 4, cancelled: false, lat: 12.7409, lon: 77.8253, district: "Krishnagiri", note: "2,000-acre proposed airport near Hosur + Tata Electronics / Ola / Ather EV chain wave." },
    { id: "cmrl_c3_omr", name: "Chennai Metro Ph2 Corridor 3 (OMR–Siruseri)", type: "metro", stage: 3, distKm: 2, cancelled: false, lat: 12.825, lon: 80.223, district: "Chengalpattu", note: "Active elevated construction along OMR IT corridor to SIPCOT Siruseri." },
    { id: "cmrl_c4_porur", name: "Chennai Metro Ph2 Corridor 4 (Porur–Poonamallee)", type: "metro", stage: 3, distKm: 1.5, cancelled: false, lat: 13.047, lon: 80.105, district: "Tiruvallur", note: "Near-operational western corridor linking Poonamallee Bypass & Porur." },
    { id: "cbe_metro", name: "Coimbatore Metro Rail (Avinashi & Sathy Rd)", type: "metro", stage: 1, distKm: 2.5, cancelled: false, lat: 11.062, lon: 77.015, district: "Coimbatore", note: "Approved DPR metro corridors along Coimbatore IT & manufacturing spine." },
    { id: "chennai_prr", name: "Chennai Peripheral Ring Road (Ennore–Mahabalipuram)", type: "ring", stage: 3, distKm: 3, cancelled: false, lat: 12.965, lon: 79.96, district: "Kancheepuram", note: "133 km 6-lane ring road connecting Sriperumbudur, Oragadam & Singaperumal Koil." },
    { id: "bce_sriperumbudur", name: "Bengaluru–Chennai Expressway (Sriperumbudur End)", type: "expressway", stage: 3, distKm: 3, cancelled: false, lat: 12.967, lon: 79.948, district: "Kancheepuram", note: "Access-controlled expressway linking Bengaluru manufacturing belt to Sriperumbudur." },
    { id: "madurai_metro", name: "Madurai Metro Rail (Thirumangalam–Othakadai)", type: "metro", stage: 1, distKm: 2.5, cancelled: false, lat: 9.935, lon: 78.14, district: "Madurai", note: "32 km proposed rapid transit spine through Madurai urban core & IT park." },
    { id: "voc_port", name: "Thoothukkudi VOC Port Outer Harbour + Green H2 Hub", type: "port", stage: 2, distKm: 5, cancelled: false, lat: 8.764, lon: 78.15, district: "Thoothukkudi", note: "Deep-draft container transshipment + VinFast EV & green hydrogen industrial cluster." },
    { id: "parandur_cancelled", name: "Parandur 2nd Airport (Scrapped Case Study)", type: "airport", stage: -1, distKm: 3, cancelled: true, lat: 12.916, lon: 79.718, district: "Kancheepuram", note: "Empirical stress test: 4.17× speculation spike followed by 0.25× crash upon cancellation." }
  ];

  const tnCatalystPresets = presetDefs.map((pr) => {
    const distVils = allVillages.filter((x) => x.d === pr.district);
    let best = distVils[0] || allVillages[0];
    let bestD = Infinity;
    for (const v of distVils) {
      const d = PE.hav(pr.lat, pr.lon, v.lat, v.lon);
      if (d < bestD) {
        bestD = d;
        best = v;
      }
    }
    return {
      id: pr.id,
      name: pr.name,
      type: pr.type,
      stage: pr.stage,
      distKm: pr.distKm,
      cancelled: pr.cancelled,
      district: best ? best.d : pr.district,
      vkey: best ? `${best.d}|${best.sro}|${best.v}` : "",
      villageName: best ? best.v : "",
      liveRera: best ? best.rc : 0,
      liveCapexCr: best ? best.ic : 0,
      liveInfraStack: best ? Math.max(1, best.is) : 1,
      note: pr.note
    };
  });

  // Sort villages: benchmarkable first, then 2025 mid-cycle updates, then residential street count
  allVillages.sort((a, b) => b.gate - a.gate || b.u25 - a.u25 || b.nSt - a.nSt || a.v.localeCompare(b.v));

  // Mid-cycle 2025 Official Guideline Surge Hotspots (villages where govt actively revised streets in 2025)
  const hotspots2025 = allVillages
    .filter((v) => v.u25 > 0)
    .sort((a, b) => b.u25 - a.u25 || b.med - a.med)
    .slice(0, 200)
    .map((v) => ({
      v: v.v,
      ta: v.ta,
      sro: v.sro,
      d: v.d,
      lat: v.lat,
      lon: v.lon,
      med: v.med,
      p10: v.p10,
      p90: v.p90,
      nSt: v.nSt,
      u25: v.u25,
      pct25: Math.round((v.u25 / Math.max(1, v.nSt)) * 1000) / 10,
      g17: v.g17,
      gate: v.gate
    }));

  // Public Tamil Nadu Auctions, Govt Allotments & Reported Land Deals (100% real primary records with source URLs)
  const rawTNVerified = (globalThis.BL_VERIFIED || []).filter((r) => r && r.state === "Tamil Nadu");
  const publicFeed = rawTNVerified
    .filter((r) => ["govt_auction", "govt_allotment", "reported_deal", "compensation"].includes(r.type))
    .map((r) => {
      // Extract lakh/acre from SIPCOT notes when price/sqft isn't populated directly
      let rateSqft = Number.isFinite(r.price) && r.price > 0 ? Math.round(r.price) : null;
      if (!rateSqft && typeof r.note === "string") {
        const mLakh = r.note.match(/Rs\s*(\d+(?:\.\d+)?)\s*lakh\/acre/i);
        if (mLakh) rateSqft = Math.round((Number(mLakh[1]) * 100000) / 43560);
      }
      return {
        loc: String(r.loc || ""),
        d: PE.normalizeDistrict(r.district || ""),
        type: String(r.type || ""),
        land: String(r.land || "plot"),
        rateSqft,
        date: String(r.date || ""),
        lat: Number(r.lat),
        lon: Number(r.lon),
        src: String(r.src || ""),
        note: String(r.note || "")
      };
    })
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));

  const districtSummary = TN_DISTRICTS.map((d) => {
    const vList = allVillages.filter((v) => v.d === d);
    const cvD = cv.byDistrict && cv.byDistrict[d] ? cv.byDistrict[d] : null;
    return {
      district: d,
      sroCount: rawStats[d].sroCount,
      totalStreets2024: rawStats[d].totalStreets,
      residentialStreets2024: rawStats[d].residentialStreets,
      midCycle2025Updates: rawStats[d].updated2025,
      matchedGeocodedVillages: vList.length,
      benchmarkableVillages: vList.filter((v) => v.gate).length,
      deduplicatedNonProxyObs: nonProxyCore.filter((o) => o.district === d).length,
      allNonProxyInclSingleSource: nonProxyAll.filter((o) => o.district === d).length,
      pairedWithGuidelineAnchor: pairedCore.filter((p) => p.district === d).length,
      medianRatio: cvD ? cvD.medianRatio : null,
      cpiLatest: Math.round((cpiMap.get(d) || cpiFallback) * 10) / 10
    };
  });

  const payload = {
    version: "2026-11-statewide-v2",
    scope: "All 38 Tamil Nadu districts — Official TNREGINET street registers (233,898 residential streets), 23-year revision history, 14-Feature Spatial Residual ML benchmark & statutory Deal Desk",
    generatedUtc: new Date().toISOString(),
    gate: PE.DEFAULT_GATE,
    districts: districtSummary,
    totals: {
      districtCount: TN_DISTRICTS.length,
      sroCount: districtSummary.reduce((s, x) => s + x.sroCount, 0),
      totalStreets2024: districtSummary.reduce((s, x) => s + x.totalStreets2024, 0),
      residentialStreets2024: districtSummary.reduce((s, x) => s + x.residentialStreets2024, 0),
      midCycle2025Updates: districtSummary.reduce((s, x) => s + x.midCycle2025Updates, 0),
      matchedGeocodedVillages: allVillages.length,
      benchmarkableVillages,
      abstainedVillages: allVillages.length - benchmarkableVillages,
      deduplicatedCoreObs: nonProxyCore.length,
      deduplicatedNonProxyObs: nonProxyAll.length,
      droppedDuplicates: stratAll.droppedDuplicates,
      pairedObsForCV: pairedCore.length,
      pairedObsInclSingleSource: pairedAll.length,
      publicAuctionFeedCount: publicFeed.length,
      hotspots2025Count: hotspots2025.length
    },
    cv,
    cvWithSingleSource: cvWithSingleSource.ok
      ? {
          observations: cvWithSingleSource.observations,
          clusters: cvWithSingleSource.clusters,
          naiveDistrictMedian: cvWithSingleSource.naiveDistrictMedian,
          anchorRelativeBaseline: cvWithSingleSource.anchorRelativeBaseline,
          spatialResidualRidge: cvWithSingleSource.spatialResidualRidge
            ? {
                metrics: cvWithSingleSource.spatialResidualRidge.metrics,
                lambda: cvWithSingleSource.spatialResidualRidge.lambda,
                conformalEmpiricalCoveragePct: cvWithSingleSource.spatialResidualRidge.conformalEmpiricalCoveragePct,
                conformalMedianWidthPct: cvWithSingleSource.spatialResidualRidge.conformalMedianWidthPct
              }
            : null,
          ridgePromoted: cvWithSingleSource.ridgePromoted
        }
      : null,
    cvPilot3: cvPilot3.ok
      ? {
          observations: cvPilot3.observations,
          clusters: cvPilot3.clusters,
          anchorRelativeBaseline: cvPilot3.anchorRelativeBaseline,
          spatialResidualRidge: cvPilot3.spatialResidualRidge ? cvPilot3.spatialResidualRidge.metrics : null
        }
      : null,
    hotspots2025,
    publicFeed,
    catalystEngine: {
      regimeProof,
      momentumCV: momentumCV.ok
        ? {
            villages: momentumCV.villages,
            districts: momentumCV.districts,
            lambda: momentumCV.lambda,
            oofRocAuc: momentumCV.oofRocAuc,
            baseRatePct: momentumCV.baseRatePct,
            top10RatePct: momentumCV.top10RatePct,
            top10Lift: momentumCV.top10Lift,
            bot50RatePct: momentumCV.bot50RatePct,
            separationRatio: momentumCV.separationRatio,
            featureWeights: momentumCV.featureWeights
          }
        : null,
      analogueCV,
      tnCatalystPresets,
      backtestCases
    },
    villages: allVillages
  };

  const outJs = path.join(ROOT, "data/tn_pilot.js");
  const outJson = path.join(ROOT, "data/tn_pilot_report.json");

  fs.writeFileSync(
    outJs,
    `/* Generated by scripts/build_tn_pilot.js — do not edit by hand. */\nwindow.BL_TN_PILOT = ${JSON.stringify(payload)};\n`,
    "utf8"
  );
  const reportOnly = Object.assign({}, payload, { villages: undefined, sampleVillages: allVillages.slice(0, 12) });
  fs.writeFileSync(outJson, JSON.stringify(reportOnly, null, 2) + "\n", "utf8");

  console.log(JSON.stringify({
    version: payload.version,
    totals: payload.totals,
    cvSummary: {
      activeTier2Model: cv.activeTier2Model,
      ridgePromoted: cv.ridgePromoted,
      observations: cv.observations,
      clusters: cv.clusters,
      naive: cv.naiveDistrictMedian,
      heuristic: cv.existingHeuristic,
      anchorRelative: cv.anchorRelativeBaseline,
      ridge14: cv.spatialResidualRidge ? cv.spatialResidualRidge.metrics : null,
      ridgeTop5Weights: cv.spatialResidualRidge ? cv.spatialResidualRidge.featureWeights.slice(0, 5) : []
    },
    catalystSummary: {
      regimeProof,
      momentumOofAuc: payload.catalystEngine.momentumCV ? payload.catalystEngine.momentumCV.oofRocAuc : null,
      momentumTop10Lift: payload.catalystEngine.momentumCV ? payload.catalystEngine.momentumCV.top10Lift : null,
      analogueCV
    }
  }, null, 2));
}

buildStatewide();
