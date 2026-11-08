/* Inventory research already in the app. Run: npm run audit:projects */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const context = { window: {} };
vm.createContext(context);
for (const f of ['data/backtest.js', 'data/private.js']) vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), context);
const cases = (context.window.BL_BACKTEST || {}).rows || [];
const privateData = context.window.BL_PRIVATE || {};
const projects = new Set(cases.map((r) => r.project));
const sources = new Set(cases.map((r) => r.src).filter(Boolean));
const benchmarks = { raw: 0, specified: 0, notRecorded: 0 };
for (const r of cases) benchmarks[r.bench === 'raw' ? 'raw' : r.bench ? 'specified' : 'notRecorded']++;
const registrationsByYear = {};
for (const row of privateData.rera || []) {
  const year = String(row[7] || '').match(/\b(?:19|20)\d{2}\b/);
  const key = year ? year[0] : 'unknown';
  registrationsByYear[key] = (registrationsByYear[key] || 0) + 1;
}
console.log(JSON.stringify({
  historicalCaseRows: cases.length,
  uniqueProjectNames: projects.size,
  uniqueCaseSourceUrls: sources.size,
  comparisonBenchmarks: benchmarks,
  casesWithOldAndFittedModel: cases.filter((r) => r.old != null && r.now != null).length,
  sameYearCases: cases.filter((r) => r.y0 === r.y1).length,
  tnReraProjectRows: (privateData.rera || []).length,
  reraRegistrationYears: registrationsByYear,
  investmentRows: (privateData.inv || []).length,
  caveat: 'Cases may share projects or sources; raw and benchmark-adjusted changes cannot be pooled as causal impacts. RERA registrations are not verified sale prices or proof that an investment was completed.'
}, null, 2));
