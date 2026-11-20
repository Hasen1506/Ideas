/* Bhoomi Lens — Tamil Nadu Residential Plot Pilot Engine (pure functions, no DOM).
 * Works in browser (window.BL.PilotEngine) and Node (globalThis.BL.PilotEngine).
 *
 * Design principles:
 *  1. Strict epistemic separation: Tier 1 (Observed primary evidence),
 *     Tier 2 (Empirically benchmarked anchor-relative estimate with abstention),
 *     Tier 3 (Assumption-driven scenario / heuristic context).
 *  2. Never pool listings, auctions/allotments, official guideline values,
 *     compensation, guideline-derived proxies, or registered sales into one target.
 *  3. Deduplicate repeated/syndicated source URLs before counting evidence density.
 *  4. Abstain explicitly whenever local independent evidence or guideline anchor
 *     coverage falls below threshold — never extrapolate silently.
 */
(function (root) {
  const BL = (root.BL = root.BL || {});
  const R_EARTH = 6371;
  const SQFT_PER_M2 = 10.7639104167;
  const SQFT_PER_ACRE = 43560;
  const SQFT_PER_HECTARE = 107639;

  const PILOT_DISTRICTS = ["Chengalpattu", "Kancheepuram", "Tiruvallur"];

  const DISTRICT_ALIASES = {
    chengalpattu: "Chengalpattu",
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
    sivagangai: "Sivagangai",
    sivaganga: "Sivagangai"
  };

  const DEFAULT_GATE = {
    maxRadiusKm: 8,
    minIndependentObs: 3,
    minDistinctDomains: 2,
    minGuidelineAnchorKm: 5
  };

  const EPISTEMIC_AUDIT = [
    {
      feature: "Street-level TN official guideline registers (2002–2025)",
      module: "data/tn_gv/*.json · pilot_engine.js",
      tier: 1,
      tierLabel: "Tier 1 · Observed primary",
      status: "Active in TN Pilot",
      action: "Use directly as statutory floor & P10/Median/P90 street distribution; never flatten into an unlabeled market price."
    },
    {
      feature: "Public auctions, govt allotments & deduplicated nearby comparables",
      module: "js/comparables.js · pilot_engine.js",
      tier: 1,
      tierLabel: "Tier 1 · Observed primary",
      status: "Stratified & URL-deduplicated",
      action: "Display separately by source stratum with dates, units, and source links; never pool asking quotes with closed sales."
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
      feature: "Anchor-relative quote corridor (GV × local empirical ratio + conformal band)",
      module: "js/pilot_engine.js · scripts/build_tn_pilot.js",
      tier: 2,
      tierLabel: "Tier 2 · Benchmarked estimate",
      status: "Gated by abstention rules",
      action: "Show only when ≥3 independent non-proxy observations from ≥2 distinct domains + guideline anchor exist within radius; otherwise ABSTAIN."
    },
    {
      feature: "Experimental registered-sale GBDT (lat, lon, log_area, date)",
      module: "scripts/market_model.py",
      tier: 2,
      tierLabel: "Tier 2 · Blocked (No-Go today)",
      status: "Disconnected (0 TN verified sales)",
      action: "Do not deploy raw coordinate GBDT without licensed deed panels + parcel attributes; replace target with log(P / GV_street) once licensed data exists."
    },
    {
      feature: "Continuous 820-district price surface & 2015–2036 fan-chart forecast",
      module: "js/engine.js",
      tier: 3,
      tierLabel: "Tier 3 · Heuristic scenario",
      status: "Demoted to scenario context",
      action: "Keep clearly labelled as unvalidated heuristic exploration; exclude from pilot quote verdicts."
    },
    {
      feature: "Opportunity, Risk & Liquidity scores (hash01 local variation)",
      module: "js/engine.js",
      tier: 3,
      tierLabel: "Tier 3 · Heuristic scenario",
      status: "Tagged as synthetic heuristic",
      action: "Tag explicitly as Tier 3 heuristic scores; never present as site-level flood, title, or liquidity verification."
    },
    {
      feature: "Ripple simulator & infrastructure catalyst uplift (2026–2036)",
      module: "js/engine.js · app.js",
      tier: 3,
      tierLabel: "Tier 3 · Assumption sandbox",
      status: "Scenario sensitivity only",
      action: "Keep strictly user-parameterized assumption sandbox; do not claim causal uplift without pre-trend & control validation."
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

  /* Leave-one-locality-cluster-out cross-validation comparing:
   *  (A) Naive coordinate/district-median baseline (raw price)
   *  (B) Anchor-relative baseline: GV_local * out-of-fold median(P / GV)
   *      with split-conformal 80% log-residual interval calibration.
   * Each item in `pairs` must have: { cluster, district, price, gv, heuristicPrice? }.
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

    const scoreErrors = (errs) => {
      const s = errs.slice().sort((a, b) => a - b);
      return {
        n: s.length,
        mdapePct: Math.round(quantile(s, 0.5) * 1000) / 10,
        p90ApePct: Math.round(quantile(s, 0.9) * 1000) / 10,
        within25Pct: Math.round((s.filter((x) => x <= 0.25).length / s.length) * 1000) / 10
      };
    };

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
      byDistrict[d] = {
        n: dRows.length,
        medianRatio: Math.round(median(dRows.map((r) => r.price / r.gv)) * 100) / 100,
        p25Ratio: Math.round(quantile(dRows.map((r) => r.price / r.gv).sort((a, b) => a - b), 0.25) * 100) / 100,
        p75Ratio: Math.round(quantile(dRows.map((r) => r.price / r.gv).sort((a, b) => a - b), 0.75) * 100) / 100
      };
    }

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
      naiveDistrictMedian: scoreErrors(naiveErrs),
      anchorRelativeBaseline: scoreErrors(anchorErrs),
      existingHeuristic: heuristicErrs.length === valid.length ? scoreErrors(heuristicErrs) : null,
      byDistrict
    };
  }

  /* Core Pilot Quote Evaluator with explicit abstention gate.
   * Inputs:
   *  - askSqft: positive number (Rs/sq ft)
   *  - guidelineAnchor: { median, p10, p90, streetCount, village, sro, district, distanceKm, updated2025?, streetRate?, streetName? } | null
   *  - nearbyEntries: raw nearby entries [{ p, d }] within maxRadiusKm
   *  - cvBenchmark: output of evaluateAnchorRelativeCV (provides calibrated ratio & conformalLogRadius)
   *  - gate: optional overrides for DEFAULT_GATE
   */
  function evaluateQuote({ askSqft, guidelineAnchor, nearbyEntries, cvBenchmark, gate = {} }) {
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

    // Check abstention triggers
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

    // Separate stratum summaries (never pooled)
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

    if (missing.length > 0 || !cvBenchmark || !cvBenchmark.ok) {
      return {
        status: "abstain",
        tier: "Tier 1 only (Tier 2 abstained)",
        askSqft: Math.round(askSqft),
        floorSqft: floorSqft ? Math.round(floorSqft) : null,
        ratioToFloor,
        belowStatutoryFloor,
        reasons: missing.length ? missing : ["No calibrated pilot benchmark available for this corridor"],
        evidence: {
          independentCount: strat.independentCount,
          distinctDomainCount: strat.distinctDomainCount,
          droppedDuplicates: strat.droppedDuplicates,
          strataSummary,
          strata: strat.strata
        }
      };
    }

    // Tier 2: Anchor-relative corridor using local district ratio (fallback to pilot ratio) + split-conformal radius
    const dKey = normalizeDistrict(guidelineAnchor.district);
    const localRatio =
      cvBenchmark.byDistrict && cvBenchmark.byDistrict[dKey] && cvBenchmark.byDistrict[dKey].n >= 5
        ? cvBenchmark.byDistrict[dKey].medianRatio
        : cvBenchmark.medianMarketToGvRatio;

    const anchorMid = floorSqft * localRatio;
    const rad = Number.isFinite(cvBenchmark.conformalLogRadius) ? cvBenchmark.conformalLogRadius : 0.45;
    const corridorLow = Math.max(floorSqft, anchorMid * Math.exp(-rad));
    const corridorHigh = anchorMid * Math.exp(rad);

    let position = "within_corridor";
    let positionLabel = "Inside empirical anchor-relative corridor";
    if (belowStatutoryFloor) {
      position = "below_floor";
      positionLabel = "Below official guideline floor (verify title, classification, or distress)";
    } else if (askSqft < corridorLow) {
      position = "below_corridor";
      positionLabel = "Below empirical corridor (check road access, layout approval, or water risk)";
    } else if (askSqft > corridorHigh) {
      position = "above_corridor";
      positionLabel = "Above empirical anchor-relative corridor";
    }

    return {
      status: "benchmarked",
      tier: "Tier 1 observed + Tier 2 anchor-relative benchmark",
      askSqft: Math.round(askSqft),
      floorSqft: Math.round(floorSqft),
      ratioToFloor,
      belowStatutoryFloor,
      benchmark: {
        localRatio,
        midSqft: Math.round(anchorMid),
        lowSqft: Math.round(corridorLow),
        highSqft: Math.round(corridorHigh),
        nominalPct: cvBenchmark.conformalNominalPct,
        empiricalCoveragePct: cvBenchmark.conformalEmpiricalCoveragePct,
        mdapePct: cvBenchmark.anchorRelativeBaseline.mdapePct
      },
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

  /* Dynamic statutory & legal due-diligence checklist tailored to quote verdict. */
  function dueDiligenceChecklist(res) {
    const items = [];
    if (!res || res.status === "invalid") return items;

    if (res.belowStatutoryFloor) {
      items.push({
        priority: "urgent",
        title: "Quote is below official statutory guideline floor",
        detail: `Asking rate (₹${res.askSqft}/sq ft) sits below the official TNREGINET floor (₹${res.floorSqft}/sq ft). Under Section 47A of the Indian Stamp Act, stamp duty is assessed at least at guideline value; inspect immediately for title defect, poramboke/waterbody classification, or litigation.`
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
  function formatUnderwritingMemoMarkdown(res, { village, street, catalysts = [], heuristicSqft = null, generatedUtc = new Date().toISOString() } = {}) {
    if (!res || res.status === "invalid") return "";
    const v = village || {};
    const lines = [
      `# Bhoomi Lens — Tamil Nadu Residential Plot Underwriting Brief`,
      `- **Generated (UTC):** ${generatedUtc}`,
      `- **Jurisdiction:** ${v.v || "Unknown village"} (SRO: ${v.sro || "N/A"}), ${v.d || "Tamil Nadu"}`,
      `- **Asking Quote:** ₹${res.askSqft.toLocaleString("en-IN")} / sq ft${res.ratioToFloor ? ` (${res.ratioToFloor}× statutory floor)` : ""}`,
      `- **Epistemic Status:** ${res.tier}`,
      ``,
      `## Tier 2 · Benchmarked Estimate (${res.status === "benchmarked" ? "ACTIVE" : "ABSTAINED"})`
    ];

    if (res.status === "benchmarked") {
      lines.push(
        `- **Verdict:** ${res.positionLabel}`,
        `- **Anchor-Relative Midpoint:** ₹${res.benchmark.midSqft.toLocaleString("en-IN")} / sq ft (Floor × ${res.benchmark.localRatio}× empirical district ratio)`,
        `- **${res.benchmark.nominalPct}% Split-Conformal Corridor (OOF coverage ${res.benchmark.empiricalCoveragePct}%):** ₹${res.benchmark.lowSqft.toLocaleString("en-IN")} – ₹${res.benchmark.highSqft.toLocaleString("en-IN")} / sq ft`,
        `- **Pilot Out-of-Fold MdAPE:** ${res.benchmark.mdapePct}%`
      );
    } else {
      lines.push(
        `- **Verdict:** ABSTAIN — Bhoomi Lens declines to extrapolate a price corridor here.`,
        ...res.reasons.map((r) => `- **Gate failure:** ${r}`)
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
    for (const item of dueDiligenceChecklist(res)) {
      lines.push(`- **[${item.priority.toUpperCase()}] ${item.title}:** ${item.detail}`);
    }

    if (heuristicSqft) {
      lines.push(
        ``,
        `## Tier 3 · Heuristic Context (Excluded from Verdict)`,
        `- Nationwide gravity + kernel formula (\`js/engine.js\`): ₹${Math.round(heuristicSqft).toLocaleString("en-IN")} / sq ft. Spatially blocked P90 tail error is 286.3% on pilot data; treat strictly as exploratory context.`
      );
    }

    lines.push(``, `*Verify exact survey number, encumbrance, patta, and layout approval on TNREGINET (tnreginet.gov.in) and Tamil Nilam (tngis.tn.gov.in) before transacting.*`);
    return lines.join("\n");
  }

  /* Blind Public E-Auction & Allotment Clearing Test Evaluator.
   * Each row: { auctionId, district, lat, lon, priceSqft, gvSqft?, sourceUrl, date }
   * Villages: pilot village summaries [{ v, d, lat, lon, med, gate, evN, evDom }]
   */
  function evaluateBlindAuctionRows(rows, { villages = [], nearbyPool = [], cvBenchmark, gate = {}, districtMedians = {} } = {}) {
    const G = Object.assign({}, DEFAULT_GATE, gate);
    if (!Array.isArray(rows) || !rows.length) {
      return { ok: false, reason: "No blind auction clearing rows provided." };
    }
    if (!cvBenchmark || !cvBenchmark.ok) {
      return { ok: false, reason: "Valid pilot CV benchmark is required." };
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
      if (!isPilotDistrict(dist)) continue;
      if (row.sourceUrl && existingUrls.has(String(row.sourceUrl).trim())) {
        leakageRejected++;
        continue;
      }

      // Nearest official residential village anchor within 5 km
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

    const score = (errs) => {
      if (!errs.length) return null;
      const s = errs.slice().sort((a, b) => a - b);
      return {
        n: s.length,
        mdapePct: Math.round(quantile(s, 0.5) * 1000) / 10,
        p90ApePct: Math.round(quantile(s, 0.9) * 1000) / 10,
        within25Pct: Math.round((s.filter((x) => x <= 0.25).length / s.length) * 1000) / 10
      };
    };

    const anchorScore = score(anchorErrs);
    const naiveScore = score(naiveErrs);
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
    DEFAULT_GATE,
    EPISTEMIC_AUDIT,
    normalizeDistrict,
    isPilotDistrict,
    hav,
    toSqftRate,
    extractDomain,
    quantile,
    median,
    canonicalEvidenceKind,
    dedupeEvidence,
    stratifyEvidence,
    collectPilotEvidencePool,
    evaluateAnchorRelativeCV,
    evaluateQuote,
    nearbyCatalysts,
    dueDiligenceChecklist,
    formatUnderwritingMemoMarkdown,
    evaluateBlindAuctionRows
  };
})(typeof window !== "undefined" ? window : globalThis);
