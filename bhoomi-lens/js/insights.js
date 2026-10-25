/* Bhoomi Lens insights: Fair Price Check, overpay alert + share card, guideline-vs-market gap,
   infra-led shortlist, spot watchlist with project delay alerts, 10-year outlook report.
   All estimates; not advice. */
(function (G) {
  const BL = G.BL, C = BL.Charts, fmtINR = C.fmtINR, esc = C.esc;
  const UNITS = { sqft: ["per sq ft", 1], sqyd: ["per sq yd", 9], cent: ["per cent", 435.6], ground: ["per ground", 2400], acre: ["per acre", 43560], total: ["total price", 0] };
  const DUTY = { "Tamil Nadu": 9, "Karnataka": 6.6, "Maharashtra": 7, "Telangana": 7.5, "Andhra Pradesh": 7.5, "Kerala": 10, "Delhi": 7, "Uttar Pradesh": 8, "Haryana": 8, "Gujarat": 5.9, "West Bengal": 7, "Rajasthan": 7, "Odisha": 7, "Madhya Pradesh": 10.5, "Punjab": 8 };
  let ctx = null;
  const LS = { get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} } };
  const today = () => new Date().toISOString().slice(0, 10);
  const med = (a) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };

  // ---------- Fair range ----------
  function fairRange(c) {
    const mid = c.pm.basePrice;
    const b = c.conf === "High" ? 0.15 : c.conf === "Medium" ? 0.25 : 0.4;
    let lo = mid * (1 - b), hi = mid * (1 + b);
    const near5 = (c.nearAll || []).filter((x) => x.d <= 5 && x.p.price > 0);
    const cons = near5.filter((x) => x.p.type === "consensus");
    if (cons.length) {
      const cl = med(cons.map((x) => x.p.low)) * 0.9, ch = med(cons.map((x) => x.p.high)) * 0.9;
      lo = (lo + cl) / 2; hi = (hi + ch) / 2;
    }
    lo = Math.min(lo, mid * 0.95); hi = Math.max(hi, mid * 1.05);
    const nSrc = near5.reduce((a, x) => a + (x.p.sources ? x.p.sources.length : 1), 0);
    return { mid, lo: Math.round(lo), hi: Math.round(hi), band: b, nPts: near5.length, nSrc, nCons: cons.length };
  }
  function verdict(ask, fr) {
    if (ask > fr.hi * 1.2) return { k: "red", t: "Overpriced", s: `${Math.round((ask / fr.hi - 1) * 100)}% above the top of the fair range`, col: "#ff5d6c" };
    if (ask > fr.hi) return { k: "amber", t: "Slightly above fair range", s: `${Math.round((ask / fr.hi - 1) * 100)}% above the top of the fair range; room to negotiate`, col: "#ffd166" };
    if (ask < fr.lo * 0.7) return { k: "amber", t: "Unusually cheap", s: "well below nearby evidence; check title, land type (farm vs plot), approvals and access", col: "#ffd166" };
    return { k: "green", t: "Within fair range", s: ask < fr.lo ? "below the fair range: good price if title and approvals are clean" : "consistent with nearby evidence", col: "#5bd18b" };
  }

  // ---------- Detail-card block ----------
  function block(c) {
    ctx = c; ctx.fr = fairRange(c);
    const fr = ctx.fr, gov = c.gov ? Math.round(c.gov.p.govt_sqyd / 9) : null;
    const duty = DUTY[c.pm.state] || 7;
    return `
      <h3>Fair Price Check</h3>
      <div class="card" id="fpcCard">
        <div class="small muted">Fair range for a residential plot here: <b style="color:var(--text)">${fmtINR(fr.lo)}-${fmtINR(fr.hi)}/sq ft</b> (mid ${fmtINR(fr.mid)}), from ${fr.nPts} verified price point${fr.nPts === 1 ? "" : "s"} within 5 km (${fr.nSrc} sources${fr.nCons ? `, ${fr.nCons} cross-checked` : ""}) and the model. Band +/-${Math.round(fr.band * 100)}% reflects confidence.${fr.nPts === 0 ? '<div class="warn" style="margin-top:4px">Model-led: no verified price within 5 km. The range leans on farther evidence; treat the verdict as indicative.</div>' : ""}</div>
        <div class="row" style="gap:6px;margin-top:8px;flex-wrap:wrap">
          <input id="fpcAsk" type="number" min="0" placeholder="Asking price" style="width:130px" />
          <select id="fpcUnit">${Object.entries(UNITS).map(([k, v]) => `<option value="${k}">${v[0]}</option>`).join("")}</select>
          <input id="fpcArea" type="number" min="0" placeholder="Plot area sq ft" style="width:130px;display:none" />
          <button class="btn sm primary" data-ins="check">Check</button>
        </div>
        <div id="fpcOut"></div>
      </div>
      <h3>Official rate vs market</h3>
      <div class="card small" style="line-height:1.6">${gov ? `
        <div class="row sb"><span class="muted">Official guideline/circle rate nearby</span><b>${fmtINR(gov)}/sq ft</b></div>
        <div class="row sb"><span class="muted">Market estimate here</span><b>${fmtINR(fr.mid)}/sq ft</b></div>
        <div class="row sb"><span class="muted">Market above official</span><b>${Math.round((fr.mid / gov - 1) * 100)}%</b></div>
        <div class="row" style="gap:6px;margin-top:6px;flex-wrap:wrap"><input id="gapPrice" type="number" placeholder="Agreed Rs/sq ft" style="width:120px"/><input id="gapArea" type="number" placeholder="Area sq ft" style="width:100px"/><input id="gapDuty" type="number" step="0.1" value="${duty}" style="width:70px" title="Stamp duty + registration %"/><span class="muted">% duty</span><button class="btn sm" data-ins="gap">Calculate</button></div>
        <div id="gapOut" class="muted"></div>
        <div class="muted" style="margin-top:4px">Duty default for ${esc(c.pm.state || "this state")}: ${duty}% (edit to your exact rate). Source rate: ${esc(c.gov.p.govt_date || "")} <a href="${esc(c.gov.p.govt_src)}" target="_blank" rel="noopener">source</a>.</div>` : `<div class="muted">No official rate recorded within 8 km of this spot.</div>`}
      </div>
      <div class="btn-row" style="margin-top:10px"><button class="btn sm" data-ins="report">10-year outlook report</button><button class="btn sm" data-ins="watch">Watch this spot</button></div>`;
  }

  function askPerSqft() {
    const v = +document.getElementById("fpcAsk").value, u = document.getElementById("fpcUnit").value;
    if (!(v > 0)) return null;
    if (u === "total") { const a = +document.getElementById("fpcArea").value; return a > 0 ? v / a : null; }
    return v / UNITS[u][1];
  }
  function check() {
    const ask = askPerSqft(), out = document.getElementById("fpcOut");
    if (!ask) { out.innerHTML = '<div class="small down" style="margin-top:6px">Enter the asking price (and the plot area for a total price).</div>'; return; }
    const fr = ctx.fr, v = verdict(ask, fr);
    ctx.last = { ask, v };
    const pos = Math.max(0, Math.min(100, ((ask - fr.lo * 0.6) / (fr.hi * 1.4 - fr.lo * 0.6)) * 100));
    out.innerHTML = `<div style="margin-top:10px;border-left:4px solid ${v.col};padding:6px 10px">
        <div style="font-size:18px;font-weight:700;color:${v.col}">${v.t}</div>
        <div class="small">Asking ${fmtINR(Math.round(ask))}/sq ft vs fair ${fmtINR(fr.lo)}-${fmtINR(fr.hi)}: ${esc(v.s)}.</div>
        <div style="position:relative;height:10px;border-radius:5px;margin:8px 0;background:linear-gradient(90deg,#ffd166 0%,#5bd18b 25%,#5bd18b 62%,#ffd166 72%,#ff5d6c 85%)"><span style="position:absolute;left:${pos}%;top:-4px;width:3px;height:18px;background:#fff"></span></div>
        <div class="small muted">Evidence: ${fr.nPts} verified points within 5 km, ${fr.nSrc} sources. Estimate, not a valuation report or advice. Data as of ${esc(BL.DATA_ASOF || "Oct 2026")}.</div>
        <div class="btn-row" style="margin-top:6px"><button class="btn sm" data-ins="share">Share card</button><button class="btn sm" data-ins="png">Download image</button><button class="btn sm" data-ins="wa">WhatsApp</button></div></div>`;
  }

  // ---------- Share card (canvas) ----------
  function cardCanvas() {
    const { ask, v } = ctx.last, fr = ctx.fr;
    const cv = document.createElement("canvas"); cv.width = 1080; cv.height = 1350;
    const g = cv.getContext("2d");
    g.fillStyle = "#0b1220"; g.fillRect(0, 0, 1080, 1350);
    g.fillStyle = "#2ee6c5"; g.font = "bold 44px sans-serif"; g.fillText("Bhoomi Lens  |  Fair Price Check", 70, 110);
    g.fillStyle = "#c9d3e6"; g.font = "36px sans-serif"; g.fillText((ctx.place || "").slice(0, 44), 70, 180);
    g.fillText(`${ctx.pm.district || ""}${ctx.pm.state ? ", " + ctx.pm.state : ""}`.slice(0, 44), 70, 230);
    g.beginPath(); g.arc(540, 470, 150, 0, Math.PI * 2); g.fillStyle = v.col; g.fill();
    g.fillStyle = "#0b1220"; g.font = "bold 46px sans-serif"; g.textAlign = "center";
    g.fillText(v.k === "green" ? "FAIR" : v.k === "red" ? "OVERPRICED" : "CHECK", 540, 488);
    g.fillStyle = "#fff"; g.font = "bold 52px sans-serif"; g.fillText(v.t, 540, 700);
    g.font = "40px sans-serif"; g.fillStyle = "#c9d3e6";
    g.fillText(`Asking: Rs ${Math.round(ask).toLocaleString("en-IN")} / sq ft`, 540, 790);
    g.fillText(`Fair range: Rs ${fr.lo.toLocaleString("en-IN")} - ${fr.hi.toLocaleString("en-IN")} / sq ft`, 540, 860);
    g.fillText(`${fr.nPts} verified price points, ${fr.nSrc} sources within 5 km`, 540, 930);
    g.font = "30px sans-serif"; g.fillStyle = "#8fa3c7";
    g.fillText(`Checked ${today()}  |  Data as of ${BL.DATA_ASOF || "Oct 2026"}`, 540, 1180);
    g.fillText("Estimate from public listings and official rates. Not advice.", 540, 1230);
    g.textAlign = "left"; return cv;
  }
  function shareText() {
    const { ask, v } = ctx.last, fr = ctx.fr;
    return `Bhoomi Lens Fair Price Check: ${ctx.place} (${ctx.pm.district || ""}). Asking Rs ${Math.round(ask)}/sq ft. Fair range Rs ${fr.lo}-${fr.hi}/sq ft. Verdict: ${v.t}. ${fr.nPts} verified points within 5 km. ${location.href.split("#")[0]}#pt=${ctx.lat.toFixed(4)},${ctx.lon.toFixed(4)}`;
  }
  function png() { const a = document.createElement("a"); a.download = "bhoomi-fair-price.png"; a.href = cardCanvas().toDataURL("image/png"); a.click(); }
  async function share() {
    const cv = cardCanvas();
    try {
      const blob = await new Promise((r) => cv.toBlob(r, "image/png"));
      const file = new File([blob], "bhoomi-fair-price.png", { type: "image/png" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], text: shareText() }); return; }
    } catch (e) {}
    png();
  }
  function wa() { window.open("https://wa.me/?text=" + encodeURIComponent(shareText()), "_blank", "noopener"); }

  // ---------- Gap calculator ----------
  function gap() {
    const p = +document.getElementById("gapPrice").value, a = +document.getElementById("gapArea").value, d = +document.getElementById("gapDuty").value;
    const gov = ctx.gov.p.govt_sqyd / 9, out = document.getElementById("gapOut");
    if (!(p > 0 && a > 0)) { out.textContent = "Enter the agreed price per sq ft and the area."; return; }
    const base = Math.max(p, gov) * a, dutyAmt = base * d / 100, flag = gov > p * 1.1;
    out.innerHTML = `Duty is charged on the higher of agreed value and guideline value: ${fmtINR(Math.round(base))} x ${d}% = <b>${fmtINR(Math.round(dutyAmt))}</b>.` +
      (flag ? ` <span class="down">Guideline value is ${Math.round((gov / p - 1) * 100)}% above the agreed price, beyond the 10% tolerance in income-tax sections 50C / 56(2)(x): the seller's capital gain and the buyer's income can be computed on the guideline value. Speak to a CA.</span>` : " Agreed price is within 10% of (or above) the guideline value, so no 50C/56(2)(x) difference arises.");
  }

  // ---------- Watchlist + alerts ----------
  function projSnap(lat, lon) {
    return BL.CATALYSTS.map((c) => ({ c, d: BL.Engine.distToCatalyst(c, lat, lon) })).filter((x) => x.d < 60).slice(0, 25)
      .map((x) => ({ id: x.c.id, n: x.c.n, eta: x.c.eta, stage: x.c.stage, cancelled: !!x.c.cancelled, delays: (x.c.delays || []).length || 0 }));
  }
  function watch() {
    const w = LS.get("bl_spots", []);
    if (w.some((s) => Math.abs(s.lat - ctx.lat) < 1e-3 && Math.abs(s.lon - ctx.lon) < 1e-3)) { toast("Already watching this spot"); return; }
    w.push({ lat: ctx.lat, lon: ctx.lon, name: ctx.place, district: ctx.pm.district, state: ctx.pm.state, price: ctx.pm.basePrice, cagr: ctx.pm.cagr, saved: today(), projects: projSnap(ctx.lat, ctx.lon) });
    LS.set("bl_spots", w); toast("Watching this spot: open Alerts to see changes");
  }
  function toast(t) { const el = document.getElementById("toast"); if (!el) return; el.textContent = t; el.classList.add("show"); setTimeout(() => el.classList.remove("show"), 2200); }
  function alertsPanel(priceAt) {
    const w = LS.get("bl_spots", []);
    const byId = new Map(BL.CATALYSTS.map((c) => [c.id, c]));
    const recent = (lat, lon) => BL.CATALYSTS.filter((c) => BL.Engine.distToCatalyst(c, lat, lon) < 60).flatMap((c) => (c.events || []).filter((e) => /delay|scrap|cancel|halt|stay|slip/.test(e.kind || "") && (e.date || "") >= "2026-04").map((e) => ({ c, e })));
    if (!w.length) return `<div class="empty">Click any spot, then "Watch this spot". Alerts show price-estimate changes and project delays, cancellations or ETA shifts within 60 km since you saved it.</div>`;
    return w.map((s, i) => {
      const now = priceAt(s.lat, s.lon);
      const chg = now && s.price ? now.basePrice / s.price - 1 : 0;
      const diffs = s.projects.map((o) => { const c = byId.get(o.id); if (!c) return null; const out = [];
        if (c.eta !== o.eta) out.push(`ETA ${o.eta} -> ${c.eta}`); if (c.stage !== o.stage) out.push(`stage ${o.stage} -> ${c.stage}`);
        if (!!c.cancelled !== o.cancelled) out.push(c.cancelled ? "CANCELLED" : "revived"); if (((c.delays || []).length || 0) > o.delays) out.push("new delay recorded");
        return out.length ? `<div class="small"><b>${esc(c.n)}</b>: <span class="down">${esc(out.join(", "))}</span></div>` : null; }).filter(Boolean);
      const rec = recent(s.lat, s.lon).slice(0, 4).map(({ c, e }) => `<div class="small"><span class="muted">${esc(e.date)}</span> ${esc(c.n)}: ${e.src ? `<a href="${esc(e.src)}" target="_blank" rel="noopener">${esc(e.note || e.kind)}</a>` : esc(e.note || e.kind)}</div>`);
      return `<div class="card"><div class="row sb"><b>${esc(s.name || "Spot")}</b><button class="btn sm" data-ins="unwatch" data-i="${i}">Remove</button></div>
        <div class="small muted">${esc(s.district || "")}${s.state ? ", " + esc(s.state) : ""} | saved ${esc(s.saved)}</div>
        <div class="small">Estimate ${fmtINR(Math.round(s.price))} -> ${now ? fmtINR(Math.round(now.basePrice)) : "?"}/sq ft (<span class="${chg < 0 ? "down" : "up"}">${(chg * 100).toFixed(1)}%</span>)</div>
        ${diffs.length ? `<div style="margin-top:4px"><b class="small">Changes since saved</b>${diffs.join("")}</div>` : '<div class="small muted">No project status changes since saved.</div>'}
        ${rec.length ? `<div style="margin-top:4px"><b class="small">Recent delay/cancellation news within 60 km</b>${rec.join("")}</div>` : ""}
        <button class="btn sm" style="margin-top:6px" data-act="open-loc" data-lon="${s.lon}" data-lat="${s.lat}">Open spot</button></div>`;
    }).join("");
  }

  // ---------- Infra-led shortlist ----------
  function shortlistPanel(models) {
    const st = LS.get("bl_sl", { budget: 3000, state: "", horizon: 10 });
    const states = [...new Set(models.map((m) => m.state).filter(Boolean))].sort();
    const confirmed = (m) => (m.links || []).filter((L) => L.c && !L.c.cancelled && (L.c.stage || 0) >= 3);
    const rows = models.filter((m) => m.priceNow > 0 && m.priceNow <= st.budget && (!st.state || m.state === st.state))
      .map((m) => ({ m, inf: confirmed(m) })).filter((x) => x.inf.length)
      .sort((a, b) => b.m.cagr - a.m.cagr).slice(0, 15);
    return `<div class="card small"><div class="row" style="gap:6px;flex-wrap:wrap"><span>Budget up to Rs</span><input id="slBudget" type="number" value="${st.budget}" style="width:90px"/><span>/sq ft</span>
        <select id="slState"><option value="">All states</option>${states.map((s) => `<option ${s === st.state ? "selected" : ""}>${esc(s)}</option>`).join("")}</select><button class="btn sm primary" data-ins="sl">Update</button></div>
        <div class="muted" style="margin-top:4px">Districts within budget that have at least one confirmed project (under construction or later, not cancelled) pulling on prices, ranked by the model's ${esc(String(BL.horizonLabel || "selected-horizon"))} outlook. Use the horizon selector to change the period.</div></div>
      ${rows.length ? rows.map((x, i) => `<div class="card click" data-act="open-d" data-id="${x.m.id}"><div class="row sb"><b>${i + 1}. ${esc(x.m.name)}</b><span class="up">${(x.m.cagr * 100).toFixed(1)}%/yr</span></div>
        <div class="small muted">${esc(x.m.state || "")} | ${fmtINR(Math.round(x.m.priceNow))}/sq ft today | ${x.m.mult.toFixed(2)}x</div>
        <div class="small">Triggers: ${x.inf.slice(0, 3).map((L) => esc(L.c.n) + (L.c.eta ? ` (${L.c.eta})` : "")).join("; ")}</div></div>`).join("") : '<div class="empty">No district within this budget has a confirmed project nearby. Raise the budget or pick another state.</div>'}`;
  }

  // ---------- 10-year outlook report ----------
  function report() {
    const c = ctx, fr = c.fr, w = window.open("", "_blank");
    if (!w) { toast("Allow pop-ups to open the report"); return; }
    const gov = c.gov ? Math.round(c.gov.p.govt_sqyd / 9) : null;
    const ev = (c.nearAll || []).filter((x) => x.p.price > 0).slice(0, 12);
    const srcList = ev.map((x) => `<tr><td>${esc(x.p.loc)}</td><td>${x.d.toFixed(1)} km</td><td>Rs ${Math.round(x.p.price).toLocaleString("en-IN")}</td><td>${esc(x.p.status || x.p.type || "")}</td><td>${esc(x.p.date || "")}</td><td>${x.p.src ? `<a href="${esc(x.p.src)}">source</a>` : ""}</td></tr>`).join("");
    const drivers = (c.con.parts || []).slice(0, 8).map((p) => `<tr><td>${esc(p.label || (p.c && p.c.n) || "")}</td><td>${p.c ? esc(p.c.status ? p.c.status.slice(0, 140) : "") : ""}</td><td>${(p.v * 100).toFixed(1)}%</td></tr>`).join("");
    const yrs = c.ser.filter ? c.ser.filter((r) => r.y >= BL.MODEL_YEAR && r.y <= BL.MODEL_YEAR + 10) : [];
    const path = yrs.map((r) => `<tr><td>${r.y}</td><td>Rs ${Math.round(r.lo).toLocaleString("en-IN")}</td><td>Rs ${Math.round(r.p).toLocaleString("en-IN")}</td><td>Rs ${Math.round(r.hi).toLocaleString("en-IN")}</td></tr>`).join("");
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Bhoomi Lens outlook - ${esc(c.place)}</title><style>body{font:14px/1.5 system-ui,sans-serif;max-width:860px;margin:30px auto;color:#111;padding:0 16px}h1{font-size:22px;margin:0}h2{font-size:16px;margin-top:22px;border-bottom:1px solid #ddd}table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid #eee;padding:4px 6px;text-align:left;font-size:13px}.k{display:inline-block;margin:6px 18px 6px 0}.k b{display:block;font-size:20px}.muted{color:#666}.no{margin-top:20px}@media print{.no{display:none}}</style></head><body>
      <button class="no" onclick="print()">Print / save as PDF</button>
      <h1>10-year land outlook: ${esc(c.place)}</h1><div class="muted">${esc(c.pm.district || "")}, ${esc(c.pm.state || "")} | ${c.lat.toFixed(4)}, ${c.lon.toFixed(4)} | generated ${today()} | data as of ${esc(BL.DATA_ASOF || "Oct 2026")}</div>
      <h2>Value today</h2><div class="k">Estimate<b>Rs ${Math.round(fr.mid).toLocaleString("en-IN")}/sq ft</b></div><div class="k">Fair range<b>Rs ${fr.lo.toLocaleString("en-IN")}-${fr.hi.toLocaleString("en-IN")}</b></div><div class="k">Confidence<b>${esc(c.conf)}</b></div>${gov ? `<div class="k">Official rate nearby<b>Rs ${gov.toLocaleString("en-IN")}/sq ft</b></div>` : ""}
      <h2>Price path (bear / base / bull band)</h2>${path ? `<table><tr><th>Year</th><th>Low</th><th>${esc(((BL.SCENARIOS || {})[c.scenario] || { label: "Base" }).label)} (selected)</th><th>High</th></tr>${path}</table>` : ""}<div class="muted">${esc(((BL.SCENARIOS || {})[c.scenario] || { label: "Base" }).label)} case ${(c.pm.cagr * 100).toFixed(1)}%/yr over ${c.horizon} years (${c.pm.mult.toFixed(2)}x).</div>
      <h2>What drives it</h2><table><tr><th>Driver</th><th>Status</th><th>Contribution</th></tr>${drivers}</table>
      <h2>Evidence used (within 12 km)</h2><table><tr><th>Place</th><th>Distance</th><th>Price used /sq ft</th><th>Type</th><th>Date</th><th>Link</th></tr>${srcList || "<tr><td colspan=6>No verified prices nearby; model only.</td></tr>"}</table>
      <h2>Method</h2><p>${esc(((G.BL_EVIDENCE || {}).method || {}).rule || "")} ${esc(((G.BL_EVIDENCE || {}).method || {}).discount || "")} ${esc(((G.BL_EVIDENCE || {}).method || {}).official || "")} Forecasts grow today's estimate by the state trend plus each infrastructure project's priced-in effect weighted by its completion odds.</p>
      <p class="muted">This is a statistical estimate from public listings and official rates, not a registered valuer's report, legal opinion or investment advice. Verify title, approvals and the live official rate before transacting.</p></body></html>`);
    w.document.close();
  }

  document.addEventListener("change", (e) => { if (e.target.id === "fpcUnit") document.getElementById("fpcArea").style.display = e.target.value === "total" ? "" : "none"; });
  document.addEventListener("click", (e) => {
    const a = e.target.closest("[data-ins]"); if (!a) return;
    const k = a.dataset.ins;
    if (k === "check") check(); else if (k === "share") share(); else if (k === "png") png(); else if (k === "wa") wa();
    else if (k === "gap") gap(); else if (k === "report") report(); else if (k === "watch") watch();
    else if (k === "unwatch") { const w = LS.get("bl_spots", []); w.splice(+a.dataset.i, 1); LS.set("bl_spots", w); BL.Insights.onChange && BL.Insights.onChange(); }
    else if (k === "sl") { LS.set("bl_sl", { budget: +document.getElementById("slBudget").value || 3000, state: document.getElementById("slState").value }); BL.Insights.onChange && BL.Insights.onChange(); }
  });
  BL.Insights = { block, fairRange, verdict, alertsPanel, shortlistPanel, report, _ctx: () => ctx };
})(typeof window !== "undefined" ? window : globalThis);
