const test = require("node:test");
const assert = require("node:assert/strict");
require("../js/csv.js");
const cell = globalThis.BL.CSV.escapeCell;

test("escapes CSV delimiters, quotes and line breaks", () => {
  assert.equal(cell('a,"b"\nc'), '"a,""b""\nc"');
  assert.equal(cell("a\rb"), '"a\rb"');
});
test("prevents formula-like text from executing in a spreadsheet", () => {
  for (const value of ["=1+1", "+cmd", "-cmd", "@sum", "\t=cmd"]) assert.equal(cell(value), "'" + value);
});
test("keeps ordinary text and signed numeric values usable", () => {
  assert.equal(cell("Chennai"), "Chennai");
  assert.equal(cell("-12.5"), "-12.5");
  assert.equal(cell(13.08), "13.08");
});
