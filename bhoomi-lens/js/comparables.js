/* Separate nearby evidence by what the source actually reports. */
(function (root) {
  const BL = (root.BL = root.BL || {});
  const GROUPS = [
    { id: "asking", label: "Asking and quoted prices" },
    { id: "reported", label: "Reported sales and registrations" },
    { id: "auction", label: "Auctions and allotments" },
    { id: "official", label: "Reported official rates" },
    { id: "compensation", label: "Acquisition compensation" },
    { id: "proxy", label: "Guideline-derived model inputs" }
  ];
  const positive = (v) => Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : null;
  function safeUrl(value) {
    try { const u = new URL(value); return (u.protocol === "https:" || u.protocol === "http:") ? u.href : ""; } catch (_) { return ""; }
  }
  function primarySource(p, official) {
    if (official) return safeUrl(p.govt_src);
    const candidates = [p.src, ...(Array.isArray(p.sources) ? p.sources.map((s) => s && s.url) : [])];
    return candidates.map(safeUrl).find(Boolean) || "";
  }
  function groups(entries) {
    const out = Object.fromEntries(GROUPS.map((g) => [g.id, []]));
    for (const entry of entries || []) {
      const p = entry && entry.p;
      if (!p || !Number.isFinite(entry.d) || entry.d < 0) continue;
      const base = { index: entry.i, distance: entry.d, loc: String(p.loc || "Location not recorded"), district: String(p.district || ""), state: String(p.state || ""), land: String(p.land || "Not recorded"), date: String(p.date || ""), retrieved: String(p.retrieved || ""), note: String(p.note || ""), source: primarySource(p, false), type: String(p.type || "") };
      if (p.derived || p.type === "derived_gv") {
        if (positive(p.price)) out.proxy.push({ ...base, value: positive(p.price), kind: "proxy" });
      } else if (["listing", "consensus", "unverified"].includes(p.type)) {
        // Listing model inputs can already have a 10% discount. Use the recorded
        // asking figure, not the discounted model input, in the evidence list.
        const value = positive(p.typ) || (positive(p.txn_sqyd) ? positive(p.txn_sqyd) / 9 : null);
        if (value) out.asking.push({ ...base, value, kind: "asking" });
      } else if (["registered", "reported_deal"].includes(p.type)) {
        if (positive(p.price)) out.reported.push({ ...base, value: positive(p.price), kind: "reported" });
      } else if (["govt_auction", "govt_allotment", "bank_auction"].includes(p.type)) {
        if (positive(p.price)) out.auction.push({ ...base, value: positive(p.price), kind: "auction" });
      } else if (p.type === "official") {
        if (positive(p.price)) out.official.push({ ...base, value: positive(p.price), kind: "official", officialKind: "other" });
      } else if (p.type === "compensation") {
        if (positive(p.price)) out.compensation.push({ ...base, value: positive(p.price), kind: "compensation" });
      }
      for (const [key, land] of [["govt_sqyd", "Type not confirmed"], ["govt_sqyd_agri", "Agricultural"]]) {
        const rate = positive(p[key]);
        if (rate) out.official.push({ ...base, value: rate / 9, kind: "official", officialKind: "guideline", land, date: String(p.govt_date || ""), retrieved: String(p.govt_retrieved || ""), note: String(p.govt_note || ""), source: primarySource(p, true) });
      }
      // When the source only recorded a range, show the range itself. The
      // model's geometric midpoint is a calculation, not an official rate.
      const low = positive(p.govt_low_sqft), high = positive(p.govt_high_sqft);
      if (!positive(p.govt_sqyd) && low && high && high >= low) {
        out.official.push({ ...base, value: null, low, high, kind: "official", officialKind: "guideline-range", land: "Type not confirmed", date: String(p.govt_date || ""), retrieved: String(p.govt_retrieved || ""), note: String(p.govt_note || ""), source: primarySource(p, true) });
      }
    }
    for (const rows of Object.values(out)) rows.sort((a, b) => a.distance - b.distance);
    return out;
  }
  BL.Comparables = { GROUPS, groups, safeUrl };
})(typeof window !== "undefined" ? window : globalThis);
