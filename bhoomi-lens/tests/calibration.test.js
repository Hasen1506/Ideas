const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

require('../js/data.js');
require('../js/engine.js');
require('../js/comparables.js');
const E = globalThis.BL.Engine;
const C = globalThis.BL.Comparables;
const point = { lat: 12.95, lon: 79.79, state: 'Tamil Nadu', loc: 'Example' };

test('compensation and standalone official rates do not change price calibration', () => {
  const listing = { ...point, type: 'listing', price: 1200, w: 1 };
  const compensation = { ...point, type: 'compensation', price: 20000, w: 1 };
  const official = { ...point, type: 'official', price: 20, w: 1 };
  E.setCalibration([listing], []);
  const expected = E.calibFactor(point.lat, point.lon);
  const used = E.setCalibration([listing, compensation, official], []);
  assert.equal(used.length, 1);
  assert.equal(E.calibFactor(point.lat, point.lon), expected);
  E.setCalibration([compensation, official], []);
  assert.equal(E.calibFactor(point.lat, point.lon), 1);
});

test('explicit guideline proxies remain available, but zero-weight points do not calibrate', () => {
  const proxy = { ...point, type: 'derived_gv', derived: true, price: 1200, w: 0.06 };
  const disabled = { ...point, type: 'listing', price: 50000, w: 0 };
  E.setCalibration([proxy], []);
  const expected = E.calibFactor(point.lat, point.lon);
  assert.notEqual(expected, 1);
  const used = E.setCalibration([proxy, disabled], []);
  assert.equal(used.length, 1);
  assert.equal(E.calibFactor(point.lat, point.lon), expected);
  const observed = { ...point, type: 'listing', price: 1000, govt_sqyd: 4500, txn_sqyd: 9000 };
  const disabledPair = { ...observed, govt_sqyd: 900, w: 0 };
  assert.equal(E.observedCircleRatios([observed, disabledPair]).overall, 0.5);
});

test('the two acquisition offers remain visible as compensation, not sales', () => {
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../data/verified.js'), 'utf8'), sandbox);
  const rows = sandbox.window.BL_VERIFIED.filter((p) =>
    p.loc === 'Parandur' || p.loc === 'Purandar airport villages (Pargaon-Ekhatpur area)');
  assert.equal(rows.length, 2);
  assert.ok(rows.every((p) => p.type === 'compensation' && !E.isMarketReference(p)));
  assert.equal(E.setCalibration(rows, []).length, 0);
  const grouped = C.groups(rows.map((p, i) => ({ p, i, d: 1 })));
  assert.equal(grouped.compensation.length, 2);
  assert.equal(grouped.reported.length, 0);
});
