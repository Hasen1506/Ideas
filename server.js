const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const HOST = '0.0.0.0';
const STATIC_DIR = path.join(__dirname, 'bhoomi-lens');
const SQFT_PER_M2 = 10.7639104167;
const ALLOWED_PILOT_DISTRICTS = new Set(['Chengalpattu', 'Kancheepuram', 'Tiruvallur']);
const streetIndexCache = new Map();

function getPilotStreets(district) {
  if (!ALLOWED_PILOT_DISTRICTS.has(district)) return null;
  if (streetIndexCache.has(district)) return streetIndexCache.get(district);
  const filePath = path.join(STATIC_DIR, 'data', 'tn_gv', `${district}.json`);
  if (!fs.existsSync(filePath)) return [];
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const classes = raw.classes || [];
  const list = [];
  for (const sro of Object.values(raw.sros || {})) {
    const sroName = String(sro.name || '').trim();
    const rev = (sro.revs || {})['2024'] || {};
    for (const vobj of Object.values(rev.d || {})) {
      if (!vobj || !Array.isArray(vobj.rows)) continue;
      const village = String(vobj.n || '').trim();
      for (const r of vobj.rows) {
        const cls = classes[r[3]] || '';
        const unit = r[2];
        if ((unit !== 'ft2' && unit !== 'm2') || !/குடியிருப்பு|Residential/i.test(cls)) continue;
        const val = Number(r[1]);
        if (!Number.isFinite(val) || val <= 0) continue;
        const rateSqft = Math.round(unit === 'm2' ? val / SQFT_PER_M2 : val);
        const street = String(r[0] || '').trim();
        list.push({
          street,
          streetLc: street.toLowerCase(),
          village,
          villageLc: village.toLowerCase(),
          sro: sroName,
          rateSqft,
          rawRate: val,
          unit,
          className: cls,
          effectiveFrom: String(r[4] || '')
        });
      }
    }
  }
  streetIndexCache.set(district, list);
  return list;
}

const staticOptions = {
  index: 'index.html',
  setHeaders(res, filePath) {
    if (filePath.endsWith('.mjs')) {
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    }
  },
};

app.get('/healthz', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.get('/api/pilot/streets', (req, res) => {
  const district = String(req.query.district || '').trim();
  const list = getPilotStreets(district);
  if (!list) {
    return res.status(400).json({ error: 'District must be Chengalpattu, Kancheepuram, or Tiruvallur' });
  }
  const q = String(req.query.q || '').trim().toLowerCase();
  const village = String(req.query.village || '').trim().toLowerCase();
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
  const matched = list.filter((row) => {
    if (village && row.villageLc !== village && !row.villageLc.includes(village)) return false;
    if (q && !row.streetLc.includes(q) && !row.villageLc.includes(q)) return false;
    return true;
  });
  res.json({
    district,
    totalIndexed: list.length,
    totalMatched: matched.length,
    rows: matched.slice(0, limit).map(({ streetLc, villageLc, ...pub }) => pub)
  });
});

app.get('/api/pilot/report', (_req, res) => {
  const reportPath = path.join(STATIC_DIR, 'data', 'tn_pilot_report.json');
  if (!fs.existsSync(reportPath)) return res.status(404).json({ error: 'Pilot report not built' });
  res.sendFile(reportPath);
});

app.get('/api/pilot/audit-sample.csv', (_req, res) => {
  const csvPath = path.join(STATIC_DIR, 'data', 'tn_pilot_audit_50.csv');
  if (!fs.existsSync(csvPath)) return res.status(404).json({ error: 'Audit sample not built' });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="tn_pilot_audit_50.csv"');
  res.sendFile(csvPath);
});

app.get('/api/pilot/blind-template.csv', (_req, res) => {
  const csvPath = path.join(STATIC_DIR, 'data', 'tn_pilot_blind_auctions_template.csv');
  if (!fs.existsSync(csvPath)) return res.status(404).json({ error: 'Blind auction template not built' });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="tn_pilot_blind_auctions_template.csv"');
  res.sendFile(csvPath);
});

app.get('/api/pilot/10quote-check', (_req, res) => {
  const jsonPath = path.join(STATIC_DIR, 'data', 'tn_pilot_10quote_check.json');
  if (!fs.existsSync(jsonPath)) return res.status(404).json({ error: '10-quote contract check not built' });
  res.sendFile(jsonPath);
});

app.use('/bhoomi-lens', express.static(STATIC_DIR, staticOptions));
app.use('/', express.static(STATIC_DIR, staticOptions));

app.get('*', (req, res, next) => {
  if (req.path.includes('.')) {
    return next();
  }
  res.sendFile(path.join(STATIC_DIR, 'index.html'));
});

app.listen(PORT, HOST, () => {
  console.log(`Bhoomi Lens server listening on http://${HOST}:${PORT}`);
});
