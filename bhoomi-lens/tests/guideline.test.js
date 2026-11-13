const test = require('node:test');
const assert = require('node:assert/strict');
require('../js/guideline.js');
const G = globalThis.BL.Guideline;

test('finds nearby recorded villages in distance order, not a distant or malformed point', () => {
  const data = { rows: [
    ['Further', '', '', '', 13.01, 80.26, 100],
    ['Nearest', '', '', '', 13.08, 80.26, 200],
    ['Far', '', '', '', 14, 80.26, 300],
    ['Missing coordinate', '', '', '', null, 80.26, 400]
  ] };
  assert.deepEqual(G.nearest(data, 13.08, 80.26, 10).map((x) => x.row[0]), ['Nearest', 'Further']);
  assert.equal(G.nearest(data, 13.08, 80.26, 10, 1)[0].row[0], 'Nearest');
  assert.deepEqual(G.nearest(data, NaN, 80.26), []);
  assert.deepEqual(G.nearest(data, 13.08, 80.26, -1), []);
});

test('keeps every requested revision distinct and does not fill missing values', () => {
  const data = { rev: ['2024', '2017', '2012', '2007'] };
  const row = ['Village', '', '', '', 13, 80, 150.5, null, 75, 0];
  assert.deepEqual(G.observations(data, row), [
    { revision: '2024', value: 150.5 }, { revision: '2017', value: null },
    { revision: '2012', value: 75 }, { revision: '2007', value: null }
  ]);
});
