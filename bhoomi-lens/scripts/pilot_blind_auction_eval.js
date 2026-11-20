#!/usr/bin/env node
/**
 * Tamil Nadu Residential Plot Pilot — Blind Public E-Auction & Allotment Clearing Evaluator
 *
 * Usage:
 *   node bhoomi-lens/scripts/pilot_blind_auction_eval.js --write-template
 *     -> Writes zero-fabricated-row CSV template at:
 *        bhoomi-lens/data/tn_pilot_blind_auctions_template.csv
 *
 *   node bhoomi-lens/scripts/pilot_blind_auction_eval.js <blind_auctions.csv>
 *     -> Validates every row (schema, TN bounding box, public URL hygiene, unit math,
 *        zero URL leakage into training pool) and evaluates blind empirical coverage,
 *        abstention rate, MdAPE, P90 APE, and beat vs naive district median.
 */
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");

const TEMPLATE_HEADERS = [
  "auction_id",
  "authority",
  "district",
  "village",
  "street_or_survey",
  "lat",
  "lon",
  "plot_area_sqft",
  "reserve_price_inr",
  "clearing_price_inr",
  "guideline_rate_sqft",
  "auction_date",
  "source_url",
  "land_class"
];

function loadRuntime() {
  globalThis.window = globalThis;
  require(path.join(ROOT, "js/data.js"));
  require(path.join(ROOT, "js/engine.js"));
  require(path.join(ROOT, "data/verified.js"));
  require(path.join(ROOT, "data/evidence.js"));
  require(path.join(ROOT, "js/pilot_engine.js"));
  require(path.join(ROOT, "data/tn_pilot.js"));
  const PE = globalThis.BL.PilotEngine;
  const E = globalThis.BL.Engine;
  return {
    PE,
    pilot: globalThis.BL_TN_PILOT,
    verified: PE.collectPilotEvidencePool(globalThis.BL_VERIFIED, globalThis.BL_EVIDENCE, E.expandEvidence)
  };
}

function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQ = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQ = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function writeTemplate() {
  const outPath = path.join(ROOT, "data/tn_pilot_blind_auctions_template.csv");
  const lines = [
    TEMPLATE_HEADERS.join(","),
    "# Populate >= 20 unseen public TNHB / CMDA / SIPCOT / TIDCO / IBAPI residential plot auction outcomes (lines starting with # are ignored).",
    "# Required: district in {Chengalpattu, Kancheepuram, Tiruvallur}, lat/lon in TN bounds, positive plot_area_sqft & clearing_price_inr (or reserve_price_inr), valid https source_url."
  ];
  fs.writeFileSync(outPath, lines.join("\n") + "\n", "utf8");
  console.log(`Wrote blind e-auction evaluation template: ${outPath}`);
}

function evaluateCsv(csvPath) {
  const { PE, pilot, verified } = loadRuntime();
  const raw = fs.readFileSync(path.resolve(csvPath), "utf8");
  const lines = raw.split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith("#"));
  if (lines.length < 2) {
    console.error("Error: blind auction CSV contains no data rows.");
    process.exit(2);
  }
  const headers = parseCsvLine(lines[0]).map((h) => h.trim());
  for (const req of ["auction_id", "district", "lat", "lon", "plot_area_sqft", "source_url"]) {
    if (!headers.includes(req)) {
      console.error(`Error: missing required column "${req}".`);
      process.exit(2);
    }
  }

  const parsed = [];
  const rejected = [];

  for (let idx = 1; idx < lines.length; idx++) {
    const vals = parseCsvLine(lines[idx]);
    const rec = {};
    headers.forEach((h, i) => (rec[h] = (vals[i] || "").trim()));

    const dist = PE.normalizeDistrict(rec.district);
    const lat = Number(rec.lat);
    const lon = Number(rec.lon);
    const area = Number(rec.plot_area_sqft);
    const clearing = Number(rec.clearing_price_inr);
    const reserve = Number(rec.reserve_price_inr);
    const totalPrice = Number.isFinite(clearing) && clearing > 0 ? clearing : reserve;
    const gvSqft = Number(rec.guideline_rate_sqft);

    let urlValid = false;
    try {
      const u = new URL(rec.source_url);
      urlValid = (u.protocol === "https:" || u.protocol === "http:") && Boolean(u.hostname);
    } catch (_) {}

    if (!PE.isPilotDistrict(dist)) {
      rejected.push({ line: idx + 1, auction_id: rec.auction_id, reason: `Out-of-pilot district: ${rec.district}` });
      continue;
    }
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < 8.0 || lat > 13.7 || lon < 76.0 || lon > 80.5) {
      rejected.push({ line: idx + 1, auction_id: rec.auction_id, reason: "Coordinates outside Tamil Nadu bounds" });
      continue;
    }
    if (!Number.isFinite(area) || area < 100 || !Number.isFinite(totalPrice) || totalPrice <= 0) {
      rejected.push({ line: idx + 1, auction_id: rec.auction_id, reason: "Invalid plot area or auction price" });
      continue;
    }
    if (!urlValid) {
      rejected.push({ line: idx + 1, auction_id: rec.auction_id, reason: "Invalid or missing public source URL" });
      continue;
    }
    if (rec.land_class && !/residential|plot|house/i.test(rec.land_class)) {
      rejected.push({ line: idx + 1, auction_id: rec.auction_id, reason: `Non-residential class: ${rec.land_class}` });
      continue;
    }

    parsed.push({
      auctionId: rec.auction_id || `ROW-${idx}`,
      district: dist,
      lat,
      lon,
      priceSqft: totalPrice / area,
      gvSqft: Number.isFinite(gvSqft) && gvSqft > 0 ? gvSqft : null,
      sourceUrl: rec.source_url,
      date: rec.auction_date || ""
    });
  }

  // Compute naive district medians from non-proxy verified pool for fair comparison
  const stratAll = PE.stratifyEvidence(verified.filter((p) => PE.isPilotDistrict(p.district)));
  const nonProxy = [...stratAll.strata.reported, ...stratAll.strata.auction, ...stratAll.strata.asking];
  const districtMedians = {};
  for (const d of PE.PILOT_DISTRICTS) {
    const vals = nonProxy.filter((r) => r.district === d).map((r) => r.value);
    if (vals.length) districtMedians[d] = PE.median(vals);
  }

  const report = PE.evaluateBlindAuctionRows(parsed, {
    villages: pilot.villages,
    nearbyPool: verified,
    cvBenchmark: pilot.cv,
    gate: pilot.gate,
    districtMedians
  });

  console.log(
    JSON.stringify(
      {
        inputFile: path.resolve(csvPath),
        inputRows: lines.length - 1,
        acceptedRows: parsed.length,
        schemaRejectedRows: rejected.length,
        rejectedSample: rejected.slice(0, 10),
        evaluation: report
      },
      null,
      2
    )
  );
}

if (process.argv[2] === "--write-template" || !process.argv[2]) {
  writeTemplate();
} else {
  evaluateCsv(process.argv[2]);
}
