const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const sandbox = { window: {} };
for (const file of ['nhb_hpi_archive.js', 'nhb_hpi_recent.js']) {
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../data', file), 'utf8'), sandbox);
}

test('NHB archive keeps original index bases and source periods separate', () => {
  const series = sandbox.window.BL_NHB_HPI_ARCHIVE.series;
  assert.equal(series.length, 3);
  assert.deepEqual(Array.from(series.map((s) => s.base)), ['2007 = 100', 'FY 2012-13 = 100', 'FY 2017-18 = 100']);
  const legacy = series.find((s) => s.id === 'base2007');
  assert.equal(Object.keys(legacy.cities).length, 26);
  assert.equal(legacy.periods[0], '2008-H1');
  assert.equal(legacy.periods.at(-1), '2015-Q1');
  assert.equal(legacy.cities.Chennai[0], 104);
  assert.equal(legacy.cities.Chennai.at(-1), 364);
  assert.equal(legacy.cities.Coimbatore[0], null);
  assert.equal(legacy.cities.Coimbatore[legacy.periods.indexOf('2013-Q1')], 184);
  assert.equal(Object.values(legacy.cities).flat().filter((v) => v !== null).length, 494);
  for (const s of series.slice(1)) {
    assert.equal(Object.keys(s.cities).length, 50);
    assert.ok(s.source_url.startsWith('https://residex.nhbonline.org.in/'));
    for (const values of Object.values(s.cities)) {
      assert.equal(values.length, s.periods.length);
      assert.ok(values.every((v) => Number.isFinite(v) && v > 0));
    }
  }
  assert.equal(series[1].periods[0], '2013-Q2');
  assert.equal(series[1].cities.Chennai[0], 103);
  assert.equal(series[2].periods.at(-1), '2025-Q3');
  assert.equal(series[2].cities.Coimbatore[series[2].periods.indexOf('2022-Q3')], 133.28);
  assert.equal(series[2].cities.Coimbatore.at(-1), 159);
  assert.equal(series[2].sources.length, 4);
});

test('the separate recent release contains the published city change and source', () => {
  const released = sandbox.window.BL_NHB_HPI_RECENT.releases.find((x) => x.period === '2026-Q2');
  assert.equal(released.base, 'FY 2024-25 = 100');
  assert.equal(released.city_yoy_pct.Chennai, 10.8);
  assert.equal(released.city_yoy_pct.Pune, 3.7);
  assert.equal(released.city_yoy_pct.Coimbatore, undefined);
});
