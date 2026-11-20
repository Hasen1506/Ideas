/* Bhoomi Lens — Tamil Nadu Residential Plot Pilot UI controller.
 * Provides:
 *  1. Dedicated "TN Pilot: Quote Check" left-rail tool (3 tabs: Quote Check,
 *     CV Benchmark, Epistemic Audit) using real street-level official TN
 *     guideline registers + strict Tier 1 / Tier 2 / Tier 3 separation.
 *  2. Compact Pilot Underwriting summary card injected into Location cards
 *     inside Chengalpattu, Kancheepuram, and Tiruvallur.
 */
(function (root) {
  const BL = (root.BL = root.BL || {});

  const UNITS = {
    sqft: ["per sq ft", 1],
    sqyd: ["per sq yd", 9],
    cent: ["per cent", 435.6],
    ground: ["per ground", 2400],
    total: ["total price", 0]
  };

  const state = {
    tab: "quote",
    district: "Chengalpattu",
    villageKey: "",
    streetQuery: "",
    streetResults: [],
    streetStatus: "",
    selectedStreet: null,
    askValue: "",
    askUnit: "sqft",
    askArea: "",
    lastResult: null,
    apiAvailable: true,
    coverageMapOn: false
  };

  let streetAbort = null;
  let cachedPool = null;
  let boundCtx = null;

  function esc(s) {
    return BL.Charts ? BL.Charts.esc(s) : String(s == null ? "" : s).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
  }
  function fmtINR(v) {
    return BL.Charts ? BL.Charts.fmtINR(v) : "₹" + Math.round(v).toLocaleString("en-IN");
  }
  function safeUrl(u) {
    try {
      const parsed = new URL(String(u || ""));
      return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.href : "";
    } catch (_) {
      return "";
    }
  }

  function pilotData() {
    return root.BL_TN_PILOT || null;
  }

  function villagesForDistrict(district) {
    const pd = pilotData();
    if (!pd || !Array.isArray(pd.villages)) return [];
    return pd.villages.filter((v) => v.d === district);
  }

  function villageId(v) {
    return `${v.d}|${v.sro}|${v.v}`;
  }

  function currentVillage() {
    const list = villagesForDistrict(state.district);
    if (!list.length) return null;
    const hit = list.find((v) => villageId(v) === state.villageKey);
    if (hit) return hit;
    state.villageKey = villageId(list[0]);
    return list[0];
  }

  function nearestPilotVillage(lat, lon, maxKm = 5) {
    const pd = pilotData();
    const PE = BL.PilotEngine;
    if (!pd || !PE || !Array.isArray(pd.villages)) return null;
    let best = null;
    let bestD = Infinity;
    for (const v of pd.villages) {
      const d = PE.hav(lat, lon, v.lat, v.lon);
      if (d < bestD) {
        bestD = d;
        best = v;
      }
    }
    return best && bestD <= maxKm ? { village: best, distanceKm: bestD } : null;
  }

  function canonicalPool() {
    if (cachedPool) return cachedPool;
    const PE = BL.PilotEngine;
    if (!PE) return root.BL_VERIFIED || [];
    cachedPool = PE.collectPilotEvidencePool(
      root.BL_VERIFIED || [],
      root.BL_EVIDENCE,
      BL.Engine && BL.Engine.expandEvidence
    );
    return cachedPool;
  }

  function nearbyVerifiedFor(lat, lon, maxKm = 8) {
    const PE = BL.PilotEngine;
    return canonicalPool()
      .map((p, i) => ({ p, i, d: PE.hav(lat, lon, p.lat, p.lon) }))
      .filter((x) => Number.isFinite(x.d) && x.d <= maxKm)
      .sort((a, b) => a.d - b.d);
  }

  function computeAskSqft() {
    const v = Number(state.askValue);
    if (!Number.isFinite(v) || v <= 0) return null;
    if (state.askUnit === "total") {
      const a = Number(state.askArea);
      return Number.isFinite(a) && a > 0 ? v / a : null;
    }
    return v / UNITS[state.askUnit][1];
  }

  function runEvaluation(ctx) {
    const pd = pilotData();
    const PE = BL.PilotEngine;
    const v = currentVillage();
    if (!pd || !PE || !v) return null;
    const askSqft = computeAskSqft();
    if (!askSqft) {
      state.lastResult = { status: "invalid", reason: "Enter a positive asking price (and plot area if using total price)." };
      return state.lastResult;
    }

    const near = nearbyVerifiedFor(v.lat, v.lon, pd.gate.maxRadiusKm);
    const anchor = {
      median: v.med,
      p10: v.p10,
      p90: v.p90,
      streetCount: v.nSt,
      updated2025: v.u25,
      village: v.v,
      sro: v.sro,
      district: v.d,
      distanceKm: 0,
      streetRate: state.selectedStreet ? state.selectedStreet.rateSqft : null,
      streetName: state.selectedStreet ? state.selectedStreet.street : null
    };

    const res = PE.evaluateQuote({
      askSqft,
      guidelineAnchor: anchor,
      nearbyEntries: near,
      cvBenchmark: pd.cv,
      gate: pd.gate
    });

    const projects = (ctx && ctx.projects && ctx.projects()) || root.BL_PROJECTS || [];
    const catalysts = PE.nearbyCatalysts(v.lat, v.lon, projects, 15, 5);
    const checklist = PE.dueDiligenceChecklist(res);

    // Optional Tier 3 heuristic context (kept strictly separated from Tier 1/2)
    let heuristicSqft = null;
    if (ctx && ctx.pointPriceAt) {
      const pm = ctx.pointPriceAt(v.lat, v.lon);
      if (pm && Number.isFinite(pm.basePrice)) heuristicSqft = Math.round(pm.basePrice);
    }

    state.lastResult = { ...res, village: v, street: state.selectedStreet, heuristicSqft, catalysts, checklist };
    return state.lastResult;
  }

  async function searchStreets(district, query, villageTamil, onDone) {
    const q = String(query || "").trim();
    if (q.length < 2 && !villageTamil) {
      state.streetResults = [];
      state.streetStatus = "Type at least 2 characters to search official 2024/2025 residential streets.";
      onDone && onDone();
      return;
    }
    if (streetAbort) streetAbort.abort();
    const controller = new AbortController();
    streetAbort = controller;
    state.streetStatus = "Searching official street register…";
    onDone && onDone();

    try {
      const params = new URLSearchParams({ district, limit: "20" });
      if (q) params.set("q", q);
      if (villageTamil && !q) params.set("village", villageTamil);
      const r = await fetch("/api/pilot/streets?" + params.toString(), { signal: controller.signal });
      if (!r.ok) throw new Error("Street API unavailable");
      const data = await r.json();
      if (controller.signal.aborted) return;
      state.streetResults = Array.isArray(data.rows) ? data.rows : [];
      state.streetStatus = state.streetResults.length
        ? `${data.totalMatched.toLocaleString("en-IN")} residential streets matched in ${district} (showing ${state.streetResults.length}). Click one to lock exact statutory floor.`
        : `No residential street matched "${q}" in ${district}. Village median remains active.`;
    } catch (err) {
      if (controller.signal.aborted) return;
      state.apiAvailable = false;
      state.streetResults = [];
      state.streetStatus = "Live street search endpoint unavailable; using village-level 2024 residential P10/Median/P90 from static pilot data.";
    }
    onDone && onDone();
  }

  function renderCompRows(label, rows, badgeCls) {
    if (!rows || !rows.length) return "";
    return `
      <div class="small muted" style="margin:6px 0 3px;font-weight:600">${esc(label)} (${rows.length})</div>
      ${rows.slice(0, 6).map((r) => {
        const href = safeUrl(r.source);
        const dist = Number.isFinite(r.distance) ? `${r.distance.toFixed(1)} km` : "";
        return `<div class="pilot-comp-item">
          <div class="row sb" style="gap:6px">
            <span class="ellipsis" style="font-weight:600;color:var(--tx)">${esc(r.loc)}</span>
            <b style="white-space:nowrap">${fmtINR(r.value)}/sf</b>
          </div>
          <div class="row sb muted" style="font-size:10.5px;margin-top:2px">
            <span>${esc([dist, r.date, r.domain].filter(Boolean).join(" · "))}</span>
            ${href ? `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">Source ↗</a>` : `<span class="${badgeCls}">Recorded</span>`}
          </div>
        </div>`;
      }).join("")}
    `;
  }

  function renderResultHTML(res) {
    if (!res) return "";
    if (res.status === "invalid") {
      return `<div class="card small down" style="margin-top:8px">${esc(res.reason)}</div>`;
    }

    const v = res.village;
    const st = res.street;
    const isBench = res.status === "benchmarked";
    const statusClass = !isBench
      ? "tier-abstain"
      : res.position === "within_corridor"
        ? "tier-ok"
        : res.position === "below_floor"
          ? "tier-danger"
          : "tier-warn";

    const histRows = Object.entries(v.hist || {})
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .map(([yr, val]) => `<span class="tag">${esc(yr)}: ${fmtINR(val)}</span>`)
      .join("");

    const ss = res.evidence.strataSummary;
    const strataLine = (label, s) =>
      s
        ? `<div class="row sb small" style="align-items:flex-start;gap:8px;margin-top:3px"><span>${esc(label)} (${s.n})</span><span style="text-align:right;white-space:nowrap"><b>${s.min === s.max ? fmtINR(s.median) : `${fmtINR(s.min)}–${fmtINR(s.max)}`}</b>${s.min === s.max ? "" : ` <span class="muted">(med ${fmtINR(s.median)})</span>`}</span></div>`
        : `<div class="row sb small muted" style="margin-top:3px"><span>${esc(label)}</span><span>0 recorded</span></div>`;

    const tier2Block = isBench
      ? `<div class="card pilot-tier-card ${statusClass}">
          <div class="row sb"><span class="tier-badge t2">Tier 2 · Benchmarked Corridor</span><span class="small muted">OOF cov. ${res.benchmark.empiricalCoveragePct}%</span></div>
          <div style="font-weight:700;font-size:14px;margin-top:6px">${esc(res.positionLabel)}</div>
          <div class="kpis" style="margin-top:8px">
            <div class="kpi"><div class="k">Your quote</div><div class="v">${fmtINR(res.askSqft)}</div><div class="s">${res.ratioToFloor ? res.ratioToFloor + "× statutory floor" : ""}</div></div>
            <div class="kpi"><div class="k">Anchor-relative mid</div><div class="v">${fmtINR(res.benchmark.midSqft)}</div><div class="s">Floor × ${res.benchmark.localRatio}× ratio</div></div>
            <div class="kpi wide"><div class="k">${res.benchmark.nominalPct}% Split-Conformal Corridor (out-of-fold)</div><div class="v" style="font-size:16px">${fmtINR(res.benchmark.lowSqft)} – ${fmtINR(res.benchmark.highSqft)} <span class="small muted">/sq ft</span></div><div class="s">Pilot OOF MdAPE: ${res.benchmark.mdapePct}%. Wide interval reflects genuine micro-location &amp; approval variance.</div></div>
          </div>
        </div>`
      : `<div class="card pilot-tier-card tier-abstain">
          <div class="row sb"><span class="tier-badge t-abstain">Tier 2 · ABSTAIN</span><span class="small muted">Gate not met</span></div>
          <div style="font-weight:700;font-size:13.5px;margin-top:6px">Insufficient independent evidence for a benchmark verdict</div>
          <div class="small muted" style="margin-top:4px">Bhoomi Lens declines to extrapolate a price verdict here:</div>
          <ul class="small" style="margin:6px 0 4px 16px;padding:0;line-height:1.5">${res.reasons.map((r) => `<li>${esc(r)}</li>`).join("")}</ul>
          <div class="small muted">Use the Tier 1 official statutory floor (${res.floorSqft ? fmtINR(res.floorSqft) + "/sq ft" : "unavailable"}${res.ratioToFloor ? `, quote = ${res.ratioToFloor}× floor` : ""}) and verify directly on TNREGINET / SRO before transacting.</div>
        </div>`;

    const strata = res.evidence.strata || {};
    const compDrawer = res.evidence.independentCount
      ? `<details class="more" style="margin-top:8px"><summary>Inspect ${res.evidence.independentCount} nearby separated comparables</summary>
          ${renderCompRows("Reported sales / deals", strata.reported, "up")}
          ${renderCompRows("Public auctions / allotments", strata.auction, "up")}
          ${renderCompRows("Asking prices (raw, un-discounted)", strata.asking, "warn")}
        </details>`
      : "";

    const catalysts = res.catalysts || [];
    const catBlock = catalysts.length
      ? `<details class="more" style="margin-top:6px"><summary>Nearby recorded infrastructure (${catalysts.length} within 15 km)</summary>
          <div class="small muted" style="margin:4px 0">Factual proximity only — not a causal price uplift forecast.</div>
          ${catalysts.map((c) => `<div class="pilot-comp-item"><div class="row sb" style="gap:6px"><span class="ellipsis" style="font-weight:600;color:var(--tx)">${esc(c.name)}</span><span class="muted" style="white-space:nowrap">${c.distanceKm} km</span></div><div class="small muted">${esc(c.type)} · ${esc(c.status)}</div></div>`).join("")}
        </details>`
      : "";

    const checklist = res.checklist || [];
    const checklistBlock = checklist.length
      ? `<details class="more" style="margin-top:6px" ${res.belowStatutoryFloor || !isBench ? "open" : ""}><summary>Buyer statutory &amp; legal checklist (${checklist.length} items)</summary>
          ${checklist.map((it) => `<div class="pilot-check-item p-${esc(it.priority)}"><div style="font-weight:600;color:var(--tx)">${esc(it.title)}</div><div class="muted" style="margin-top:2px">${esc(it.detail)}</div></div>`).join("")}
        </details>`
      : "";

    return `
      ${tier2Block}
      <div class="card pilot-tier-card">
        <div class="row sb"><span class="tier-badge t1">Tier 1 · Observed Primary Evidence</span><span class="small muted">${esc(v.d)}</span></div>
        <div class="row sb small" style="margin-top:8px"><span class="muted">${st ? "Selected official street floor" : "Village residential median (2024)"}</span><b>${fmtINR(res.floorSqft)} / sq ft</b></div>
        ${st ? `<div class="small muted">${esc(st.street)} · ${esc(st.className)} · orig ${st.rawRate} ${esc(st.unit)}${st.effectiveFrom ? " · eff. " + esc(st.effectiveFrom) : ""}</div>` : ""}
        ${v.p10 && v.p90 ? `<div class="row sb small" style="margin-top:4px"><span class="muted">Village residential street spread (${v.nSt} streets)</span><b>${fmtINR(v.p10)} – ${fmtINR(v.p90)}</b></div>` : ""}
        ${v.u25 ? `<div class="small up" style="margin-top:3px">${v.u25} residential street${v.u25 === 1 ? "" : "s"} received mid-cycle 2025 guideline updates</div>` : ""}
        ${v.g17 != null ? `<div class="row sb small" style="margin-top:4px"><span class="muted">Official revision change (2017 → 2024)</span><b>${v.g17 >= 0 ? "+" : ""}${v.g17}%</b></div>` : ""}
        ${histRows ? `<div class="row" style="flex-wrap:wrap;gap:4px;margin-top:6px">${histRows}</div>` : ""}
        <div style="border-top:1px solid var(--line);margin-top:8px;padding-top:8px">
          <div class="small muted" style="margin-bottom:4px">Separated nearby non-proxy evidence within 8 km (${res.evidence.independentCount} independent · ${res.evidence.distinctDomainCount} distinct domains · ${res.evidence.droppedDuplicates} duplicates removed):</div>
          ${strataLine("Reported sales / deals", ss.reported)}
          ${strataLine("Public auctions / allotments", ss.auction)}
          ${strataLine("Asking prices (raw, un-discounted)", ss.asking)}
          <div class="small muted" style="margin-top:4px">Excluded from Tier 2 gate: ${ss.proxyCount} guideline-derived proxies, ${ss.compensationCount} acquisition compensation rows.</div>
        </div>
        ${compDrawer}
        ${catBlock}
        <div class="btn-row" style="margin-top:8px;flex-wrap:nowrap">
          <button class="btn sm" style="flex:1;white-space:nowrap" data-act="open-loc" data-lon="${v.lon}" data-lat="${v.lat}">Map spot</button>
          <a class="btn sm" style="flex:1;text-align:center;white-space:nowrap" href="https://tnreginet.gov.in/portal/" target="_blank" rel="noopener noreferrer">TNREGINET</a>
          <a class="btn sm" style="flex:1;text-align:center;white-space:nowrap" href="https://tngis.tn.gov.in/apps/gi_viewer/" target="_blank" rel="noopener noreferrer">Tamil Nilam</a>
        </div>
        <div class="btn-row" style="margin-top:6px;flex-wrap:nowrap">
          <button class="btn sm" style="flex:1;white-space:nowrap" data-pilot="copy-memo">Copy brief (MD)</button>
          <button class="btn sm" style="flex:1;white-space:nowrap" data-pilot="download-json">Export JSON</button>
        </div>
      </div>
      ${checklistBlock}
      ${res.heuristicSqft ? `<details class="more" style="margin-top:6px"><summary><span class="tier-badge t3">Tier 3 · Heuristic Context</span> Existing formula estimate (${fmtINR(res.heuristicSqft)}/sq ft)</summary><div class="small muted" style="margin-top:6px;line-height:1.5">The nationwide gravity + kernel heuristic (<code>js/engine.js</code>) outputs <b>${fmtINR(res.heuristicSqft)}/sq ft</b> here. It is kept strictly separate from Tier 1/2 evidence because its spatially blocked P90 tail error is 286.3% on pilot data and it incorporates low-weight guideline proxies.</div></details>` : ""}
    `;
  }

  function renderQuoteTab(pd) {
    const list = villagesForDistrict(state.district);
    const v = currentVillage();
    const benchmarkable = list.filter((x) => x.gate).length;
    const abstained = list.length - benchmarkable;

    return `
      <p class="lead">Evaluate a residential plot quote in 3 Tamil Nadu pilot districts using raw street-level official guideline registers, separated non-proxy evidence, and strict abstention gates.</p>
      <div class="row sb" style="margin-bottom:8px;gap:6px">
        <button class="btn sm ${state.coverageMapOn ? "primary" : ""}" style="flex:1;white-space:nowrap" data-pilot="toggle-coverage">${state.coverageMapOn ? "Hide coverage map" : "Show coverage map (778 villages)"}</button>
      </div>
      ${state.coverageMapOn ? `<div class="pilot-cov-legend small muted"><span class="cov-dot pass"></span>Tier 2 Benchmarked (${pd.totals.benchmarkableVillages}) &nbsp; <span class="cov-dot abs"></span>Tier 1 Only / Abstain (${pd.totals.abstainedVillages}) — click any dot on map</div>` : ""}
      <div class="field">
        <label><span>Pilot district</span><span>${benchmarkable} benchmarked · ${abstained} abstain</span></label>
        <select id="pilotDist">${BL.PilotEngine.PILOT_DISTRICTS.map((d) => `<option value="${esc(d)}" ${d === state.district ? "selected" : ""}>${esc(d)}</option>`).join("")}</select>
      </div>
      <div class="field">
        <label><span>Revenue village / SRO</span><span>${v ? (v.gate ? "Gate PASS" : "ABSTAIN zone") : ""}</span></label>
        <select id="pilotVillage">${list.map((x) => `<option value="${esc(villageId(x))}" ${v && villageId(x) === villageId(v) ? "selected" : ""}>${esc(x.v)} (${x.nSt} sts · ${fmtINR(x.med)}/sf · ${x.gate ? "Benchmarked" : "Abstain"})</option>`).join("")}</select>
      </div>
      <div class="card small" style="padding:10px">
        <div class="row sb"><b>Optional: lock exact official street floor</b>${state.selectedStreet ? `<button class="btn sm ghost" data-pilot="clear-street">Clear</button>` : ""}</div>
        <div class="small muted" style="margin:2px 0 6px">Search ${pd.totals.residentialStreets2024.toLocaleString("en-IN")} raw 2024/2025 residential streets in the 3 pilot districts.</div>
        <div class="row" style="gap:6px">
          <input id="pilotStreetQ" type="text" placeholder="e.g. OMR, Dollars Colony, Main Road..." value="${esc(state.streetQuery)}" style="flex:1;min-width:0;background:rgba(255,255,255,0.04);border:1px solid var(--line);border-radius:8px;padding:6px 8px"/>
          <button class="btn sm" data-pilot="search-street">Search</button>
          <button class="btn sm" data-pilot="village-streets" title="List streets in selected village">In village</button>
        </div>
        ${state.selectedStreet ? `<div class="small up" style="margin-top:6px">Locked street: <b>${esc(state.selectedStreet.street)}</b> — ${fmtINR(state.selectedStreet.rateSqft)}/sq ft (${esc(state.selectedStreet.sro)})</div>` : ""}
        ${state.streetStatus ? `<div class="small muted" style="margin-top:5px">${esc(state.streetStatus)}</div>` : ""}
        ${state.streetResults.length ? `<div class="pilot-street-list">${state.streetResults.map((s, idx) => `<button type="button" class="pilot-street-row" data-pilot="pick-street" data-idx="${idx}"><span class="grow ellipsis"><b>${esc(s.street)}</b><br/><span class="muted">${esc(s.village)} · ${esc(s.sro)}${s.effectiveFrom ? " · eff. " + esc(s.effectiveFrom) : ""}</span></span><span class="pill s">${fmtINR(s.rateSqft)}</span></button>`).join("")}</div>` : ""}
      </div>
      <div class="card" style="padding:10px">
        <div class="field" style="margin-bottom:6px">
          <label><span>Asking price</span><span>Residential plot</span></label>
          <div class="row" style="gap:6px">
            <input id="pilotAsk" type="number" min="1" placeholder="e.g. 4200" value="${esc(state.askValue)}" style="flex:1;min-width:0"/>
            <select id="pilotUnit" style="width:118px">${Object.entries(UNITS).map(([k, u]) => `<option value="${k}" ${k === state.askUnit ? "selected" : ""}>${esc(u[0])}</option>`).join("")}</select>
          </div>
        </div>
        ${state.askUnit === "total" ? `<div class="field" style="margin-bottom:8px"><label><span>Plot area (sq ft)</span></label><input id="pilotArea" type="number" min="1" placeholder="e.g. 1200" value="${esc(state.askArea)}"/></div>` : ""}
        <div class="btn-row" style="margin-bottom:6px">
          <button class="btn primary" style="width:100%;white-space:nowrap" data-pilot="evaluate">Evaluate quote</button>
        </div>
        <div class="btn-row">
          <button class="btn sm" style="flex:1;white-space:nowrap" data-pilot="sample-bench" title="Load a sample quote in a benchmarked village">Sample pass</button>
          <button class="btn sm" style="flex:1;white-space:nowrap" data-pilot="sample-abstain" title="Load a sample quote in a sparse village to test abstention">Sample abstain</button>
        </div>
      </div>
      <div id="pilotResult">${renderResultHTML(state.lastResult)}</div>
    `;
  }

  function renderCVTab(pd) {
    const cv = pd.cv;
    const t = pd.totals;
    if (!cv || !cv.ok) return `<div class="empty">Pilot CV benchmark unavailable.</div>`;
    return `
      <p class="lead">Spatially blocked leave-one-locality-cluster-out CV across <b>${cv.observations}</b> deduplicated non-proxy residential observations in <b>${cv.clusters}</b> clusters (~3 km blocks).</p>
      <div class="card pilot-tier-card tier-warn">
        <div class="tier-badge t2">Go / No-Go Verdict</div>
        <div style="font-weight:700;margin-top:6px">NO-GO on raw coordinate ML · GO on Anchor-Relative Triangulation</div>
        <div class="small muted" style="margin-top:4px;line-height:1.5">With 0 verified TN registered sales in the repository, a 4-feature coordinate GBDT is premature. Anchoring directly on official street-level guideline values cuts P90 tail error by <b>58%</b> vs. the existing heuristic while exposing true micro-location spread honestly.</div>
      </div>
      <h3>Out-of-fold spatial benchmark</h3>
      <div class="card" style="padding:8px">
        <table class="cmp">
          <tr><th>Method</th><th>MdAPE</th><th>P90 APE</th><th>≤25%</th></tr>
          <tr><td>Naive district median</td><td>${cv.naiveDistrictMedian.mdapePct}%</td><td>${cv.naiveDistrictMedian.p90ApePct}%</td><td>${cv.naiveDistrictMedian.within25Pct}%</td></tr>
          <tr><td>Existing engine.js</td><td>${cv.existingHeuristic ? cv.existingHeuristic.mdapePct + "%" : "-"}</td><td class="down">${cv.existingHeuristic ? cv.existingHeuristic.p90ApePct + "%" : "-"}</td><td>${cv.existingHeuristic ? cv.existingHeuristic.within25Pct + "%" : "-"}</td></tr>
          <tr><td><b>Anchor-relative (GV×ratio)</b></td><td class="best">${cv.anchorRelativeBaseline.mdapePct}%</td><td class="best">${cv.anchorRelativeBaseline.p90ApePct}%</td><td class="best">${cv.anchorRelativeBaseline.within25Pct}%</td></tr>
        </table>
      </div>
      <h3>Split-conformal interval calibration</h3>
      <div class="kpis">
        <div class="kpi"><div class="k">OOF Coverage (80% nom.)</div><div class="v up">${cv.conformalEmpiricalCoveragePct}%</div><div class="s">Log radius ±${cv.conformalLogRadius}</div></div>
        <div class="kpi"><div class="k">Median interval width</div><div class="v warn">${cv.conformalMedianWidthPct}%</div><div class="s">Shows true unmeasured plot variance</div></div>
      </div>
      <h3>Pilot coverage &amp; abstention gate</h3>
      <div class="card small" style="line-height:1.6">
        <div class="row sb"><span>Raw 2024 residential streets indexed</span><b>${t.residentialStreets2024.toLocaleString("en-IN")}</b></div>
        <div class="row sb"><span>Mid-cycle 2025 street updates</span><b>${t.midCycle2025Updates.toLocaleString("en-IN")}</b></div>
        <div class="row sb"><span>Matched geocoded pilot villages</span><b>${t.matchedGeocodedVillages}</b></div>
        <div class="row sb"><span>Pass Tier 2 gate (≥3 obs, ≥2 domains)</span><b class="up">${t.benchmarkableVillages} (${Math.round((t.benchmarkableVillages / t.matchedGeocodedVillages) * 100)}%)</b></div>
        <div class="row sb"><span>Explicitly ABSTAIN on Tier 2</span><b class="warn">${t.abstainedVillages} (${Math.round((t.abstainedVillages / t.matchedGeocodedVillages) * 100)}%)</b></div>
      </div>
      <h3>Market-to-GV ratio by pilot district</h3>
      <div class="card" style="padding:8px">
        <table class="cmp">
          <tr><th>District</th><th>n</th><th>P25</th><th>Med</th><th>P75</th></tr>
          ${Object.entries(cv.byDistrict || {}).map(([d, s]) => `<tr><td>${esc(d)}</td><td>${s.n}</td><td>${s.p25Ratio}×</td><td class="best">${s.medianRatio}×</td><td>${s.p75Ratio}×</td></tr>`).join("")}
        </table>
      </div>
    `;
  }

  function renderAuditTab() {
    const rows = BL.PilotEngine.EPISTEMIC_AUDIT;
    return `
      <p class="lead">Every output in Bhoomi Lens is assigned to one of three epistemic tiers so observed primary evidence, benchmarked models, and assumption-driven scenarios are never conflated.</p>
      ${rows.map((r) => `
        <div class="card small" style="line-height:1.5">
          <div class="row sb" style="margin-bottom:4px">
            <span class="tier-badge ${r.tier === 1 ? "t1" : r.tier === 2 ? "t2" : "t3"}">${esc(r.tierLabel)}</span>
            <span class="muted">${esc(r.status)}</span>
          </div>
          <div style="font-weight:600;color:var(--tx)">${esc(r.feature)}</div>
          <div class="muted" style="font-family:var(--mono);font-size:10.5px;margin:2px 0">${esc(r.module)}</div>
          <div class="muted">${esc(r.action)}</div>
        </div>
      `).join("")}
      <h3>External proof harnesses &amp; downloads</h3>
      <div class="card small muted" style="line-height:1.55">
        <p style="margin:0 0 6px">1. <b>Blind e-auction clearing test:</b> Ready via <code>scripts/pilot_blind_auction_eval.js</code> (requires ≥20 unseen TNHB / CMDA / SIPCOT / IBAPI outcomes).</p>
        <p style="margin:0 0 6px">2. <b>50-record portal provenance audit:</b> Deterministic stratified sheet generated from raw registers; score via <code>--score &lt;csv&gt;</code> after TNREGINET / Tamil Nilam verification.</p>
        <p style="margin:0 0 8px">3. <b>10-quote corridor decision test:</b> Automated CI gate verified (10/10 briefs enforce Tier 1/2/3 separation &amp; abstention).</p>
        <div class="btn-row" style="flex-wrap:nowrap">
          <a class="btn sm" style="flex:1;text-align:center;white-space:nowrap" href="/api/pilot/audit-sample.csv" download="tn_pilot_audit_50.csv">50-Record Audit CSV</a>
          <a class="btn sm" style="flex:1;text-align:center;white-space:nowrap" href="/api/pilot/blind-template.csv" download="tn_pilot_blind_auctions_template.csv">Blind Auction CSV</a>
        </div>
      </div>
    `;
  }

  function renderPanel() {
    const pd = pilotData();
    if (!pd || !BL.PilotEngine) {
      return `<div class="empty">Tamil Nadu pilot dataset not loaded. Run <code>node bhoomi-lens/scripts/build_tn_pilot.js</code>.</div>`;
    }
    const tabs = `
      <div class="tabs" role="tablist" aria-label="TN Pilot views">
        <button class="${state.tab === "quote" ? "on" : ""}" data-pilot="tab" data-tab="quote">Quote Check</button>
        <button class="${state.tab === "cv" ? "on" : ""}" data-pilot="tab" data-tab="cv">CV Benchmark</button>
        <button class="${state.tab === "audit" ? "on" : ""}" data-pilot="tab" data-tab="audit">Epistemic Audit</button>
      </div>`;
    const body = state.tab === "quote" ? renderQuoteTab(pd) : state.tab === "cv" ? renderCVTab(pd) : renderAuditTab();
    return tabs + body;
  }

  /* Compact Tier 1/2 summary card rendered inside openLocation() for pilot districts */
  function locationCardHTML(lat, lon, district) {
    const pd = pilotData();
    const PE = BL.PilotEngine;
    if (!pd || !PE || !PE.isPilotDistrict(district)) return "";
    const match = nearestPilotVillage(lat, lon, 5);
    const near = nearbyVerifiedFor(lat, lon, pd.gate.maxRadiusKm);
    const strat = PE.stratifyEvidence(near);
    const passes =
      Boolean(match) &&
      strat.independentCount >= pd.gate.minIndependentObs &&
      strat.distinctDomainCount >= pd.gate.minDistinctDomains;

    return `
      <h3>TN Residential Plot Pilot <span class="tier-badge ${passes ? "t2" : "t-abstain"}" style="margin-left:6px">${passes ? "Tier 2 Active" : "Tier 2 Abstain"}</span></h3>
      <div class="card small pilot-tier-card ${passes ? "tier-ok" : "tier-abstain"}" style="line-height:1.55">
        ${match ? `
          <div class="row sb"><span class="muted">Nearest official residential register</span><b>${esc(match.village.v)} (${match.distanceKm.toFixed(1)} km)</b></div>
          <div class="row sb"><span class="muted">2024 residential median (${match.village.nSt} streets)</span><b>${fmtINR(match.village.med)} / sq ft</b></div>
          ${match.village.p10 && match.village.p90 ? `<div class="row sb"><span class="muted">Street spread (P10–P90)</span><b>${fmtINR(match.village.p10)}–${fmtINR(match.village.p90)} / sq ft</b></div>` : ""}
          ${match.village.u25 ? `<div class="up">${match.village.u25} streets updated mid-cycle in 2025</div>` : ""}
        ` : `<div class="warn">No matched official residential street register within 5 km.</div>`}
        <div class="row sb" style="margin-top:4px"><span class="muted">Deduplicated non-proxy obs (8 km)</span><b>${strat.independentCount} (${strat.distinctDomainCount} domains)</b></div>
        <div class="muted" style="margin-top:4px">${passes ? "Coverage gate passed: anchor-relative quote corridor is available." : "Coverage gate not met: Tier 2 benchmark abstains here; rely on Tier 1 official rates and verify at SRO."}</div>
        <div class="btn-row" style="margin-top:8px">
          <button class="btn sm primary" data-pilot="open-for-loc" data-dist="${esc(PE.normalizeDistrict(district))}" data-vkey="${match ? esc(villageId(match.village)) : ""}">Run Pilot Quote Check</button>
        </div>
      </div>`;
  }

  function selectVillageFromMap(district, vkey) {
    state.tab = "quote";
    if (district) state.district = district;
    if (vkey) state.villageKey = vkey;
    state.selectedStreet = null;
    state.streetResults = [];
    state.streetStatus = "";
    const v = currentVillage();
    if (v) {
      state.askUnit = "sqft";
      if (!state.askValue) state.askValue = String(Math.round(v.med * 2.8));
      runEvaluation(boundCtx);
    }
    if (boundCtx && boundCtx.openPilotTool) boundCtx.openPilotTool();
  }

  function copyText(text, toast) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        () => toast && toast("Underwriting brief copied to clipboard"),
        () => fallbackCopy(text, toast)
      );
    } else {
      fallbackCopy(text, toast);
    }
  }

  function fallbackCopy(text, toast) {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
      toast && toast("Underwriting brief copied to clipboard");
    } catch (_) {
      toast && toast("Could not copy automatically — use Export JSON");
    }
    ta.remove();
  }

  function downloadFile(filename, content, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function bind(ctx) {
    boundCtx = ctx;
    const refresh = () => ctx.refreshPanel && ctx.refreshPanel();
    document.addEventListener("change", (e) => {
      const t = e.target;
      if (t.id === "pilotDist") {
        state.district = t.value;
        state.villageKey = "";
        state.selectedStreet = null;
        state.streetResults = [];
        state.streetStatus = "";
        state.lastResult = null;
        refresh();
      } else if (t.id === "pilotVillage") {
        state.villageKey = t.value;
        state.selectedStreet = null;
        state.streetResults = [];
        state.streetStatus = "";
        state.lastResult = null;
        const v = currentVillage();
        if (v && ctx.flyTo) ctx.flyTo(v.lon, v.lat, 12.5);
        refresh();
      } else if (t.id === "pilotUnit") {
        state.askUnit = t.value;
        refresh();
      }
    });
    document.addEventListener("input", (e) => {
      const t = e.target;
      if (t.id === "pilotAsk") state.askValue = t.value;
      else if (t.id === "pilotArea") state.askArea = t.value;
      else if (t.id === "pilotStreetQ") state.streetQuery = t.value;
    });
    document.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-pilot]");
      if (!btn) return;
      const act = btn.dataset.pilot;
      if (act === "tab") {
        state.tab = btn.dataset.tab;
        refresh();
      } else if (act === "toggle-coverage") {
        state.coverageMapOn = !state.coverageMapOn;
        ctx.togglePilotCoverage && ctx.togglePilotCoverage(state.coverageMapOn);
        if (state.coverageMapOn && ctx.flyTo) ctx.flyTo(80.05, 12.92, 9.6);
        refresh();
      } else if (act === "evaluate") {
        const res = runEvaluation(ctx);
        if (res && res.village && ctx.flyTo) ctx.flyTo(res.village.lon, res.village.lat, 12.8);
        refresh();
      } else if (act === "sample-bench") {
        const list = villagesForDistrict(state.district);
        const target = list.find((x) => x.gate) || list[0];
        if (target) {
          state.villageKey = villageId(target);
          state.selectedStreet = null;
          state.askUnit = "sqft";
          state.askValue = String(Math.round(target.med * 2.8));
          const res = runEvaluation(ctx);
          if (res && res.village && ctx.flyTo) ctx.flyTo(res.village.lon, res.village.lat, 12.8);
          refresh();
        }
      } else if (act === "sample-abstain") {
        const list = villagesForDistrict(state.district);
        const target = list.find((x) => !x.gate) || list[list.length - 1];
        if (target) {
          state.villageKey = villageId(target);
          state.selectedStreet = null;
          state.askUnit = "sqft";
          state.askValue = String(Math.round(target.med * 2.5));
          const res = runEvaluation(ctx);
          if (res && res.village && ctx.flyTo) ctx.flyTo(res.village.lon, res.village.lat, 12.5);
          refresh();
        }
      } else if (act === "search-street") {
        const v = currentVillage();
        searchStreets(state.district, state.streetQuery, v ? v.ta : "", refresh);
      } else if (act === "village-streets") {
        const v = currentVillage();
        state.streetQuery = "";
        searchStreets(state.district, "", v ? v.ta : "", refresh);
      } else if (act === "pick-street") {
        const s = state.streetResults[Number(btn.dataset.idx)];
        if (s) {
          state.selectedStreet = s;
          state.streetResults = [];
          state.streetStatus = "";
          if (state.askValue) runEvaluation(ctx);
          refresh();
        }
      } else if (act === "clear-street") {
        state.selectedStreet = null;
        if (state.askValue) runEvaluation(ctx);
        refresh();
      } else if (act === "copy-memo") {
        if (state.lastResult && BL.PilotEngine) {
          const md = BL.PilotEngine.formatUnderwritingMemoMarkdown(state.lastResult, {
            village: state.lastResult.village,
            street: state.lastResult.street,
            catalysts: state.lastResult.catalysts,
            heuristicSqft: state.lastResult.heuristicSqft
          });
          copyText(md, ctx.toast);
        }
      } else if (act === "download-json") {
        if (state.lastResult) {
          const v = state.lastResult.village || {};
          const slug = String(v.v || "quote").toLowerCase().replace(/[^a-z0-9]+/g, "-");
          downloadFile(
            `bhoomi-lens-tn-pilot-${slug}.json`,
            JSON.stringify(state.lastResult, null, 2),
            "application/json;charset=utf-8"
          );
          ctx.toast && ctx.toast("Downloaded underwriting brief JSON");
        }
      } else if (act === "open-for-loc") {
        state.tab = "quote";
        if (btn.dataset.dist) state.district = btn.dataset.dist;
        if (btn.dataset.vkey) state.villageKey = btn.dataset.vkey;
        state.selectedStreet = null;
        state.lastResult = null;
        ctx.openPilotTool && ctx.openPilotTool();
      }
    });
  }

  BL.PilotUI = { renderPanel, locationCardHTML, selectVillageFromMap, bind, _state: () => state };
})(typeof window !== "undefined" ? window : globalThis);
