/* CSV escaping for exports, including spreadsheet formula injection protection. */
(function (root) {
  const BL = (root.BL = root.BL || {});
  function escapeCell(value) {
    let s = String(value == null ? "" : value);
    const numeric = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(s.trim());
    if (!numeric && /^\s*[=+\-@]/.test(s)) s = "'" + s;
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  BL.CSV = { escapeCell };
})(typeof window !== "undefined" ? window : globalThis);
