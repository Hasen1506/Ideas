/* Inventory the app's current reference inputs. Run: node scripts/audit_market_evidence.js
 * Dates and repeated names are only indicators: they do not establish comparable sales. */
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");
global.window = undefined;
for (const file of ["data/verified.js", "data/tn_villages.js", "data/evidence.js"]) {
  vm.runInThisContext(fs.readFileSync(path.join(root, file), "utf8").replace(/window\./g, "globalThis."), { filename: file });
}
require(path.join(root, "js/data.js"));
require(path.join(root, "js/engine.js"));
const E = globalThis.BL.Engine;
const rows = globalThis.BL_VERIFIED.filter((p) => !/SRO villages \(/.test(p.loc || ""))
  .concat(E.expandTNVillages(globalThis.BL_TN_VILLAGES, ((globalThis.BL_EVIDENCE || {}).multiples || {}).state || 2.3))
  .concat(E.expandEvidence(globalThis.BL_EVIDENCE));
const market = rows.filter(E.isMarketReference);
const types = {}, years = {}, locations = new Map();
for (const p of market) {
  types[p.type] = (types[p.type] || 0) + 1;
  const match = String(p.date || "").match(/\b(?:19|20)\d{2}\b/);
  if (!match) { years.unknown = (years.unknown || 0) + 1; continue; }
  const year = match[0], key = `${p.state || ""}|${String(p.loc || "").toLowerCase().trim()}`;
  years[year] = (years[year] || 0) + 1;
  if (!locations.has(key)) locations.set(key, new Set());
  locations.get(key).add(year);
}
console.log(JSON.stringify({
  pricedMarketReferenceRows: market.length,
  pricedGuidelineDerivedRows: rows.filter((p) => p.derived && p.price > 0).length,
  tamilNaduRowsLabelledRegisteredSale: market.filter((p) => p.state === "Tamil Nadu" && p.type === "registered").length,
  marketReferenceTypes: types,
  referenceRowDatesByYear: years,
  exactStateAndPlaceNamesWithMultipleDatedYears: [...locations.values()].filter((s) => s.size > 1).length,
  caveat: "Dates may be collection dates; references may be listings or other proxies, and repeated place names do not establish comparable parcels or independent sales."
}, null, 2));
