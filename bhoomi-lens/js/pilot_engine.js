/* Bhoomi Lens — Tamil Nadu Residential Plot Underwriting & Residual ML Engine
 * Pure functions, zero DOM dependencies. Works in browser (window.BL.PilotEngine)
 * and Node (globalThis.BL.PilotEngine).
 *
 * Design principles:
 *  1. Strict epistemic separation: Tier 1 (Observed primary evidence),
 *     Tier 2 (Empirically benchmarked anchor-relative / residual ML estimate with abstention),
 *     Tier 3 (Assumption-driven scenario / heuristic context).
 *  2. Never pool listings, auctions/allotments, official guideline values,
 *     compensation, guideline-derived proxies, or registered sales into one target.
 *  3. Deduplicate repeated/syndicated source URLs before counting evidence density.
 *  4. Abstain explicitly whenever local independent evidence or guideline anchor
 *     coverage falls below threshold — never extrapolate silently.
 *  5. Every ML model is evaluated strictly inside spatially blocked leave-one-cluster-out
 *     CV with fold-internal standardization and honest promotion gating.
 */
(function (root) {
  const BL = (root.BL = root.BL || {});
  const R_EARTH = 6371;
  const SQFT_PER_M2 = 10.7639104167;
  const SQFT_PER_ACRE = 43560;
  const SQFT_PER_HECTARE = 107639;

  // Original 3-district Greater Chennai pilot (retained for backward compatibility)
  const PILOT_DISTRICTS = ["Chengalpattu", "Kancheepuram", "Tiruvallur"];

  // All 38 Tamil Nadu districts covered by official TNREGINET street registers
  const TN_DISTRICTS = [
    "Ariyalur", "Chengalpattu", "Chennai", "Coimbatore", "Cuddalore",
    "Dharmapuri", "Dindigul", "Erode", "Kallakurichi", "Kancheepuram",
    "Kanniyakumari", "Karur", "Krishnagiri", "Madurai", "Mayiladuthurai",
    "Nagapattinam", "Namakkal", "Nilgiris", "Perambalur", "Pudukkottai",
    "Ramanathapuram", "Ranipet", "Salem", "Sivagangai", "Tenkasi",
    "Thanjavur", "Theni", "Thoothukkudi", "Tiruchirappalli", "Tirunelveli",
    "Tirupathur", "Tiruppur", "Tiruvallur", "Tiruvannamalai", "Tiruvarur",
    "Vellore", "Viluppuram", "Virudhunagar"
  ];

  const DISTRICT_ALIASES = {
    chengalpattu: "Chengalpattu",
    chengleput: "Chengalpattu",
    kancheepuram: "Kancheepuram",
    kanchipuram: "Kancheepuram",
    tiruvallur: "Tiruvallur",
    thiruvallur: "Tiruvallur",
    viluppuram: "Viluppuram",
    villupuram: "Viluppuram",
    kanniyakumari: "Kanniyakumari",
    kanyakumari: "Kanniyakumari",
    thoothukkudi: "Thoothukkudi",
    thoothukudi: "Thoothukkudi",
    tuticorin: "Thoothukkudi",
    sivagangai: "Sivagangai",
    sivaganga: "Sivagangai",
    trichy: "Tiruchirappalli",
    tiruchirappalli: "Tiruchirappalli",
    "the nilgiris": "Nilgiris",
    nilgiris: "Nilgiris",
    thiruvarur: "Tiruvarur",
    tiruvarur: "Tiruvarur",
    tirupathur: "Tirupathur",
    tirupattur: "Tirupathur",
    tiruppur: "Tiruppur",
    tirupur: "Tiruppur"
  };

  const DEFAULT_GATE = {
    maxRadiusKm: 8,
    minIndependentObs: 3,
    minDistinctDomains: 2,
    minGuidelineAnchorKm: 5
  };

  const ML_FEATURE_META = [
    { key: "log_gv_2024", label: "Official 2024 GV level (log ₹/sf)", group: "Official GV" },
    { key: "gv_iqr_log", label: "Intra-village street spread (log P90/P10)", group: "Official GV" },
    { key: "log_streets", label: "Urban street density (log streets)", group: "Official GV" },
    { key: "gv_growth_17_24", label: "7-yr official GV revision (2017→2024)", group: "Official GV" },
    { key: "gv_growth_12_24", label: "12-yr official GV trajectory (2012→2024)", group: "Official GV" },
    { key: "pct_updated_2025", label: "2025 mid-cycle street revision share", group: "Official GV" },
    { key: "log_dist_chennai", label: "Distance to Chennai CBD (log km)", group: "Spatial" },
    { key: "log_dist_hub", label: "Distance to nearest TN metro hub (log km)", group: "Spatial" },
    { key: "log_dist_metro", label: "Distance to Metro corridor (log km)", group: "Infra" },
    { key: "log_dist_airport", label: "Distance to airport hub (log km)", group: "Infra" },
    { key: "log_dist_highway", label: "Distance to expressway / ring road (log km)", group: "Infra" },
    { key: "log_dist_industrial", label: "Distance to industrial / IT park (log km)", group: "Infra" },
    { key: "log_dist_coast", label: "Distance to coastline (log km)", group: "Spatial" },
    { key: "district_cpi", label: "Official TN District CPI index", group: "Macro" }
  ];

  const EPISTEMIC_AUDIT = [
    {
      feature: "Statewide street-level TN official guideline registers (38 districts · 233,898 residential streets)",
      module: "data/tn_gv/*.json · server.js · pilot_engine.js",
      tier: 1,
      tierLabel: "Tier 1 · Observed primary",
      status: "Active across all 38 districts",
      action: "Use directly as statutory floor, P10/Median/P90 village distribution, 2002–2024 revision trajectory, and 2025 mid-cycle surge scanner."
    },
    {
      feature: "Public govt allotments, e-auctions, reported deals & deduplicated nearby comparables",
      module: "js/comparables.js · pilot_engine.js",
      tier: 1,
      tierLabel: "Tier 1 · Observed primary",
      status: "Stratified & URL-deduplicated",
      action: "Display separately by source stratum with dates, units, and source links; never pool asking quotes with closed sales or single-source rows."
    },
    {
      feature: "Statutory TN closing cost, Section 47A & TDS Form 26QB calculator",
      module: "js/pilot_engine.js · js/deal_desk.js",
      tier: 1,
      tierLabel: "Tier 1 · Statutory rule",
      status: "Active in Deal Desk",
      action: "Apply statutory Tamil Nadu Stamp Duty (7% on max of declared vs guideline floor), Registration Fee (4% / 3% women ≤₹10L), and 1% TDS ≥₹50L."
    },
    {
      feature: "Official land-record links, airport zones, acquisition notices & dated satellite scenes",
      module: "js/imagery.js · js/infra.js",
      tier: 1,
      tierLabel: "Tier 1 · Observed primary",
      status: "Retained with precision caveats",
      action: "Keep linked to official portals (TNREGINET, Tamil Nilam, Planetary Computer STAC); label resolution limits explicitly."
    },
    {
      feature: "Anchor-relative & 14-Feature Spatial Residual Ridge corridor + split-conformal band",
      module: "js/pilot_engine.js · scripts/build_tn_pilot.js",
      tier: 2,
      tierLabel: "Tier 2 · Benchmarked estimate",
      status: "Gated by spatial CV & abstention",
      action: "Show only when ≥3 independent non-proxy observations from ≥2 distinct domains + guideline anchor exist within radius; otherwise ABSTAIN."
    },
    {
      feature: "Experimental registered-sale GBDT (lat, lon, log_area, date)",
      module: "scripts/market_model.py",
      tier: 2,
      tierLabel: "Tier 2 · Blocked (No-Go today)",
      status: "Awaiting licensed TN deed panel",
      action: "Do not deploy raw coordinate GBDT without licensed registered sale deeds + plot road-width/approval attributes; target log(P / GV_street)."
    },
    {
      feature: "Continuous 820-district price surface & 2015–2036 fan-chart forecast",
      module: "js/engine.js",
      tier: 3,
      tierLabel: "Tier 3 · Heuristic scenario",
      status: "Demoted to scenario context",
      action: "Keep clearly labelled as unvalidated heuristic exploration; exclude from Deal Desk quote verdicts."
    },
    {
      feature: "Post-tax Net IRR & appreciation break-even simulator + Ripple sandbox",
      module: "js/pilot_engine.js · js/engine.js",
      tier: 3,
      tierLabel: "Tier 3 · Assumption sandbox",
      status: "User-parameterized scenario",
      action: "Keep strictly user-parameterized sensitivity math; never claim guaranteed future appreciation or causal infrastructure uplift."
    }
  ];

  function normalizeDistrict(name) {
    const raw = String(name || "").trim();
    if (!raw) return "";
    return DISTRICT_ALIASES[raw.toLowerCase()] || raw;
  }

  function isPilotDistrict(name) {
    return PILOT_DISTRICTS.includes(normalizeDistrict(name));
  }

  function isTNDistrict(name) {
    return TN_DISTRICTS.includes(normalizeDistrict(name));
  }

  function hav(lat1, lon1, lat2, lon2) {
    const rad = Math.PI / 180;
    const dLat = (lat2 - lat1) * rad;
    const dLon = (lon2 - lon1) * rad;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
    return 2 * R_EARTH * Math.asin(Math.min(1, Math.max(0, Math.sqrt(a))));
  }

  function toSqftRate(value, unit) {
    const v = Number(value);
    if (!Number.isFinite(v) || v <= 0) return null;
    if (unit === "ft2" || unit === "sqft") return v;
    if (unit === "m2" || unit === "sqm") return v / SQFT_PER_M2;
    if (unit === "sqyd") return v / 9;
    if (unit === "cent") return v / 435.6;
    if (unit === "ground") return v / 2400;
    if (unit === "ac" || unit === "acre") return v / SQFT_PER_ACRE;
    if (unit === "ha" || unit === "hectare") return v / SQFT_PER_HECTARE;
    return null;
  }

  function extractDomain(url) {
    if (!url) return "";
    try {
      const host = new URL(String(url)).hostname.toLowerCase();
      return host.replace(/^www\./, "");
    } catch (_) {
      return "";
    }
  }

  function quantile(sorted, q) {
    if (!sorted.length) return null;
    if (sorted.length === 1) return sorted[0];
    const pos = (sorted.length - 1) * q;
    const lo = Math.floor(pos);
    const hi = Math.ceil(pos);
    if (lo === hi) return sorted[lo];
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
  }

  function median(values) {
    const clean = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
    return quantile(clean, 0.5);
  }

  function primaryUrlOf(p) {
    if (!p) return "";
    if (p.src) return String(p.src).trim();
    if (Array.isArray(p.sources)) {
      const hit = p.sources.find((s) => s && s.url);
      if (hit) return String(hit.url).trim();
    }
    return "";
  }

  function canonicalEvidenceKind(p) {
    if (!p) return "unknown";
    if (p.derived === true || p.type === "derived_gv") return "proxy";
    if (p.type === "compensation") return "compensation";
    if (p.type === "official") return "official";
    if (["govt_auction", "govt_allotment", "bank_auction"].includes(p.type)) return "auction";
    if (["registered", "reported_deal"].includes(p.type)) return "reported";
    if (["listing", "consensus", "unverified"].includes(p.type)) return "asking";
    return "other";
  }

  /* Extract un-discounted raw observed price per sq ft for each stratum.
   * For listings, uses the recorded asking value (typ or txn_sqyd/9) instead of
   * the engine's unvalidated -10% model input. */
  function observedPriceSqft(p, kind) {
    if (!p) return null;
    const pos = (x) => (Number.isFinite(Number(x)) && Number(x) > 0 ? Number(x) : null);
    if (kind === "asking") {
      return pos(p.typ) || (pos(p.txn_sqyd) ? pos(p.txn_sqyd) / 9 : null) || pos(p.price);
    }
    if (kind === "auction" || kind === "reported" || kind === "compensation" || kind === "official") {
      return pos(p.price) || (pos(p.txn_sqyd) ? pos(p.txn_sqyd) / 9 : null);
    }
    if (kind === "proxy") return pos(p.price);
    return null;
  }

  /* Deduplicate non-proxy observations by normalized (source_url, rounded_price) or
   * (loc_key, kind, rounded_price) so syndicated/repeated URLs cannot inflate counts. */
  function dedupeEvidence(entries) {
    const seenUrl = new Set();
    const seenLocPrice = new Set();
    const kept = [];
    let droppedDuplicates = 0;

    for (const item of entries || []) {
      const p = item && item.p ? item.p : item;
      if (!p) continue;
      const kind = canonicalEvidenceKind(p);
      const value = observedPriceSqft(p, kind);
      if (value == null) continue;
      const url = primaryUrlOf(p);
      const roundedPrice = Math.round(value);
      const locKey = String(p.loc || "").trim().toLowerCase();
      const urlKey = url ? `${kind}|${url}|${roundedPrice}` : "";
      const locPriceKey = `${kind}|${locKey}|${roundedPrice}`;

      if ((urlKey && seenUrl.has(urlKey)) || seenLocPrice.has(locPriceKey)) {
        droppedDuplicates++;
        continue;
      }
      if (urlKey) seenUrl.add(urlKey);
      seenLocPrice.add(locPriceKey);

      kept.push({
        kind,
        type: String(p.type || ""),
        value,
        loc: String(p.loc || "Location not recorded"),
        district: normalizeDistrict(p.district),
        state: String(p.state || ""),
        land: String(p.land || "Not recorded"),
        date: String(p.date || ""),
        source: url,
        domain: extractDomain(url),
        note: String(p.note || ""),
        lat: Number(p.lat),
        lon: Number(p.lon),
        distance: Number.isFinite(item && item.d) ? item.d : null,
        govtSqft: p.govt_sqyd > 0 ? p.govt_sqyd / 9 : null
      });
    }
    return { kept, droppedDuplicates };
  }

  function stratifyEvidence(entries) {
    const { kept, droppedDuplicates } = dedupeEvidence(entries);
    const strata = {
      reported: [],
      auction: [],
      asking: [],
      official: [],
      compensation: [],
      proxy: []
    };
    for (const row of kept) {
      if (strata[row.kind]) strata[row.kind].push(row);
    }
    for (const arr of Object.values(strata)) {
      arr.sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity));
    }
    const nonProxy = [...strata.reported, ...strata.auction, ...strata.asking];
    const distinctDomains = new Set(nonProxy.map((r) => r.domain).filter(Boolean));
    return {
      strata,
      droppedDuplicates,
      independentCount: nonProxy.length,
      distinctDomainCount: distinctDomains.size,
      distinctDomains: [...distinctDomains].sort()
    };
  }

  /* Canonical pilot evidence pool combining BL_VERIFIED and expanded BL_EVIDENCE,
   * filtering out SRO aggregate rows and explicit industrial-only listings so build-time
   * gate flags, browser UI, 10-quote checks, and blind auction evaluation match 100%. */
  function collectPilotEvidencePool(verified, evidence, expandEvidenceFn) {
    const rawV = (verified || []).filter((p) => p && !/SRO villages \(/.test(p.loc || ""));
    const evExp = typeof expandEvidenceFn === "function" && evidence ? expandEvidenceFn(evidence) : [];
    return rawV
      .concat(evExp)
      .filter((p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lon) && String(p.land || "").toLowerCase() !== "industrial");
  }

  /* Solve linear system A * x = b via Gaussian elimination with partial pivoting. */
  function solveLinearSystem(A, b) {
    const n = b.length;
    const M = A.map((row, i) => row.slice().concat([b[i]]));
    for (let col = 0; col < n; col++) {
      let pivot = col;
      let maxAbs = Math.abs(M[col][col]);
      for (let r = col + 1; r < n; r++) {
        const v = Math.abs(M[r][col]);
        if (v > maxAbs) {
          maxAbs = v;
          pivot = r;
        }
      }
      if (maxAbs < 1e-12) return null;
      if (pivot !== col) {
        const tmp = M[col];
        M[col] = M[pivot];
        M[pivot] = tmp;
      }
      const diag = M[col][col];
      for (let r = col + 1; r < n; r++) {
        const f = M[r][col] / diag;
        for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
      }
    }
    const x = new Array(n).fill(0);
    for (let r = n - 1; r >= 0; r--) {
      let sum = M[r][n];
      for (let c = r + 1; c < n; c++) sum -= M[r][c] * x[c];
      x[r] = sum / M[r][r];
    }
    return x;
  }

  /* Fit L2-regularized Ridge Regression on standardized features with unpenalized intercept.
   * X: array of feature arrays (rows x d), y: array of targets (length rows), lambda > 0. */
  function fitRidge(X, y, lambda = 10) {
    const n = X.length;
    if (!n || !X[0] || !X[0].length) return null;
    const d = X[0].length;
    const means = new Array(d).fill(0);
    const stds = new Array(d).fill(0);
    let yMean = 0;
    for (let i = 0; i < n; i++) {
      yMean += y[i];
      for (let j = 0; j < d; j++) means[j] += X[i][j];
    }
    yMean /= n;
    for (let j = 0; j < d; j++) means[j] /= n;

    for (let i = 0; i < n; i++) {
      for (let j = 0; j < d; j++) {
        const diff = X[i][j] - means[j];
        stds[j] += diff * diff;
      }
    }
    for (let j = 0; j < d; j++) {
      stds[j] = Math.sqrt(stds[j] / n);
      if (stds[j] < 1e-8) stds[j] = 1;
    }

    // Build normal equations (Z^T Z + lambda I) w = Z^T (y - yMean)
    const XtX = Array.from({ length: d }, () => new Array(d).fill(0));
    const Xty = new Array(d).fill(0);
    for (let i = 0; i < n; i++) {
      const z = new Array(d);
      for (let j = 0; j < d; j++) z[j] = (X[i][j] - means[j]) / stds[j];
      const yc = y[i] - yMean;
      for (let j = 0; j < d; j++) {
        Xty[j] += z[j] * yc;
        for (let k = j; k < d; k++) XtX[j][k] += z[j] * z[k];
      }
    }
    for (let j = 0; j < d; j++) {
      XtX[j][j] += lambda;
      for (let k = 0; k < j; k++) XtX[j][k] = XtX[k][j];
    }
    const weights = solveLinearSystem(XtX, Xty);
    if (!weights) return null;
    return { intercept: yMean, weights, means, stds, lambda };
  }

  /* Predict log-residual and feature contributions for a feature vector given a fitted Ridge model. */
  function predictRidgeResidual(model, featVec, featureNames = []) {
    if (!model || !Array.isArray(featVec) || featVec.length !== model.weights.length) return null;
    let predLogRatio = model.intercept;
    const contributions = [];
    for (let j = 0; j < model.weights.length; j++) {
      const val = Number.isFinite(featVec[j]) ? featVec[j] : model.means[j];
      const z = (val - model.means[j]) / (model.stds[j] || 1);
      const contrib = model.weights[j] * z;
      predLogRatio += contrib;
      contributions.push({
        key: featureNames[j] || `f${j}`,
        raw: Math.round(val * 1000) / 1000,
        zScore: Math.round(z * 100) / 100,
        weight: Math.round(model.weights[j] * 1000) / 1000,
        logContrib: Math.round(contrib * 1000) / 1000,
        pctEffect: Math.round((Math.exp(contrib) - 1) * 1000) / 10
      });
    }
    // Clamp extreme extrapolation ratios safely to [0.5x, 12x]
    const clampedLog = Math.max(Math.log(0.5), Math.min(Math.log(12), predLogRatio));
    return {
      logRatio: Math.round(clampedLog * 1000) / 1000,
      ratio: Math.round(Math.exp(clampedLog) * 100) / 100,
      contributions: contributions.sort((a, b) => Math.abs(b.logContrib) - Math.abs(a.logContrib))
    };
  }

  function scoreErrorArray(errs) {
    if (!errs.length) return null;
    const s = errs.slice().sort((a, b) => a - b);
    return {
      n: s.length,
      mdapePct: Math.round(quantile(s, 0.5) * 1000) / 10,
      p90ApePct: Math.round(quantile(s, 0.9) * 1000) / 10,
      within25Pct: Math.round((s.filter((x) => x <= 0.25).length / s.length) * 1000) / 10
    };
  }

  /* Spatially blocked Leave-One-Cluster-Out CV for 14-Feature Spatial Residual Ridge.
   * Each item in `pairs` must have: { cluster, district, price, gv, features: number[] }.
   * Standardizes features STRICTLY inside each fold — zero leakage. */
  function evaluateSpatialResidualRidgeCV(pairs, featureMeta = ML_FEATURE_META, alpha = 0.2) {
    const valid = (pairs || []).filter(
      (r) =>
        r &&
        Number.isFinite(r.price) &&
        r.price > 0 &&
        Number.isFinite(r.gv) &&
        r.gv > 0 &&
        r.cluster &&
        Array.isArray(r.features) &&
        r.features.length > 0
    );
    const clusters = [...new Set(valid.map((r) => r.cluster))];
    if (valid.length < 12 || clusters.length < 5) {
      return { ok: false, reason: "Need at least 12 feature-paired rows across ≥5 clusters for spatial Ridge CV." };
    }

    const lambdas = [3, 10, 25, 60, 120];
    let best = null;

    for (const lam of lambdas) {
      const errs = [];
      const absLogRes = [];
      const oofPreds = [];
      for (const row of valid) {
        const train = valid.filter((t) => t.cluster !== row.cluster);
        const Xtr = train.map((t) => t.features);
        const ytr = train.map((t) => Math.log(t.price / t.gv));
        const mod = fitRidge(Xtr, ytr, lam);
        if (!mod) continue;
        const predObj = predictRidgeResidual(mod, row.features);
        const predPrice = row.gv * Math.exp(predObj.logRatio);
        errs.push(Math.abs(predPrice / row.price - 1));
        absLogRes.push(Math.abs(Math.log(row.price) - Math.log(predPrice)));
        oofPreds.push({ actual: row.price, pred: predPrice, cluster: row.cluster });
      }
      if (errs.length !== valid.length) continue;
      const metrics = scoreErrorArray(errs);
      if (!best || metrics.mdapePct < best.metrics.mdapePct || (metrics.mdapePct === best.metrics.mdapePct && metrics.p90ApePct < best.metrics.p90ApePct)) {
        best = { lambda: lam, metrics, absLogRes, oofPreds };
      }
    }

    if (!best) return { ok: false, reason: "Ridge linear solve failed." };

    // Out-of-fold split-conformal coverage
    let covered = 0;
    const widths = [];
    for (let i = 0; i < best.oofPreds.length; i++) {
      const targetCluster = best.oofPreds[i].cluster;
      const calRes = best.absLogRes
        .filter((_, idx) => best.oofPreds[idx].cluster !== targetCluster)
        .sort((a, b) => a - b);
      const rank = Math.min(calRes.length, Math.ceil((calRes.length + 1) * (1 - alpha)));
      const qRadius = calRes[rank - 1];
      const lo = best.oofPreds[i].pred * Math.exp(-qRadius);
      const hi = best.oofPreds[i].pred * Math.exp(qRadius);
      if (best.oofPreds[i].actual >= lo && best.oofPreds[i].actual <= hi) covered++;
      widths.push(((hi - lo) / best.oofPreds[i].actual) * 100);
    }

    const fullSorted = best.absLogRes.slice().sort((a, b) => a - b);
    const fullRank = Math.min(fullSorted.length, Math.ceil((fullSorted.length + 1) * (1 - alpha)));
    const conformalLogRadius = fullSorted[fullRank - 1];

    // Fit full production weights using the CV-selected lambda
    const fullModel = fitRidge(
      valid.map((r) => r.features),
      valid.map((r) => Math.log(r.price / r.gv)),
      best.lambda
    );

    const featureWeights = (fullModel ? fullModel.weights : []).map((w, idx) => ({
      key: (featureMeta[idx] && featureMeta[idx].key) || `f${idx}`,
      label: (featureMeta[idx] && featureMeta[idx].label) || `Feature ${idx}`,
      group: (featureMeta[idx] && featureMeta[idx].group) || "Other",
      weight: Math.round(w * 1000) / 1000,
      pctPerStd: Math.round((Math.exp(w) - 1) * 1000) / 10
    })).sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight));

    return {
      ok: true,
      lambda: best.lambda,
      featureCount: valid[0].features.length,
      metrics: best.metrics,
      conformalLogRadius: Math.round(conformalLogRadius * 1000) / 1000,
      conformalNominalPct: Math.round((1 - alpha) * 100),
      conformalEmpiricalCoveragePct: Math.round((covered / best.oofPreds.length) * 1000) / 10,
      conformalMedianWidthPct: Math.round(median(widths) * 10) / 10,
      featureWeights,
      model: fullModel
        ? {
            intercept: Math.round(fullModel.intercept * 10000) / 10000,
            weights: fullModel.weights.map((x) => Math.round(x * 10000) / 10000),
            means: fullModel.means.map((x) => Math.round(x * 10000) / 10000),
            stds: fullModel.stds.map((x) => Math.round(x * 10000) / 10000),
            lambda: fullModel.lambda
          }
        : null
    };
  }

  /* Leave-one-locality-cluster-out cross-validation comparing:
   *  (A) Naive coordinate/district-median baseline (raw price)
   *  (B) Existing heuristic engine.js (if heuristicPrice provided)
   *  (C) Anchor-relative baseline: GV_local * out-of-fold median(P / GV)
   *  (D) 14-Feature Spatial Residual Ridge (if features provided)
   *      with split-conformal 80% log-residual interval calibration.
   */
  function evaluateAnchorRelativeCV(pairs, alpha = 0.2) {
    const valid = (pairs || []).filter(
      (r) =>
        r &&
        Number.isFinite(r.price) &&
        r.price > 0 &&
        Number.isFinite(r.gv) &&
        r.gv > 0 &&
        r.cluster
    );
    if (valid.length < 4) {
      return {
        ok: false,
        reason: "Need at least 4 paired non-proxy observations with local official guideline anchors."
      };
    }

    const clusters = [...new Set(valid.map((r) => r.cluster))];
    if (clusters.length < 3) {
      return {
        ok: false,
        reason: "Need at least 3 distinct locality clusters for spatially blocked evaluation."
      };
    }

    const naiveErrs = [];
    const anchorErrs = [];
    const heuristicErrs = [];
    const oofAbsLogRes = [];
    const oofPreds = [];

    for (const row of valid) {
      const train = valid.filter((t) => t.cluster !== row.cluster);
      const sameDist = train.filter((t) => t.district === row.district);
      const pool = sameDist.length >= 3 ? sameDist : train;

      const naivePred = median(pool.map((t) => t.price));
      const ratioMed = median(pool.map((t) => t.price / t.gv));
      const anchorPred = row.gv * ratioMed;

      naiveErrs.push(Math.abs(naivePred / row.price - 1));
      anchorErrs.push(Math.abs(anchorPred / row.price - 1));
      oofAbsLogRes.push(Math.abs(Math.log(row.price) - Math.log(anchorPred)));
      oofPreds.push({ actual: row.price, pred: anchorPred, cluster: row.cluster });

      if (Number.isFinite(row.heuristicPrice) && row.heuristicPrice > 0) {
        heuristicErrs.push(Math.abs(row.heuristicPrice / row.price - 1));
      }
    }

    // Leave-one-cluster-out conformal coverage check (strictly out-of-fold quantile)
    let covered = 0;
    const widths = [];
    for (let i = 0; i < oofPreds.length; i++) {
      const targetCluster = oofPreds[i].cluster;
      const calRes = oofAbsLogRes
        .filter((_, idx) => oofPreds[idx].cluster !== targetCluster)
        .sort((a, b) => a - b);
      const rank = Math.min(calRes.length, Math.ceil((calRes.length + 1) * (1 - alpha)));
      const qRadius = calRes[rank - 1];
      const lo = oofPreds[i].pred * Math.exp(-qRadius);
      const hi = oofPreds[i].pred * Math.exp(qRadius);
      if (oofPreds[i].actual >= lo && oofPreds[i].actual <= hi) covered++;
      widths.push(((hi - lo) / oofPreds[i].actual) * 100);
    }

    const fullRatios = valid.map((r) => r.price / r.gv);
    const fullSortedRes = oofAbsLogRes.slice().sort((a, b) => a - b);
    const fullRank = Math.min(fullSortedRes.length, Math.ceil((fullSortedRes.length + 1) * (1 - alpha)));
    const conformalLogRadius = fullSortedRes[fullRank - 1];

    const byDistrict = {};
    for (const d of [...new Set(valid.map((r) => r.district))]) {
      const dRows = valid.filter((r) => r.district === d);
      const dRatios = dRows.map((r) => r.price / r.gv).sort((a, b) => a - b);
      byDistrict[d] = {
        n: dRows.length,
        medianRatio: Math.round(median(dRatios) * 100) / 100,
        p25Ratio: Math.round(quantile(dRatios, 0.25) * 100) / 100,
        p75Ratio: Math.round(quantile(dRatios, 0.75) * 100) / 100
      };
    }

    const anchorMetrics = scoreErrorArray(anchorErrs);
    const ridgeCV = valid.every((r) => Array.isArray(r.features) && r.features.length > 0)
      ? evaluateSpatialResidualRidgeCV(valid, ML_FEATURE_META, alpha)
      : null;

    // Honest promotion gate: promote Ridge over Anchor-Relative only if it cuts MdAPE by >= 1.5pp
    // AND does not worsen P90 tail error by > 5pp
    const ridgePromoted = Boolean(
      ridgeCV &&
      ridgeCV.ok &&
      ridgeCV.metrics.mdapePct <= anchorMetrics.mdapePct - 1.5 &&
      ridgeCV.metrics.p90ApePct <= anchorMetrics.p90ApePct + 5
    );

    return {
      ok: true,
      method: "Leave-one-locality-cluster-out spatial CV",
      observations: valid.length,
      clusters: clusters.length,
      medianMarketToGvRatio: Math.round(median(fullRatios) * 100) / 100,
      conformalLogRadius: Math.round(conformalLogRadius * 1000) / 1000,
      conformalNominalPct: Math.round((1 - alpha) * 100),
      conformalEmpiricalCoveragePct: Math.round((covered / oofPreds.length) * 1000) / 10,
      conformalMedianWidthPct: Math.round(median(widths) * 10) / 10,
      naiveDistrictMedian: scoreErrorArray(naiveErrs),
      anchorRelativeBaseline: anchorMetrics,
      existingHeuristic: heuristicErrs.length === valid.length ? scoreErrorArray(heuristicErrs) : null,
      spatialResidualRidge: ridgeCV && ridgeCV.ok ? ridgeCV : null,
      ridgePromoted,
      activeTier2Model: ridgePromoted ? "14-Feature Spatial Residual Ridge" : "Anchor-Relative (GV × Local Ratio)",
      byDistrict
    };
  }

  /* Tamil Nadu Statutory Closing Cost, Section 47A & TDS Calculator (Tier 1 Statutory Rules).
   * - Stamp Duty: 7% on max(declared consideration, official TNREGINET guideline floor)
   * - Registration Fee: 4% standard (3% women-buyer concession on assessed value <= Rs 10 lakh)
   * - TDS (Income Tax Sec 194-IA / Form 26QB): 1% deducted from seller when total value >= Rs 50 lakh
   * - Section 47A Risk: Triggered when declared consideration < official statutory guideline floor
   */
  function calculateTNClosingCosts({
    askSqft,
    floorSqft,
    areaSqft = 1200,
    buyerType = "standard",
    declaredPct = 100
  } = {}) {
    const ask = Number(askSqft);
    const area = Number(areaSqft);
    if (!Number.isFinite(ask) || ask <= 0 || !Number.isFinite(area) || area <= 0) {
      return null;
    }
    const floor = Number.isFinite(Number(floorSqft)) && Number(floorSqft) > 0 ? Number(floorSqft) : 0;
    const decPct = Math.max(40, Math.min(100, Number.isFinite(Number(declaredPct)) ? Number(declaredPct) : 100));

    const marketTotal = Math.round(ask * area);
    const statutoryFloorTotal = Math.round(floor * area);
    const declaredConsideration = Math.round(marketTotal * (decPct / 100));
    const assessedValue = Math.max(declaredConsideration, statutoryFloorTotal);

    const stampDutyRate = 0.07;
    const regFeeRate = buyerType === "woman_le_10l" && assessedValue <= 1000000 ? 0.03 : 0.04;
    const stampDuty = Math.round(assessedValue * stampDutyRate);
    const registrationFee = Math.round(assessedValue * regFeeRate);
    const totalGovtFees = stampDuty + registrationFee;

    // Income Tax Sec 194-IA applies when total property value >= Rs 50,00,000 (deducted from seller payment)
    const tdsApplicable = Math.max(marketTotal, statutoryFloorTotal) >= 5000000;
    const tdsAmount = tdsApplicable ? Math.round(Math.max(declaredConsideration, statutoryFloorTotal) * 0.01) : 0;

    const section47ARisk = statutoryFloorTotal > 0 && declaredConsideration < statutoryFloorTotal;
    const section47AShortfall = section47ARisk ? statutoryFloorTotal - declaredConsideration : 0;
    const cashComponent = Math.max(0, marketTotal - declaredConsideration);
    const allInCost = marketTotal + totalGovtFees;
    const effectiveAllInSqft = Math.round(allInCost / area);
    const effectiveOverheadPct = Math.round((totalGovtFees / marketTotal) * 1000) / 10;

    return {
      areaSqft: Math.round(area),
      askSqft: Math.round(ask),
      floorSqft: Math.round(floor),
      buyerType,
      declaredPct: decPct,
      marketTotal,
      statutoryFloorTotal,
      declaredConsideration,
      assessedValue,
      stampDutyRatePct: 7,
      regFeeRatePct: regFeeRate * 100,
      stampDuty,
      registrationFee,
      totalGovtFees,
      tdsApplicable,
      tdsAmount,
      section47ARisk,
      section47AShortfall,
      cashComponent,
      allInCost,
      effectiveAllInSqft,
      effectiveOverheadPct
    };
  }

  /* Post-Tax Break-Even Appreciation & Opportunity-Cost Calculator (Tier 3 Scenario Math).
   * Uses India Finance Act 2024 flat 12.5% LTCG on land held >= 2 years (30% STCG if < 2 years),
   * 2% exit brokerage, and compares against post-tax Bank FD (7.2% * 0.70 = 5.04%) & Equity (12% gross). */
  function calculateInvestmentBreakEven({
    allInCost,
    baseMarketValue,
    holdYears = 5,
    expectedAnnualGrowthPct = 9,
    exitBrokeragePct = 2,
    fdRatePct = 7.2,
    equityRatePct = 12.0
  } = {}) {
    const cost = Number(allInCost);
    const base = Number(baseMarketValue);
    const yrs = Math.max(1, Math.min(20, Number(holdYears) || 5));
    if (!Number.isFinite(cost) || cost <= 0 || !Number.isFinite(base) || base <= 0) return null;

    const taxRate = yrs >= 2 ? 0.125 : 0.30;
    const brok = Math.max(0, Math.min(0.06, (Number(exitBrokeragePct) || 0) / 100));

    // Solve for gross exit value V such that net proceeds = targetNet:
    // net = V*(1 - brok) - taxRate * max(0, V*(1 - brok) - cost) = targetNet
    const requiredCagrForTargetNet = (targetNet) => {
      let reqGrossNetOfBrok;
      if (targetNet <= cost) {
        reqGrossNetOfBrok = targetNet;
      } else {
        reqGrossNetOfBrok = (targetNet - taxRate * cost) / (1 - taxRate);
      }
      const reqGrossExit = reqGrossNetOfBrok / (1 - brok);
      const cagr = Math.pow(reqGrossExit / base, 1 / yrs) - 1;
      return Math.round(cagr * 1000) / 10;
    };

    const fdNetRate = (fdRatePct / 100) * 0.7; // assuming 30% slab on FD interest
    const fdTargetNet = cost * Math.pow(1 + fdNetRate, yrs);
    const eqGross = cost * Math.pow(1 + equityRatePct / 100, yrs);
    const eqTargetNet = eqGross - 0.125 * Math.max(0, eqGross - cost);

    const g = (Number(expectedAnnualGrowthPct) || 0) / 100;
    const projectedGrossExit = Math.round(base * Math.pow(1 + g, yrs));
    const exitBrokerage = Math.round(projectedGrossExit * brok);
    const netBeforeTax = projectedGrossExit - exitBrokerage;
    const capitalGain = Math.max(0, netBeforeTax - cost);
    const capitalGainsTax = Math.round(capitalGain * taxRate);
    const netProceeds = netBeforeTax - capitalGainsTax;
    const netProfit = netProceeds - cost;
    const netIrrPct = Math.round((Math.pow(Math.max(1, netProceeds) / cost, 1 / yrs) - 1) * 1000) / 10;

    return {
      holdYears: yrs,
      taxRegime: yrs >= 2 ? "12.5% LTCG (≥2 yrs, no indexation)" : "30% STCG (<2 yrs)",
      breakEvenCagrPct: requiredCagrForTargetNet(cost),
      beatFdCagrPct: requiredCagrForTargetNet(fdTargetNet),
      beatEquityCagrPct: requiredCagrForTargetNet(eqTargetNet),
      expectedAnnualGrowthPct: Number(expectedAnnualGrowthPct),
      projectedGrossExit,
      exitBrokerage,
      capitalGainsTax,
      netProceeds,
      netProfit,
      netIrrPct,
      fdComparisonNet: Math.round(fdTargetNet),
      equityComparisonNet: Math.round(eqTargetNet)
    };
  }

  /* Core Quote Evaluator with explicit abstention gate + optional Ridge feature vector. */
  function evaluateQuote({ askSqft, guidelineAnchor, nearbyEntries, cvBenchmark, villageFeatures = null, gate = {} }) {
    const G = Object.assign({}, DEFAULT_GATE, gate);
    if (!Number.isFinite(askSqft) || askSqft <= 0) {
      return { status: "invalid", reason: "Enter a positive asking price and valid area." };
    }

    const inRadius = (nearbyEntries || []).filter(
      (x) => x && (!Number.isFinite(x.d) || x.d <= G.maxRadiusKm)
    );
    const strat = stratifyEvidence(inRadius);

    // Determine effective statutory floor (explicit street rate overrides village median if selected)
    const floorSqft =
      guidelineAnchor && Number.isFinite(guidelineAnchor.streetRate) && guidelineAnchor.streetRate > 0
        ? guidelineAnchor.streetRate
        : guidelineAnchor && Number.isFinite(guidelineAnchor.median) && guidelineAnchor.median > 0
          ? guidelineAnchor.median
          : null;

    const anchorWithinRange =
      floorSqft != null &&
      (!Number.isFinite(guidelineAnchor.distanceKm) || guidelineAnchor.distanceKm <= G.minGuidelineAnchorKm);

    const missing = [];
    if (!anchorWithinRange) {
      missing.push(`No matched official residential guideline anchor within ${G.minGuidelineAnchorKm} km`);
    }
    if (strat.independentCount < G.minIndependentObs) {
      missing.push(
        `Only ${strat.independentCount} deduplicated non-proxy observation${strat.independentCount === 1 ? "" : "s"} within ${G.maxRadiusKm} km (minimum ${G.minIndependentObs})`
      );
    }
    if (strat.distinctDomainCount < G.minDistinctDomains) {
      missing.push(
        `Only ${strat.distinctDomainCount} distinct source domain${strat.distinctDomainCount === 1 ? "" : "s"} (minimum ${G.minDistinctDomains})`
      );
    }

    const ratioToFloor = floorSqft ? Math.round((askSqft / floorSqft) * 100) / 100 : null;
    const belowStatutoryFloor = floorSqft != null && askSqft < floorSqft;

    const stratumSummary = (rows) => {
      if (!rows.length) return null;
      const vals = rows.map((r) => r.value).sort((a, b) => a - b);
      return {
        n: vals.length,
        min: Math.round(vals[0]),
        median: Math.round(median(vals)),
        max: Math.round(vals[vals.length - 1])
      };
    };

    const strataSummary = {
      reported: stratumSummary(strat.strata.reported),
      auction: stratumSummary(strat.strata.auction),
      asking: stratumSummary(strat.strata.asking),
      proxyCount: strat.strata.proxy.length,
      compensationCount: strat.strata.compensation.length
    };

    // Optional Ridge attribution (computed for transparency even if anchor-relative is active)
    let ridgeDetail = null;
    if (
      floorSqft &&
      cvBenchmark &&
      cvBenchmark.spatialResidualRidge &&
      cvBenchmark.spatialResidualRidge.model &&
      Array.isArray(villageFeatures) &&
      villageFeatures.length === cvBenchmark.spatialResidualRidge.model.weights.length
    ) {
      const rp = predictRidgeResidual(
        cvBenchmark.spatialResidualRidge.model,
        villageFeatures,
        ML_FEATURE_META.map((m) => m.key)
      );
      if (rp) {
        ridgeDetail = {
          ratio: rp.ratio,
          midSqft: Math.round(floorSqft * rp.ratio),
          topDrivers: rp.contributions.slice(0, 5)
        };
      }
    }

    if (missing.length > 0 || !cvBenchmark || !cvBenchmark.ok) {
      return {
        status: "abstain",
        tier: "Tier 1 only (Tier 2 abstained)",
        askSqft: Math.round(askSqft),
        floorSqft: floorSqft ? Math.round(floorSqft) : null,
        ratioToFloor,
        belowStatutoryFloor,
        ridgeDetail,
        reasons: missing.length ? missing : ["No calibrated benchmark available for this corridor"],
        evidence: {
          independentCount: strat.independentCount,
          distinctDomainCount: strat.distinctDomainCount,
          droppedDuplicates: strat.droppedDuplicates,
          strataSummary,
          strata: strat.strata
        }
      };
    }

    // Tier 2: Use promoted 14-Feature Spatial Residual Ridge if it passed the CV promotion gate & features exist;
    // otherwise use Anchor-Relative (GV × local district ratio).
    const useRidge = Boolean(cvBenchmark.ridgePromoted && ridgeDetail && cvBenchmark.spatialResidualRidge);
    const dKey = normalizeDistrict(guidelineAnchor.district);
    const anchorRatio =
      cvBenchmark.byDistrict && cvBenchmark.byDistrict[dKey] && cvBenchmark.byDistrict[dKey].n >= 5
        ? cvBenchmark.byDistrict[dKey].medianRatio
        : cvBenchmark.medianMarketToGvRatio;

    const localRatio = useRidge ? ridgeDetail.ratio : anchorRatio;
    const anchorMid = floorSqft * localRatio;
    const rad = useRidge
      ? cvBenchmark.spatialResidualRidge.conformalLogRadius
      : Number.isFinite(cvBenchmark.conformalLogRadius)
        ? cvBenchmark.conformalLogRadius
        : 0.45;
    const corridorLow = Math.max(floorSqft, anchorMid * Math.exp(-rad));
    const corridorHigh = anchorMid * Math.exp(rad);

    let position = "within_corridor";
    let positionLabel = useRidge
      ? "Inside 14-feature spatial residual corridor"
      : "Inside empirical anchor-relative corridor";
    if (belowStatutoryFloor) {
      position = "below_floor";
      positionLabel = "Below official guideline floor (verify title, classification, or distress)";
    } else if (askSqft < corridorLow) {
      position = "below_corridor";
      positionLabel = "Below empirical corridor (check road access, layout approval, or water risk)";
    } else if (askSqft > corridorHigh) {
      position = "above_corridor";
      positionLabel = "Above empirical benchmark corridor";
    }

    // Practical negotiation counter-offer band grounded on empirical corridor
    const negotiation = {
      openingOfferSqft: Math.round(Math.max(floorSqft, corridorLow + (anchorMid - corridorLow) * 0.35)),
      fairTargetSqft: Math.round(anchorMid),
      walkAwaySqft: Math.round(corridorHigh),
      potentialSavingsSqft: askSqft > anchorMid ? Math.round(askSqft - anchorMid) : 0
    };

    return {
      status: "benchmarked",
      tier: useRidge
        ? "Tier 1 observed + Tier 2 14-Feature Residual Ridge"
        : "Tier 1 observed + Tier 2 anchor-relative benchmark",
      askSqft: Math.round(askSqft),
      floorSqft: Math.round(floorSqft),
      ratioToFloor,
      belowStatutoryFloor,
      benchmark: {
        modelName: useRidge ? "14-Feature Spatial Residual Ridge" : "Anchor-Relative (GV × Local Ratio)",
        localRatio,
        midSqft: Math.round(anchorMid),
        lowSqft: Math.round(corridorLow),
        highSqft: Math.round(corridorHigh),
        nominalPct: useRidge ? cvBenchmark.spatialResidualRidge.conformalNominalPct : cvBenchmark.conformalNominalPct,
        empiricalCoveragePct: useRidge
          ? cvBenchmark.spatialResidualRidge.conformalEmpiricalCoveragePct
          : cvBenchmark.conformalEmpiricalCoveragePct,
        mdapePct: useRidge
          ? cvBenchmark.spatialResidualRidge.metrics.mdapePct
          : cvBenchmark.anchorRelativeBaseline.mdapePct
      },
      negotiation,
      ridgeDetail,
      position,
      positionLabel,
      evidence: {
        independentCount: strat.independentCount,
        distinctDomainCount: strat.distinctDomainCount,
        droppedDuplicates: strat.droppedDuplicates,
        strataSummary,
        strata: strat.strata
      }
    };
  }

  /* Distance (km) from a point to a project record (pt, path, or ring). */
  function projectDistanceKm(lat, lon, proj) {
    if (!proj) return Infinity;
    if (Array.isArray(proj.pt) && proj.pt.length >= 2) {
      return hav(lat, lon, proj.pt[1], proj.pt[0]);
    }
    if (Array.isArray(proj.path) && proj.path.length) {
      let best = Infinity;
      for (const pt of proj.path) {
        if (Array.isArray(pt) && pt.length >= 2) {
          const d = hav(lat, lon, pt[1], pt[0]);
          if (d < best) best = d;
        }
      }
      return best;
    }
    if (proj.ring && Number.isFinite(proj.ring.lat) && Number.isFinite(proj.ring.lon)) {
      const centerDist = hav(lat, lon, proj.ring.lat, proj.ring.lon);
      const rKm = (Number(proj.ring.rdeg) || 0) * 111;
      return Math.abs(centerDist - rKm);
    }
    return Infinity;
  }

  /* Return nearby recorded infrastructure projects within maxKm (factual Tier 1 context, not uplift claims). */
  function nearbyCatalysts(lat, lon, projects, maxKm = 15, limit = 6) {
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Array.isArray(projects)) return [];
    const out = [];
    for (const p of projects) {
      if (!p || p.user) continue;
      const d = projectDistanceKm(lat, lon, p);
      if (Number.isFinite(d) && d <= maxKm) {
        out.push({
          id: p.id || "",
          name: String(p.n || p.name || "Unnamed project"),
          type: String(p.t || "infra"),
          status: String(p.st || p.status || "Recorded"),
          distanceKm: Math.round(d * 10) / 10,
          source: primaryUrlOf(p) || (typeof p.url === "string" ? p.url : "")
        });
      }
    }
    out.sort((a, b) => a.distanceKm - b.distanceKm);
    return out.slice(0, limit);
  }

  /* Dynamic statutory & legal due-diligence checklist tailored to quote verdict & closing risks. */
  function dueDiligenceChecklist(res, closing = null) {
    const items = [];
    if (!res || res.status === "invalid") return items;

    if (res.belowStatutoryFloor) {
      items.push({
        priority: "urgent",
        title: "Quote is below official statutory guideline floor",
        detail: `Asking rate (₹${res.askSqft}/sq ft) sits below the official TNREGINET floor (₹${res.floorSqft}/sq ft). Under Section 47A of the Indian Stamp Act, stamp duty is assessed at least at guideline value; inspect immediately for title defect, poramboke/waterbody classification, or litigation.`
      });
    } else if (closing && closing.section47ARisk) {
      items.push({
        priority: "urgent",
        title: "Section 47A under-valuation risk triggered",
        detail: `Declared registration value (₹${closing.declaredConsideration.toLocaleString("en-IN")}) is ₹${closing.section47AShortfall.toLocaleString("en-IN")} below the official statutory floor. Sub-Registrar will impound or levy duty on ₹${closing.assessedValue.toLocaleString("en-IN")}.`
      });
    } else if (res.status === "abstain") {
      items.push({
        priority: "high",
        title: "Manual SRO & local broker verification required (Tier 2 abstained)",
        detail: "Independent non-proxy comps are below threshold here. Pull recent registered sale deeds (EC) for adjacent survey numbers on TNREGINET before making an offer."
      });
    } else if (res.position === "above_corridor") {
      items.push({
        priority: "high",
        title: "Negotiation check: quote sits above empirical corridor",
        detail: `Verify whether concrete site premiums (≥30 ft blacktop road, corner frontage, CMDA/DTCP gated approval, immediate Metro/arterial frontage) justify pricing above ₹${res.benchmark.highSqft}/sq ft.`
      });
    } else if (res.position === "below_corridor") {
      items.push({
        priority: "medium",
        title: "Verify site constraints behind lower-than-corridor quote",
        detail: "Check approach road width, OSR/road gifting compliance, low-lying flood history (JRC water occurrence), and unapproved layout regularization status."
      });
    }

    if (closing && closing.tdsApplicable) {
      items.push({
        priority: "high",
        title: "Mandatory 1% TDS filing (Form 26QB, Sec 194-IA)",
        detail: `Property value exceeds ₹50 lakh. Buyer must deduct ₹${closing.tdsAmount.toLocaleString("en-IN")} (1%) from seller payment and remit via Income Tax Form 26QB within 30 days of month-end.`
      });
    }

    items.push(
      {
        priority: "standard",
        title: "TNREGINET Encumbrance Certificate (EC) & exact street guideline check",
        detail: "Run a 30-year EC search by exact survey/subdivision number and confirm the exact street classification on tnreginet.gov.in (guideline rates vary 2.5×–3.5× within a single village)."
      },
      {
        priority: "standard",
        title: "Tamil Nilam Patta / Chitta, A-Register & FMB sketch",
        detail: "Confirm patta ownership continuity, land classification (Nanjai/Punjai/Natham/House site), and survey boundaries on tngis.tn.gov.in & eservices.tn.gov.in."
      },
      {
        priority: "standard",
        title: "DTCP / CMDA Layout Approval & TNRERA Registration",
        detail: "Verify layout approval number, gifted road/OSR deed to local body, and TNRERA registration (mandatory for plotted developments >500 sq m or >8 plots)."
      }
    );
    return items;
  }

  /* Build a clean, auditable Markdown Underwriting Brief separating Tier 1 / Tier 2 / Tier 3. */
  function formatUnderwritingMemoMarkdown(
    res,
    { village, street, catalysts = [], closing = null, breakeven = null, heuristicSqft = null, generatedUtc = new Date().toISOString() } = {}
  ) {
    if (!res || res.status === "invalid") return "";
    const v = village || {};
    const lines = [
      `# Bhoomi Lens — Tamil Nadu Residential Plot Underwriting Dossier`,
      `- **Generated (UTC):** ${generatedUtc}`,
      `- **Jurisdiction:** ${v.v || "Unknown village"} (SRO: ${v.sro || "N/A"}), ${v.d || "Tamil Nadu"}`,
      `- **Asking Quote:** ₹${res.askSqft.toLocaleString("en-IN")} / sq ft${res.ratioToFloor ? ` (${res.ratioToFloor}× statutory floor)` : ""}`,
      `- **Epistemic Status:** ${res.tier}`,
      ``,
      `## Tier 2 · Benchmarked Estimate (${res.status === "benchmarked" ? "ACTIVE" : "ABSTAINED"})`
    ];

    if (res.status === "benchmarked") {
      lines.push(
        `- **Model:** ${res.benchmark.modelName}`,
        `- **Verdict:** ${res.positionLabel}`,
        `- **Benchmarked Midpoint:** ₹${res.benchmark.midSqft.toLocaleString("en-IN")} / sq ft (Floor × ${res.benchmark.localRatio}× ratio)`,
        `- **${res.benchmark.nominalPct}% Split-Conformal Corridor (OOF coverage ${res.benchmark.empiricalCoveragePct}%):** ₹${res.benchmark.lowSqft.toLocaleString("en-IN")} – ₹${res.benchmark.highSqft.toLocaleString("en-IN")} / sq ft`,
        `- **Statewide Out-of-Fold MdAPE:** ${res.benchmark.mdapePct}%`
      );
      if (res.negotiation) {
        lines.push(
          `- **Suggested Counter-Offer Band:** Open at ₹${res.negotiation.openingOfferSqft.toLocaleString("en-IN")}/sf · Fair target ₹${res.negotiation.fairTargetSqft.toLocaleString("en-IN")}/sf · Walk-away ₹${res.negotiation.walkAwaySqft.toLocaleString("en-IN")}/sf`
        );
      }
    } else {
      lines.push(
        `- **Verdict:** ABSTAIN — Bhoomi Lens declines to extrapolate a price corridor here.`,
        ...res.reasons.map((r) => `- **Gate failure:** ${r}`)
      );
    }

    if (closing) {
      lines.push(
        ``,
        `## Tier 1 · Statutory Closing Cost Ledger (${closing.areaSqft.toLocaleString("en-IN")} sq ft plot)`,
        `- **Quoted Plot Value:** ₹${closing.marketTotal.toLocaleString("en-IN")}`,
        `- **Statutory Guideline Floor Total:** ₹${closing.statutoryFloorTotal.toLocaleString("en-IN")}`,
        `- **Assessed Stamp Duty Value:** ₹${closing.assessedValue.toLocaleString("en-IN")} (${closing.declaredPct}% declared)`,
        `- **Tamil Nadu Stamp Duty (${closing.stampDutyRatePct}%):** ₹${closing.stampDuty.toLocaleString("en-IN")}`,
        `- **Registration Fee (${closing.regFeeRatePct}%):** ₹${closing.registrationFee.toLocaleString("en-IN")}`,
        `- **All-In Acquisition Cost:** ₹${closing.allInCost.toLocaleString("en-IN")} (₹${closing.effectiveAllInSqft.toLocaleString("en-IN")}/sq ft · +${closing.effectiveOverheadPct}% statutory overhead)`,
        closing.tdsApplicable
          ? `- **TDS (Sec 194-IA · Form 26QB):** ₹${closing.tdsAmount.toLocaleString("en-IN")} (1% deducted from seller payment)`
          : `- **TDS (Sec 194-IA):** Not triggered (< ₹50 lakh)`
      );
    }

    lines.push(
      ``,
      `## Tier 1 · Observed Primary Evidence`,
      `- **Active Statutory Floor:** ${res.floorSqft ? `₹${res.floorSqft.toLocaleString("en-IN")} / sq ft` : "Unavailable"} (${street ? `Street: ${street.street}` : "2024 Village Residential Median"})`
    );
    if (v.p10 && v.p90) {
      lines.push(`- **Village Street Spread (${v.nSt} residential streets):** ₹${v.p10.toLocaleString("en-IN")} (P10) – ₹${v.p90.toLocaleString("en-IN")} (P90) / sq ft`);
    }
    if (v.u25) {
      lines.push(`- **Mid-Cycle 2025 Updates:** ${v.u25} residential streets revised in 2025`);
    }
    if (v.g17 != null) {
      lines.push(`- **Official Guideline Revision (2017 → 2024):** ${v.g17 >= 0 ? "+" : ""}${v.g17}%`);
    }

    const ss = res.evidence.strataSummary;
    const fmtStratum = (label, s) =>
      s ? `- **${label} (${s.n}):** ₹${s.min.toLocaleString("en-IN")}–₹${s.max.toLocaleString("en-IN")} / sq ft (median ₹${s.median.toLocaleString("en-IN")})` : `- **${label}:** 0 recorded`;

    lines.push(
      `- **Deduplicated Non-Proxy Evidence (≤8 km):** ${res.evidence.independentCount} observations across ${res.evidence.distinctDomainCount} distinct domains (${res.evidence.droppedDuplicates} duplicates removed)`,
      fmtStratum("Reported sales / deals", ss.reported),
      fmtStratum("Public auctions / allotments", ss.auction),
      fmtStratum("Asking prices (raw, un-discounted)", ss.asking),
      `- **Excluded from Tier 2 Gate:** ${ss.proxyCount} guideline-derived proxies, ${ss.compensationCount} acquisition compensation rows`
    );

    if (catalysts.length) {
      lines.push(``, `### Nearby Recorded Infrastructure Projects (≤15 km — Factual Context, Not Causal Uplift)`);
      for (const c of catalysts) {
        lines.push(`- ${c.name} (${c.type}, ${c.status}) — ${c.distanceKm} km${c.source ? ` · ${c.source}` : ""}`);
      }
    }

    lines.push(``, `## Buyer Due-Diligence Checklist`);
    for (const item of dueDiligenceChecklist(res, closing)) {
      lines.push(`- **[${item.priority.toUpperCase()}] ${item.title}:** ${item.detail}`);
    }

    if (breakeven) {
      lines.push(
        ``,
        `## Tier 3 · Post-Tax Break-Even & Scenario (${breakeven.holdYears}-Yr Hold · ${breakeven.taxRegime})`,
        `- **Zero-Profit Break-Even Appreciation:** ${breakeven.breakEvenCagrPct}% p.a.`,
        `- **Appreciation Needed to Beat Post-Tax Bank FD (7.2%):** ${breakeven.beatFdCagrPct}% p.a.`,
        `- **Appreciation Needed to Beat Equity Index (12%):** ${breakeven.beatEquityCagrPct}% p.a.`
      );
    }

    if (heuristicSqft) {
      lines.push(
        ``,
        `## Tier 3 · Heuristic Context (Excluded from Verdict)`,
        `- Nationwide gravity + kernel formula (\`js/engine.js\`): ₹${Math.round(heuristicSqft).toLocaleString("en-IN")} / sq ft. Treat strictly as exploratory context.`
      );
    }

    lines.push(``, `*Verify exact survey number, encumbrance, patta, and layout approval on TNREGINET (tnreginet.gov.in) and Tamil Nilam (tngis.tn.gov.in) before transacting.*`);
    return lines.join("\n");
  }

  /* Blind Public E-Auction & Allotment Clearing Test Evaluator (all 38 TN districts). */
  function evaluateBlindAuctionRows(rows, { villages = [], nearbyPool = [], cvBenchmark, gate = {}, districtMedians = {} } = {}) {
    const G = Object.assign({}, DEFAULT_GATE, gate);
    if (!Array.isArray(rows) || !rows.length) {
      return { ok: false, reason: "No blind auction clearing rows provided." };
    }
    if (!cvBenchmark || !cvBenchmark.ok) {
      return { ok: false, reason: "Valid CV benchmark is required." };
    }

    const existingUrls = new Set(
      (nearbyPool || []).map((p) => primaryUrlOf(p && p.p ? p.p : p)).filter(Boolean)
    );

    const results = [];
    let leakageRejected = 0;
    let benchmarkedCount = 0;
    let abstainedCount = 0;
    let coveredCount = 0;
    const anchorErrs = [];
    const naiveErrs = [];

    for (const row of rows) {
      const dist = normalizeDistrict(row.district);
      if (!isTNDistrict(dist)) continue;
      if (row.sourceUrl && existingUrls.has(String(row.sourceUrl).trim())) {
        leakageRejected++;
        continue;
      }

      let bestV = null;
      let bestD = Infinity;
      for (const v of villages) {
        if (v.d !== dist) continue;
        const d = hav(row.lat, row.lon, v.lat, v.lon);
        if (d < bestD) {
          bestD = d;
          bestV = v;
        }
      }

      const near = (nearbyPool || [])
        .map((p) => {
          const obj = p && p.p ? p.p : p;
          return { p: obj, d: hav(row.lat, row.lon, obj.lat, obj.lon) };
        })
        .filter((x) => Number.isFinite(x.d) && x.d <= G.maxRadiusKm);

      const anchor =
        bestV && bestD <= G.minGuidelineAnchorKm
          ? {
              median: bestV.med,
              streetRate: Number.isFinite(row.gvSqft) && row.gvSqft > 0 ? row.gvSqft : null,
              village: bestV.v,
              sro: bestV.sro,
              district: bestV.d,
              distanceKm: bestD
            }
          : Number.isFinite(row.gvSqft) && row.gvSqft > 0
            ? { median: row.gvSqft, streetRate: row.gvSqft, district: dist, distanceKm: 0 }
            : null;

      const ev = evaluateQuote({
        askSqft: row.priceSqft,
        guidelineAnchor: anchor,
        nearbyEntries: near,
        cvBenchmark,
        villageFeatures: bestV && Array.isArray(bestV.f) ? bestV.f : null,
        gate: G
      });

      const entry = {
        auctionId: row.auctionId,
        district: dist,
        actualSqft: Math.round(row.priceSqft),
        floorSqft: ev.floorSqft,
        status: ev.status,
        covered: null,
        anchorApePct: null,
        naiveApePct: null
      };

      if (ev.status === "benchmarked") {
        benchmarkedCount++;
        const cov = row.priceSqft >= ev.benchmark.lowSqft && row.priceSqft <= ev.benchmark.highSqft;
        if (cov) coveredCount++;
        const aErr = Math.abs(ev.benchmark.midSqft / row.priceSqft - 1);
        anchorErrs.push(aErr);
        entry.covered = cov;
        entry.anchorApePct = Math.round(aErr * 1000) / 10;
        entry.corridorLow = ev.benchmark.lowSqft;
        entry.corridorHigh = ev.benchmark.highSqft;

        const dMed = districtMedians[dist];
        if (Number.isFinite(dMed) && dMed > 0) {
          const nErr = Math.abs(dMed / row.priceSqft - 1);
          naiveErrs.push(nErr);
          entry.naiveApePct = Math.round(nErr * 1000) / 10;
        }
      } else {
        abstainedCount++;
      }
      results.push(entry);
    }

    const anchorScore = scoreErrorArray(anchorErrs);
    const naiveScore = scoreErrorArray(naiveErrs);
    const blindCoveragePct = benchmarkedCount ? Math.round((coveredCount / benchmarkedCount) * 1000) / 10 : null;

    return {
      ok: true,
      evaluatedRows: results.length,
      leakageRejected,
      benchmarkedCount,
      abstainedCount,
      abstentionRatePct: results.length ? Math.round((abstainedCount / results.length) * 1000) / 10 : null,
      blindCoveragePct,
      anchorRelative: anchorScore,
      naiveDistrictMedian: naiveScore,
      beatsNaiveOnMdape: Boolean(anchorScore && naiveScore && anchorScore.mdapePct < naiveScore.mdapePct),
      beatsNaiveOnP90: Boolean(anchorScore && naiveScore && anchorScore.p90ApePct < naiveScore.p90ApePct),
      meetsMinSampleGate: results.length >= 20,
      results
    };
  }

  BL.PilotEngine = {
    PILOT_DISTRICTS,
    TN_DISTRICTS,
    DEFAULT_GATE,
    ML_FEATURE_META,
    EPISTEMIC_AUDIT,
    normalizeDistrict,
    isPilotDistrict,
    isTNDistrict,
    hav,
    toSqftRate,
    extractDomain,
    quantile,
    median,
    canonicalEvidenceKind,
    dedupeEvidence,
    stratifyEvidence,
    collectPilotEvidencePool,
    fitRidge,
    predictRidgeResidual,
    evaluateSpatialResidualRidgeCV,
    evaluateAnchorRelativeCV,
    calculateTNClosingCosts,
    calculateInvestmentBreakEven,
    evaluateQuote,
    projectDistanceKm,
    nearbyCatalysts,
    dueDiligenceChecklist,
    formatUnderwritingMemoMarkdown,
    evaluateBlindAuctionRows
  };
})(typeof window !== "undefined" ? window : globalThis);
