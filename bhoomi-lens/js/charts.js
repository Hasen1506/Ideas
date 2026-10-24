/* Bhoomi Lens - tiny dependency-free SVG chart kit. */
(function (root) {
  const BL = (root.BL = root.BL || {});
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function fmtINR(n, unit) {
    if (!isFinite(n)) return "-";
    if (n >= 1e7) return "\u20B9" + (n / 1e7).toFixed(n >= 1e9 ? 0 : 2) + " Cr";
    if (n >= 1e5) return "\u20B9" + (n / 1e5).toFixed(1) + " L";
    return "\u20B9" + Math.round(n).toLocaleString("en-IN") + (unit || "");
  }
  const pct = (x, d = 1) => (x >= 0 ? "+" : "") + (x * 100).toFixed(d) + "%";

  /* Fan chart: historical line + projected band. */
  function fan(series, opts = {}) {
    const W = opts.w || 340, H = opts.h || 170, P = { l: 44, r: 10, t: 12, b: 22 };
    const MY = BL.MODEL_YEAR;
    const xs = series.map((s) => s.y);
    const x0 = Math.min(...xs), x1 = Math.max(...xs);
    const ymax = Math.max(...series.map((s) => s.hi)) * 1.05;
    const ymin = Math.min(...series.map((s) => s.lo)) * 0.9;
    const X = (y) => P.l + ((y - x0) / (x1 - x0)) * (W - P.l - P.r);
    const Y = (v) => H - P.b - ((v - ymin) / (ymax - ymin)) * (H - P.t - P.b);
    const fut = series.filter((s) => s.y >= MY);
    const band = fut.map((s) => `${X(s.y)},${Y(s.hi)}`).join(" ") + " " + fut.slice().reverse().map((s) => `${X(s.y)},${Y(s.lo)}`).join(" ");
    const hist = series.filter((s) => s.y <= MY).map((s, i) => `${i ? "L" : "M"}${X(s.y)},${Y(s.p)}`).join("");
    const proj = fut.map((s, i) => `${i ? "L" : "M"}${X(s.y)},${Y(s.p)}`).join("");
    const ticks = [];
    for (let i = 0; i <= 3; i++) {
      const v = ymin + ((ymax - ymin) * i) / 3;
      ticks.push(`<line x1="${P.l}" x2="${W - P.r}" y1="${Y(v)}" y2="${Y(v)}" class="grid"/><text x="${P.l - 6}" y="${Y(v) + 3}" class="axis" text-anchor="end">${esc(fmtINR(v))}</text>`);
    }
    const yrs = [x0, 2020, MY, 2031, x1].filter((v, i, a) => a.indexOf(v) === i);
    const xt = yrs.map((y) => `<text x="${X(y)}" y="${H - 6}" class="axis" text-anchor="middle">${y}</text>`).join("");
    const marks = (opts.marks || []).filter((m) => m.y >= x0 && m.y <= x1).map((m) => `<g class="mark"><line x1="${X(m.y)}" x2="${X(m.y)}" y1="${P.t}" y2="${H - P.b}"/><circle cx="${X(m.y)}" cy="${P.t + 4}" r="3.5" fill="${m.color}"><title>${esc(m.label)} (${m.y})</title></circle></g>`).join("");
    const cur = opts.cursor ? `<line x1="${X(opts.cursor)}" x2="${X(opts.cursor)}" y1="${P.t}" y2="${H - P.b}" class="cursor"/>` : "";
    const last = fut[fut.length - 1];
    return `<svg viewBox="0 0 ${W} ${H}" class="chart fan" preserveAspectRatio="none">
      <defs><linearGradient id="fanG" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#ffb547" stop-opacity=".35"/><stop offset="1" stop-color="#ff7a59" stop-opacity=".06"/></linearGradient></defs>
      ${ticks.join("")}${xt}
      <polygon points="${band}" fill="url(#fanG)"/>
      <path d="${hist}" class="hist"/><path d="${proj}" class="proj"/>
      <line x1="${X(MY)}" x2="${X(MY)}" y1="${P.t}" y2="${H - P.b}" class="today"/>
      <text x="${X(MY) + 4}" y="${P.t + 10}" class="axis today-l">today</text>
      ${marks}${cur}
      <circle cx="${X(last.y)}" cy="${Y(last.p)}" r="3.5" class="dot"/>
    </svg>`;
  }

  /* Multi-line comparison chart. */
  function lines(list, opts = {}) {
    const W = opts.w || 340, H = opts.h || 160, P = { l: 44, r: 10, t: 10, b: 22 };
    const all = list.flatMap((l) => l.series);
    const x0 = Math.min(...all.map((s) => s.y)), x1 = Math.max(...all.map((s) => s.y));
    const vals = all.map((s) => s.v);
    const ymax = Math.max(...vals) * 1.05, ymin = Math.min(...vals) * 0.95;
    const X = (y) => P.l + ((y - x0) / (x1 - x0)) * (W - P.l - P.r);
    const Y = (v) => H - P.b - ((v - ymin) / (ymax - ymin || 1)) * (H - P.t - P.b);
    const grid = [0, 1, 2, 3].map((i) => { const v = ymin + ((ymax - ymin) * i) / 3; return `<line x1="${P.l}" x2="${W - P.r}" y1="${Y(v)}" y2="${Y(v)}" class="grid"/><text x="${P.l - 6}" y="${Y(v) + 3}" class="axis" text-anchor="end">${opts.fmt ? esc(opts.fmt(v)) : v.toFixed(1)}</text>`; }).join("");
    const paths = list.map((l) => `<path d="${l.series.map((s, i) => `${i ? "L" : "M"}${X(s.y)},${Y(s.v)}`).join("")}" stroke="${l.color}" class="ln"/>`).join("");
    const xt = [x0, BL.MODEL_YEAR, x1].map((y) => `<text x="${X(y)}" y="${H - 6}" class="axis" text-anchor="middle">${y}</text>`).join("");
    return `<svg viewBox="0 0 ${W} ${H}" class="chart" preserveAspectRatio="none">${grid}${xt}<line x1="${X(BL.MODEL_YEAR)}" x2="${X(BL.MODEL_YEAR)}" y1="${P.t}" y2="${H - P.b}" class="today"/>${paths}</svg>`;
  }

  /* Radar for risk components. */
  function radar(items, opts = {}) {
    const S = opts.size || 180, c = S / 2, R = S / 2 - 26;
    const n = items.length;
    const pt = (i, v) => { const a = -Math.PI / 2 + (i * 2 * Math.PI) / n; return [c + Math.cos(a) * R * v, c + Math.sin(a) * R * v]; };
    const rings = [0.25, 0.5, 0.75, 1].map((r) => `<polygon class="rg" points="${items.map((_, i) => pt(i, r).join(",")).join(" ")}"/>`).join("");
    const spokes = items.map((_, i) => `<line class="rg" x1="${c}" y1="${c}" x2="${pt(i, 1)[0]}" y2="${pt(i, 1)[1]}"/>`).join("");
    const poly = `<polygon class="rv" points="${items.map((it, i) => pt(i, Math.max(0.04, it.v)).join(",")).join(" ")}"/>`;
    const labels = items.map((it, i) => { const [x, y] = pt(i, 1.2); return `<text x="${x}" y="${y + 3}" class="axis" text-anchor="middle">${esc(it.label)}</text>`; }).join("");
    return `<svg viewBox="0 0 ${S} ${S}" class="chart radar">${rings}${spokes}${poly}${labels}</svg>`;
  }

  /* Circular score gauge. */
  function gauge(v, opts = {}) {
    const S = opts.size || 74, r = S / 2 - 7, C = 2 * Math.PI * r;
    const col = opts.color || "#2ee6c5";
    return `<svg viewBox="0 0 ${S} ${S}" class="gauge"><circle cx="${S / 2}" cy="${S / 2}" r="${r}" class="g-bg"/><circle cx="${S / 2}" cy="${S / 2}" r="${r}" class="g-fg" stroke="${col}" stroke-dasharray="${(C * v) / 100} ${C}" transform="rotate(-90 ${S / 2} ${S / 2})"/><text x="50%" y="54%" text-anchor="middle" class="g-t">${Math.round(v)}</text></svg>`;
  }

  /* Horizontal contribution bars. */
  function bars(parts, opts = {}) {
    const max = Math.max(...parts.map((p) => Math.abs(p.v)), 0.0001);
    return `<div class="bars">${parts.map((p) => `<div class="bar-row" ${p.c ? `data-cat="${esc(p.c.id)}"` : ""}><div class="bar-l" title="${esc(p.label)}">${esc(p.label)}</div><div class="bar-t"><div class="bar-f" style="width:${(Math.abs(p.v) / max) * 100}%;background:${p.color || "#5ad1ff"}"></div></div><div class="bar-v">${pct(p.v)}</div></div>`).join("")}</div>`;
  }

  /* Histogram (log-binned). */
  function histogram(values, opts = {}) {
    const W = opts.w || 320, H = opts.h || 90, B = opts.bins || 18;
    const lv = values.filter((v) => v > 0).map(Math.log10);
    const lo = Math.min(...lv), hi = Math.max(...lv) + 1e-9;
    const bins = new Array(B).fill(0);
    for (const v of lv) bins[Math.min(B - 1, Math.floor(((v - lo) / (hi - lo || 1)) * B))]++;
    const m = Math.max(...bins, 1), bw = W / B;
    const rects = bins.map((b, i) => `<rect x="${i * bw + 1}" y="${H - 16 - (b / m) * (H - 22)}" width="${bw - 2}" height="${(b / m) * (H - 22)}" rx="2" fill="hsl(${200 - (i / B) * 170},85%,60%)"/>`).join("");
    return `<svg viewBox="0 0 ${W} ${H}" class="chart">${rects}<text x="0" y="${H - 3}" class="axis">${esc(fmtINR(10 ** lo))}</text><text x="${W}" y="${H - 3}" class="axis" text-anchor="end">${esc(fmtINR(10 ** hi))}</text></svg>`;
  }

  /* Stage progress pips. */
  function stage(s) {
    return `<div class="stage">${BL.STAGES.map((_, i) => `<i class="${i <= s ? "on" : ""}" title="${esc(BL.STAGES[i])}"></i>`).join("")}</div>`;
  }

  BL.Charts = { fan, lines, radar, gauge, bars, histogram, stage, fmtINR, pct, esc };
})(typeof window !== "undefined" ? window : globalThis);
