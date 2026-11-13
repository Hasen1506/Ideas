const test = require('node:test');
const assert = require('node:assert/strict');
require('../js/comparables.js');
const C = globalThis.BL.Comparables;

test('shows the recorded asking price rather than the discounted model input', () => {
  const listing = { type: 'listing', loc: 'A', land: 'plot', price: 900, txn_sqyd: 9000, src: 'https://example.com/listing' };
  const aggregate = { type: 'consensus', loc: 'B', land: 'plot', price: 1080, typ: 1200, txn_sqyd: 9720, src: 'https://example.com/aggregate' };
  const result = C.groups([{ p: listing, i: 0, d: 2 }, { p: aggregate, i: 1, d: 1 }]);
  assert.deepEqual(result.asking.map((r) => r.value), [1200, 1000]);
  assert.equal(result.reported.length, 0);
});

test('keeps transactions, auction reserves, official rates and derived proxies separate', () => {
  const entries = [
    { p: { type: 'registered', price: 2000, src: 'https://example.com/report' }, i: 1, d: 1 },
    { p: { type: 'govt_auction', price: 1500, note: 'reserve', src: 'https://example.com/auction' }, i: 2, d: 2 },
    { p: { type: 'derived_gv', derived: true, price: 1200, govt_sqyd: 4500, govt_src: 'https://example.com/rate', govt_note: 'residential', note: 'estimated proxy' }, i: 3, d: 3 },
    { p: { type: 'compensation', price: 800 }, i: 4, d: 4 },
    { p: { type: 'official', price: 600 }, i: 5, d: 5 }
  ];
  const result = C.groups(entries);
  assert.deepEqual(result.reported.map((r) => r.value), [2000]);
  assert.deepEqual(result.auction.map((r) => r.value), [1500]);
  assert.deepEqual(result.official.map((r) => r.value), [500, 600]);
  assert.equal(result.official[0].note, 'residential');
  assert.deepEqual(result.compensation.map((r) => r.value), [800]);
  assert.deepEqual(result.proxy.map((r) => r.value), [1200]);
  assert.equal(result.asking.length, 0);
});

test('does not invent a raw asking price or link to an unsafe source', () => {
  const p = { type: 'listing', price: 900, src: 'javascript:alert(1)', govt_sqyd: 4500, govt_src: 'data:text/html,evil' };
  const result = C.groups([{ p, i: 0, d: 1 }]);
  assert.equal(result.asking.length, 0);
  assert.equal(result.official[0].source, '');
  assert.equal(C.safeUrl('https://example.com/a'), 'https://example.com/a');
});

test('shows a guideline range without converting it to a single rate', () => {
  const p = { type: 'derived_gv', derived: true, price: 3000, govt_low_sqft: 1000, govt_high_sqft: 4000, govt_retrieved: '2026-10-25', govt_src: 'https://example.com/rates' };
  const result = C.groups([{ p, i: 3, d: 1 }]);
  assert.equal(result.official.length, 1);
  assert.equal(result.official[0].officialKind, 'guideline-range');
  assert.equal(result.official[0].value, null);
  assert.equal(result.official[0].low, 1000);
  assert.equal(result.official[0].high, 4000);
  assert.equal(result.official[0].retrieved, '2026-10-25');
  assert.equal(result.proxy[0].value, 3000);
});
