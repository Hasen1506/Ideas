#!/usr/bin/env node
/**
 * Tamil Nadu Residential Plot Pilot — 50-Record Manual Portal Provenance Audit Harness
 *
 * Usage:
 *   node bhoomi-lens/scripts/pilot_audit_sample.js
 *     -> Generates deterministic stratified 50-record audit sheet:
 *        - bhoomi-lens/data/tn_pilot_audit_50.csv
 *        - bhoomi-lens/data/tn_pilot_audit_50.json
 *
 *   node bhoomi-lens/scripts/pilot_audit_sample.js --score <completed_audit.csv>
 *     -> Computes exact provenance match, unit-error, class-error, coord-error,
 *        and rejection rates from a completed manual TNREGINET / Tamil Nilam audit.
 */
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");
const RESIDENTIAL_RE = /குடியிருப்பு|Residential/i;

function loadPilotEngine() {
  const ctx = { console };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/pilot_engine.js"), "utf8"), ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "data/tn_pilot.js"), "utf8"), ctx);
  return { PE: ctx.BL.PilotEngine, pilot: ctx.BL_TN_PILOT };
}

function deterministicHash(str) {
  return crypto.createHash("sha256").update(str).digest("hex");
}

function csvCell(v) {
  const s = String(v == null ? "" : v);
  const safe = /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
  return /[",\r\n]/.test(safe) ? '"' + safe.replace(/"/g, '""') + '"' : safe;
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

function generateSample() {
  const { PE, pilot } = loadPilotEngine();
  const villageByKey = new Map();
  for (const v of pilot.villages || []) {
    villageByKey.set(`${v.d}|${v.sro}|${v.ta}`, v);
  }

  const pools = {};
  for (const dist of PE.PILOT_DISTRICTS) {
    const raw = JSON.parse(fs.readFileSync(path.join(ROOT, "data/tn_gv", `${dist}.json`), "utf8"));
    const classes = raw.classes || [];
    const candidates = [];
    for (const sro of Object.values(raw.sros || {})) {
      const sroName = String(sro.name || "").trim();
      const rev = (sro.revs || {})["2024"];
      if (!rev || !rev.d) continue;
      for (const vobj of Object.values(rev.d || {})) {
        if (!vobj || !Array.isArray(vobj.rows)) continue;
        const villageTa = String(vobj.n || "").trim();
        const matched = villageByKey.get(`${dist}|${sroName}|${villageTa}`);
        if (!matched) continue;
        for (const r of vobj.rows) {
          const [street, rate, unit, cIdx, eff] = r;
          if (unit !== "ft2" && unit !== "m2") continue;
          const cls = classes[cIdx] || "";
          if (!RESIDENTIAL_RE.test(cls)) continue;
          const sqft = PE.toSqftRate(rate, unit);
          if (!sqft) continue;
          candidates.push({
            district: dist,
            sro: sroName,
            villageEn: matched.v,
            villageTa,
            lat: matched.lat,
            lon: matched.lon,
            gateStatus: matched.gate ? "benchmarked" : "abstain",
            street: String(street || "").trim(),
            rawRate: Number(rate),
            unit,
            rateSqft: Math.round(sqft * 100) / 100,
            className: cls,
            effectiveFrom: eff || "2024-07-01",
            is2025Update: Boolean(eff && String(eff).startsWith("2025")),
            sortKey: deterministicHash(`tn-pilot-audit-v1|${dist}|${sroName}|${villageTa}|${street}|${rate}|${unit}`)
          });
        }
      }
    }
    candidates.sort((a, b) => (a.sortKey < b.sortKey ? -1 : 1));
    pools[dist] = candidates;
  }

  // Stratified 50-record allocation: 20 Chengalpattu, 15 Tiruvallur, 15 Kancheepuram
  // Each district ensures coverage of mid-cycle 2025 updates, m2/ft2 units, and both gate states.
  const quotas = { Chengalpattu: 20, Tiruvallur: 15, Kancheepuram: 15 };
  const sample = [];
  const usedKeys = new Set();

  const pickFrom = (list, pred, maxN) => {
    let added = 0;
    const seenVillage = new Set();
    for (const row of list) {
      if (added >= maxN) break;
      const k = `${row.district}|${row.sro}|${row.villageTa}|${row.street}`;
      if (usedKeys.has(k) || !pred(row)) continue;
      if (seenVillage.has(row.villageEn) && added < maxN - 2) continue;
      usedKeys.add(k);
      seenVillage.add(row.villageEn);
      sample.push(row);
      added++;
    }
    return added;
  };

  for (const [dist, target] of Object.entries(quotas)) {
    const list = pools[dist];
    let count = 0;
    count += pickFrom(list, (r) => r.is2025Update, 4);
    count += pickFrom(list, (r) => r.unit === "m2", 3);
    count += pickFrom(list, (r) => r.gateStatus === "benchmarked", Math.floor((target - count) / 2));
    count += pickFrom(list, (r) => r.gateStatus === "abstain", target - count);
    if (count < target) count += pickFrom(list, () => true, target - count);
  }

  const headers = [
    "audit_id",
    "district",
    "sro",
    "village_en",
    "village_ta",
    "lat",
    "lon",
    "tier2_gate_status",
    "street_name",
    "raw_rate",
    "unit",
    "rate_inr_sqft",
    "land_class",
    "effective_from",
    "tnreginet_portal",
    "tamil_nilam_portal",
    "audit_status",
    "unit_match",
    "rate_match",
    "class_match",
    "coord_match",
    "auditor_notes"
  ];

  const records = sample.slice(0, 50).map((r, idx) => ({
    audit_id: `TN-AUD-${String(idx + 1).padStart(2, "0")}`,
    district: r.district,
    sro: r.sro,
    village_en: r.villageEn,
    village_ta: r.villageTa,
    lat: r.lat,
    lon: r.lon,
    tier2_gate_status: r.gateStatus,
    street_name: r.street,
    raw_rate: r.rawRate,
    unit: r.unit,
    rate_inr_sqft: r.rateSqft,
    land_class: r.className,
    effective_from: r.effectiveFrom,
    tnreginet_portal: "https://tnreginet.gov.in/portal/",
    tamil_nilam_portal: "https://tngis.tn.gov.in/apps/gi_viewer/",
    audit_status: "PENDING_MANUAL_CHECK",
    unit_match: "",
    rate_match: "",
    class_match: "",
    coord_match: "",
    auditor_notes: ""
  }));

  const csvLines = [
    headers.join(","),
    ...records.map((rec) => headers.map((h) => csvCell(rec[h])).join(","))
  ];
  const csvPath = path.join(ROOT, "data/tn_pilot_audit_50.csv");
  const jsonPath = path.join(ROOT, "data/tn_pilot_audit_50.json");
  fs.writeFileSync(csvPath, csvLines.join("\n") + "\n", "utf8");
  fs.writeFileSync(
    jsonPath,
    JSON.stringify(
      {
        version: "2026-11-pilot-audit-v1",
        generatedUtc: new Date().toISOString(),
        seed: "tn-pilot-audit-v1",
        totalRecords: records.length,
        breakdownByDistrict: PE.PILOT_DISTRICTS.reduce((acc, d) => {
          acc[d] = records.filter((r) => r.district === d).length;
          return acc;
        }, {}),
        breakdownByGate: {
          benchmarked: records.filter((r) => r.tier2_gate_status === "benchmarked").length,
          abstain: records.filter((r) => r.tier2_gate_status === "abstain").length
        },
        midCycle2025Records: records.filter((r) => String(r.effective_from).startsWith("2025")).length,
        m2UnitRecords: records.filter((r) => r.unit === "m2").length,
        records
      },
      null,
      2
    ) + "\n",
    "utf8"
  );
  console.log(
    `Generated ${records.length}-record deterministic portal provenance audit sheet:\n` +
      `  CSV : ${csvPath}\n` +
      `  JSON: ${jsonPath}`
  );
}

function scoreAuditCsv(filePath) {
  const text = fs.readFileSync(path.resolve(filePath), "utf8").trim();
  const lines = text.split(/\r?\n/);
  const headers = parseCsvLine(lines[0]);
  const rows = lines.slice(1).map((line) => {
    const vals = parseCsvLine(line);
    const obj = {};
    headers.forEach((h, i) => (obj[h] = (vals[i] || "").trim()));
    return obj;
  });

  const normBool = (v) => {
    const s = String(v || "").toLowerCase();
    if (["yes", "y", "true", "1", "pass"].includes(s)) return true;
    if (["no", "n", "false", "0", "fail"].includes(s)) return false;
    return null;
  };

  let checked = 0;
  let passed = 0;
  let failed = 0;
  let pending = 0;
  const failureCounts = { unit: 0, rate: 0, class: 0, coord: 0 };

  for (const r of rows) {
    const st = String(r.audit_status || "").toUpperCase();
    if (st === "PENDING_MANUAL_CHECK" || !st) {
      pending++;
      continue;
    }
    checked++;
    const u = normBool(r.unit_match);
    const rt = normBool(r.rate_match);
    const c = normBool(r.class_match);
    const co = normBool(r.coord_match);
    if (u === false) failureCounts.unit++;
    if (rt === false) failureCounts.rate++;
    if (c === false) failureCounts.class++;
    if (co === false) failureCounts.coord++;
    if (st === "PASS" && u !== false && rt !== false && c !== false && co !== false) {
      passed++;
    } else {
      failed++;
    }
  }

  const report = {
    file: path.resolve(filePath),
    totalRows: rows.length,
    checkedRows: checked,
    pendingRows: pending,
    passedRows: passed,
    failedRows: failed,
    passRatePct: checked ? Math.round((passed / checked) * 1000) / 10 : null,
    rejectionRatePct: checked ? Math.round((failed / checked) * 1000) / 10 : null,
    failureBreakdown: failureCounts,
    meets50RecordGate: checked >= 50 && failed / Math.max(1, checked) <= 0.04
  };
  console.log(JSON.stringify(report, null, 2));
}

if (process.argv[2] === "--score" && process.argv[3]) {
  scoreAuditCsv(process.argv[3]);
} else {
  generateSample();
}
