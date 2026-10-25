/* Bhoomi Lens - valuation and growth engine.
 * Pure functions, no DOM. Works in the browser (window.BL) and in Node (globalThis.BL).
 *
 * Model summary
 *  1. Fundamental price  = rural agricultural baseline + urban gravity from city anchors.
 *  2. Catalyst uplift    = sum over projects of U * exp(-d/r) * dilution * realisation(year) * P(completion).
 *  3. Price(year)        = Price(now) * (1+g)^(year-now) * (1+E(year)) / (1+E(now)).
 *  4. Forecast band      = drift volatility + unrealised catalyst uncertainty.
 *  5. Risk, liquidity, opportunity score and historical-analogue matching on top.
 */
(function (root) {
  const BL = (root.BL = root.BL || {});
  const R_EARTH = 6371;
  const SQFT_PER_ACRE = 43560;
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const toRad = (d) => (d * Math.PI) / 180;

  function hav(lat1, lon1, lat2, lon2) {
    const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * R_EARTH * Math.asin(Math.min(1, Math.sqrt(a)));
  }

  // Distance (km) from a point to a segment using a local equirectangular projection.
  function segDist(lat, lon, a, b) {
    const kx = 111.32 * Math.cos(toRad(lat)), ky = 110.57;
    const ax = (a[0] - lon) * kx, ay = (a[1] - lat) * ky;
    const bx = (b[0] - lon) * kx, by = (b[1] - lat) * ky;
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let t = len2 > 0 ? -(ax * dx + ay * dy) / len2 : 0;
    t = clamp(t, 0, 1);
    const px = ax + t * dx, py = ay + t * dy;
    return Math.sqrt(px * px + py * py);
  }

  function distToCatalyst(c, lat, lon) {
    if (c.pt) return hav(lat, lon, c.pt[1], c.pt[0]);
    if (c.path) {
      let m = Infinity;
      for (let i = 0; i < c.path.length - 1; i++) m = Math.min(m, segDist(lat, lon, c.path[i], c.path[i + 1]));
      return m;
    }
    if (c.ring) {
      const rk = c.ring.rdeg * 111;
      return Math.abs(hav(lat, lon, c.ring.lat, c.ring.lon) - rk);
    }
    return Infinity;
  }

  // Deterministic pseudo-random in [0,1) from a string - gives stable local variation.
  function hash01(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15;
    return (h >>> 0) / 4294967296;
  }

  const stateOf = (name) => BL.STATES[name] || BL.DEFAULT_STATE;

  /* ---------------- Scenarios ---------------- */
  BL.SCENARIOS = {
    bear: { label: "Bear", pMul: 0.7, etaShift: (c) => Math.ceil((1 - c.cred) * 6) + 1, gAdj: -0.015 },
    base: { label: "Base", pMul: 1.0, etaShift: () => 0, gAdj: 0 },
    bull: { label: "Bull", pMul: 1.2, etaShift: () => -1, gAdj: 0.012 }
  };

  function completionP(c, scen = "base") {
    if (c.scrapYear) return 0;
    if (c.stage >= 4) return 1;
    const sc = BL.SCENARIOS[scen] || BL.SCENARIOS.base;
    const base = BL.STAGE_P[c.stage] * (0.55 + 0.45 * c.cred);
    return clamp(base * sc.pMul, 0.02, 0.98);
  }

  function effEta(c, scen = "base") {
    const sc = BL.SCENARIOS[scen] || BL.SCENARIOS.base;
    if (c.stage >= 4) return c.eta;
    return Math.max(c.eta + sc.etaShift(c), BL.MODEL_YEAR);
  }

  // Share of the full uplift priced in by a given year.
  function realisation(c, year, scen = "base") {
    const T = BL.TYPES[c.t] || BL.TYPES.expressway;
    const eta = effEta(c, scen);
    const K = BL.CURVE || { ann: 0.35, done: 0.85 };
    if (year < c.ann) return 0;
    if (year <= eta) return K.ann + (K.done - K.ann) * ((year - c.ann) / Math.max(1, eta - c.ann));
    return K.done + (1 - K.done) * clamp((year - eta) / T.lag);
  }

  /* Effective priced-in share x completion odds, with scrapping handled explicitly.
   * Before a project is scrapped the market priced it at its pre-scrap stage/credibility; from the
   * scrap year the premium unwinds (about 60% gone in year one, almost all by year three). */
  function eff(c, year, scen = "base") {
    if (c.scrapYear) {
      const pre = Object.assign({}, c, { scrapYear: 0, stage: c.preStage ?? 1, cred: c.preCred ?? 0.5, eta: c.preEta || c.eta });
      if (year < c.scrapYear) return realisation(pre, year, "base") * completionP(pre, "base");
      const v = realisation(pre, c.scrapYear - 1, "base") * completionP(pre, "base");
      return v * Math.exp(-(year - c.scrapYear + 1) / 1.1);
    }
    return realisation(c, year, scen) * completionP(c, scen);
  }
  function uncert(c, year, scen) { return c.scrapYear ? 0 : (1 - completionP(c, scen)) * realisation(c, year, scen); }

  /* Land leverage: the same project moves cheap rural land far more (in %) than built-up urban land.
   * Calibrated on Devanahalli / Yamuna Expressway (rural, 2-3x excess) vs Ulwe / Dwarka Expwy (urban, 1.2-1.4x). */
  function leverage(u) {
    const L = BL.LEVERAGE;
    if (!L) return 1;
    return L.a + L.b * (1 - u);
  }

  /* ---------------- Fundamentals ---------------- */
  function urbanGravity(lat, lon, areaKm2 = 0) {
    const spread = 0.3 * Math.sqrt(Math.max(areaKm2, 0));
    let best = 0, rest = 0, nearest = null, nearestD = Infinity;
    for (const a of BL.ANCHORS) {
      const d = hav(lat, lon, a.lat, a.lon);
      if (d < nearestD) { nearestD = d; nearest = a; }
      const dEff = Math.max(0, d - 0.35 * spread);
      // Large districts average city land with a lot of rural land: dilute the urban pull.
      const dil = areaKm2 > 0 ? Math.min(1, Math.pow((Math.PI * a.r * a.r * 1.5) / areaKm2, 0.5)) : 1;
      const v = a.p * dil * Math.exp(-dEff / (a.r + spread * 0.5));
      if (v > best) { rest += best; best = v; } else rest += v;
    }
    return { urban: best + 0.2 * rest, nearest, nearestD };
  }

  function catalystWeight(c, lat, lon, areaKm2 = 0) {
    const T = BL.TYPES[c.t] || BL.TYPES.expressway;
    const d = distToCatalyst(c, lat, lon);
    const half = 0.4 * Math.sqrt(Math.max(areaKm2, 0));
    const dEff = Math.max(0, d - half);
    const decay = Math.exp(-dEff / T.r);
    const footprint = c.pt ? Math.PI * T.r * T.r * 3 : T.r * 120;
    const dil = areaKm2 > 0 ? Math.min(1, Math.pow(footprint / Math.max(areaKm2, 30), 0.35)) : 1;
    const w = T.U * decay * dil;
    return { d, w };
  }

  /* ---------------- Real-data calibration ----------------
   * Verified price points (registered sales, govt auctions) pull the modelled surface
   * toward reality: residual r = ln(real / model) is spread with an exponential kernel
   * (about 9 km) and shrinks back to zero where there is no evidence.
   */
  let CAL = [];
  // Spatial buckets (0.4 deg) so thousands of village points stay fast.
  let BUCK = new Map();
  const bk = (lat, lon) => Math.floor(lat / 0.4) + ":" + Math.floor(lon / 0.4);
  function nearCal(lat, lon) {
    const out = [], i0 = Math.floor(lat / 0.4), j0 = Math.floor(lon / 0.4);
    for (let i = i0 - 2; i <= i0 + 2; i++) for (let j = j0 - 2; j <= j0 + 2; j++) { const b = BUCK.get(i + ":" + j); if (b) for (const c of b) out.push(c); }
    return out;
  }
  function setCalibration(points, catalysts) {
    CAL = []; BUCK = new Map();
    for (const p of points || []) {
      if (!(p.price > 0)) continue;
      const m = buildModel("cal", p.loc || "cal", p.state || "", p.lat, p.lon, 0, catalysts, true);
      const c = { lat: p.lat, lon: p.lon, real: p.price, model: m.basePrice, res: Math.log(p.price / m.basePrice), w: p.w || 1, loc: p.loc };
      CAL.push(c);
      const k = bk(p.lat, p.lon); if (!BUCK.has(k)) BUCK.set(k, []); BUCK.get(k).push(c);
    }
    return CAL;
  }
  function calibFactor(lat, lon) {
    if (!CAL.length) return 1;
    let num = 0, den = 0.3;
    for (const c of nearCal(lat, lon)) {
      if (Math.abs(c.lat - lat) > 0.8 || Math.abs(c.lon - lon) > 0.8) continue;
      const d = hav(lat, lon, c.lat, c.lon);
      const k = c.w * Math.exp(-d / 9);
      num += k * c.res; den += k;
    }
    return Math.exp(num / den);
  }
  /* Explain the real-data adjustment at a point: which verified points pulled it, and how hard. */
  function calibContrib(lat, lon, top = 5) {
    const list = []; let den = 0.3;
    for (const c of nearCal(lat, lon)) {
      if (Math.abs(c.lat - lat) > 0.8 || Math.abs(c.lon - lon) > 0.8) continue;
      const d = hav(lat, lon, c.lat, c.lon), k = c.w * Math.exp(-d / 9);
      den += k; list.push({ loc: c.loc, d, k, real: c.real, model: c.model, res: c.res });
    }
    list.sort((a, b) => b.k - a.k);
    return { factor: calibFactor(lat, lon), priorShare: 0.3 / den, top: list.slice(0, top).map((x) => Object.assign(x, { share: x.k / den })) };
  }
  function calibrationEvidence(lat, lon) {
    let s = 0;
    for (const c of nearCal(lat, lon)) { const d = hav(lat, lon, c.lat, c.lon); s += c.w * Math.exp(-d / 9); }
    return s;
  }

  /* ---------------- Preparation (static, cached) ---------------- */
  function buildModel(id, name, state, lat, lon, area, catalysts, raw) {
    const st = stateOf(state);
    const h = hash01(name + "|" + state);
    const h2 = hash01(state + "#" + name);
    const rural = (st.agri * 1e5) / SQFT_PER_ACRE * (0.75 + 0.5 * h);
    const g0 = urbanGravity(lat, lon, area);
    const urban = g0.urban * (0.85 + 0.3 * h2);
    const u = 1 - Math.exp(-urban / 1500);
    const uL = clamp(Math.log10(Math.max(rural + urban, 1) / 50) / Math.log10(400));
    const lev = leverage(uL);
    const links = [];
    for (const c of catalysts) {
      const cw = catalystWeight(c, lat, lon, area);
      if (cw.w * lev > 0.004) links.push({ c, w: cw.w * lev, d: cw.d });
    }
    links.sort((a, b) => b.w - a.w);
    return {
      lev,
      id, name, state, lat, lon, area, st, h, h2, rural, urban, u,
      nearest: g0.nearest, nearestD: g0.nearestD,
      basePrice: (rural + urban) * (raw || area > 0 ? 1 : calibFactor(lat, lon)),
      modelPrice: rural + urban,
      g: st.g + 0.012 * u + (h - 0.5) * 0.012,
      links
    };
  }

  /* District price = median of the calibrated point surface over the district polygon. */
  function calibrateDistricts(models, features, catalysts) {
    const changed = [];
    if (!CAL.length) return changed;
    const fById = new Map(features.map((f) => [f.properties.id, f]));
    for (const m of models) {
      let near = false;
      for (const c of nearCal(m.lat, m.lon)) if (hav(m.lat, m.lon, c.lat, c.lon) < 70) { near = true; break; }
      if (!near) continue;
      const f = fById.get(m.id); if (!f) continue;
      const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
      let ring = polys[0][0], best = 0;
      for (const p of polys) { const a = polyAreaKm2(p[0]); if (a > best) { best = a; ring = p[0]; } }
      const { pts } = sampleGrid(ring, 160);
      const vals = pts.map(([lon, lat]) => buildModel("g", m.name + lon + lat, m.state, lat, lon, 0, [], false).basePrice).sort((a, b) => a - b);
      const med = vals[Math.floor(vals.length / 2)];
      const ev = calibrationEvidence(m.lat, m.lon);
      if (!(med > 0)) continue;
      const old = m.basePrice;
      m.basePrice = med;
      m.calibrated = true; m.oldPrice = old; m.evidence = ev;
      changed.push({ id: m.id, name: m.name, state: m.state, old, now: med });
    }
    return changed;
  }

  function prepare(features, catalysts) {
    return features.map((f) => {
      const p = f.properties;
      return buildModel(p.id, p.n, p.s, p.lat, p.lon, p.a || 0, catalysts);
    });
  }

  // Re-link catalysts only (used by the ripple simulator).
  function relink(models, catalysts) {
    for (const m of models) {
      m.links = [];
      for (const c of catalysts) {
        const cw = catalystWeight(c, m.lat, m.lon, m.area);
        const lev = m.lev || 1;
        if (cw.w * lev > 0.004) m.links.push({ c, w: cw.w * lev, d: cw.d });
      }
      m.links.sort((a, b) => b.w - a.w);
    }
  }

  /* ---------------- Evaluation ---------------- */
  function E(m, year, scen) {
    let s = 0;
    for (const L of m.links) s += L.w * eff(L.c, year, scen);
    return s;
  }

  function priceAt(m, year, scen = "base") {
    const sc = BL.SCENARIOS[scen] || BL.SCENARIOS.base;
    const MY = BL.MODEL_YEAR;
    const g = year > MY ? m.g + sc.gAdj : m.g;
    // Multiplicative per project: an already-priced-in project cancels out exactly instead of diluting other growth.
    const sy = year > MY ? scen : "base";
    let r = 1;
    for (const L of m.links) r *= (1 + L.w * eff(L.c, year, sy)) / (1 + L.w * eff(L.c, MY, "base"));
    return m.basePrice * Math.pow(1 + g, year - MY) * r;
  }

  function sigmaAt(m, year, scen = "base") {
    const MY = BL.MODEL_YEAR;
    if (year <= MY) return 0;
    let unc = 0;
    for (const L of m.links) unc += L.w * uncert(L.c, year, scen);
    const liqPenalty = 0.03 * (1 - m.u);
    return 0.045 * Math.sqrt(year - MY) + 0.9 * unc + liqPenalty;
  }

  function series(m, scen = "base") {
    const out = [];
    for (let y = BL.YEAR_MIN; y <= BL.YEAR_MAX; y++) {
      const p = priceAt(m, y, scen);
      const s = sigmaAt(m, y, scen);
      out.push({ y, p, lo: Math.max(p * 0.35, p * (1 - 1.28 * s)), hi: p * (1 + 1.28 * s) });
    }
    return out;
  }

  function contributions(m, horizon = 5, scen = "base") {
    const MY = BL.MODEL_YEAR, Y = MY + horizon;
    const sc = BL.SCENARIOS[scen] || BL.SCENARIOS.base;
    const p0 = m.basePrice;
    const e0 = E(m, MY, "base");
    const fund = Math.pow(1 + m.g + sc.gAdj, horizon);
    const parts = [{ label: "Market drift and city spillover", v: fund - 1, kind: "fund" }];
    for (const L of m.links.slice(0, 8)) {
      const dE = L.w * (eff(L.c, Y, scen) - eff(L.c, MY, "base"));
      const v = fund * dE / (1 + e0);
      if (Math.abs(v) > 0.002) parts.push({ label: L.c.n, v, kind: L.c.t, c: L.c, d: L.d });
    }
    const total = priceAt(m, Y, scen) / p0 - 1;
    return { parts, total };
  }

  function riskOf(m) {
    const st = m.st;
    const n = (k) => hash01(m.name + k) - 0.5;
    const heatBand = Math.exp(-(((m.lat - 25) / 5.5) ** 2)) * (m.lon < 86 ? 1 : 0.55);
    const coastal = (m.lat < 23 && (m.lon < 74.2 || m.lon > 79.6)) ? 0.15 : 0;
    const flood = clamp(st.flood * 0.75 + coastal + n("f") * 0.3);
    const heat = clamp(0.2 + 0.6 * heatBand + n("h") * 0.2);
    const water = clamp(st.water * 0.85 + 0.15 * m.u + n("w") * 0.25);
    const title = clamp(st.title * 0.75 + (1 - st.dig) * 0.25 + n("t") * 0.2);
    const reg = clamp(st.reg * (1 - 0.4 * m.u));
    const total = 100 * (0.22 * flood + 0.15 * heat + 0.2 * water + 0.28 * title + 0.15 * reg);
    return { flood, heat, water, title, reg, total };
  }

  function momentum(m, scen = "base") {
    let s = 0;
    for (const L of m.links) if (!L.c.scrapYear && (L.c.stage < 4 || L.c.eta >= BL.MODEL_YEAR - 1)) s += L.w * completionP(L.c, scen) * (1 - realisation(L.c, BL.MODEL_YEAR, "base"));
    return s;
  }

  function featuresFor(m, cagr) {
    return [
      clamp((Math.log10(Math.max(m.basePrice, 10)) - 1.5) / 3),
      clamp(momentum(m) / 0.5),
      clamp(m.u),
      clamp((cagr - 0.04) / 0.1)
    ];
  }

  function analogueFor(vec) {
    let best = null, bd = Infinity;
    const w = [1.2, 1.4, 1.0, 0.8];
    for (const a of BL.ANALOGUES) {
      let d = 0;
      for (let i = 0; i < 4; i++) d += w[i] * (vec[i] - a.f[i]) ** 2;
      if (d < bd) { bd = d; best = a; }
    }
    return { a: best, similarity: clamp(1 - Math.sqrt(bd) / 1.6) };
  }

  /* Evaluate every model for a year / horizon / scenario. Adds display fields. */
  function evaluate(models, opts = {}) {
    const year = opts.year ?? BL.MODEL_YEAR;
    const H = opts.horizon ?? 5;
    const scen = opts.scenario || "base";
    const MY = BL.MODEL_YEAR;
    for (const m of models) {
      m.price = priceAt(m, year, scen);
      m.priceNow = m.basePrice;
      const fut = priceAt(m, MY + H, scen);
      m.mult = fut / m.priceNow;
      m.cagr = Math.pow(m.mult, 1 / H) - 1;
      const s = sigmaAt(m, MY + H, scen);
      m.lo = m.mult * Math.max(0.35, 1 - 1.28 * s);
      m.hi = m.mult * (1 + 1.28 * s);
      m.circle = m.ov && m.ov.circle ? m.ov.circle : m.priceNow * m.st.cg * (0.9 + 0.2 * m.h2);
      m.gap = 1 - m.circle / m.priceNow;
      m.risk = riskOf(m);
      m.liq = 100 * clamp(0.12 + 0.6 * m.u + 0.15 * m.st.dig + 0.13 * m.h);
      m.mom = momentum(m, scen);
      m.vec = featuresFor(m, m.cagr);
      m.raw = m.cagr - 0.025 * m.vec[0] - 0.06 * (m.risk.total / 100) + 0.025 * m.gap + 0.02 * (m.liq / 100) + 0.05 * clamp(m.mom / 0.5) - 0.02 * Math.max(0, m.hi - m.lo - 1);
    }
    // Opportunity score: logistic of the z-score, capped at 3-95 so nothing reads as a "certain" 100.
    const n = models.length;
    const mu = models.reduce((s, m) => s + m.raw, 0) / Math.max(1, n);
    const sd = Math.sqrt(models.reduce((s, m) => s + (m.raw - mu) ** 2, 0) / Math.max(1, n)) || 1;
    BL.OPP_STATS = { mu, sd };
    for (const m of models) m.opp = oppScore(m.raw);
    return models;
  }

  function oppScore(raw) {
    const st = BL.OPP_STATS || { mu: 0.06, sd: 0.02 };
    const z = (raw - st.mu) / (st.sd || 1);
    return Math.round(Math.max(3, Math.min(95, 100 / (1 + Math.exp(-1.25 * z)))));
  }

  /* ---------------- Point model (area analysis, hotspots) ---------------- */
  function nearestState(lat, lon, models) {
    let best = null, bd = Infinity;
    for (const m of models) {
      const d = (m.lat - lat) ** 2 + ((m.lon - lon) * Math.cos(toRad(lat))) ** 2;
      if (d < bd) { bd = d; best = m; }
    }
    return best;
  }

  function pointModel(lat, lon, catalysts, models, opts = {}) {
    const near = nearestState(lat, lon, models);
    const state = near ? near.state : "";
    const m = buildModel("pt", `${lat.toFixed(3)},${lon.toFixed(3)}`, state, lat, lon, 0, catalysts);
    const H = opts.horizon ?? 5, scen = opts.scenario || "base";
    m.price = priceAt(m, opts.year ?? BL.MODEL_YEAR, scen);
    m.mult = priceAt(m, BL.MODEL_YEAR + H, scen) / m.basePrice;
    m.cagr = Math.pow(m.mult, 1 / H) - 1;
    m.district = near ? near.name : "";
    return m;
  }

  /* ---------------- Geometry helpers for selections ---------------- */
  function pointInPoly(lon, lat, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
      if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  function polyAreaKm2(ring) {
    if (ring.length < 3) return 0;
    const lat0 = ring.reduce((s, p) => s + p[1], 0) / ring.length;
    const kx = 111.32 * Math.cos(toRad(lat0)), ky = 110.57;
    let a = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += (ring[j][0] * kx) * (ring[i][1] * ky) - (ring[i][0] * kx) * (ring[j][1] * ky);
    return Math.abs(a / 2);
  }

  function circleRing(lon, lat, rKm, n = 64) {
    const out = [];
    for (let i = 0; i <= n; i++) {
      const t = (i / n) * 2 * Math.PI;
      out.push([lon + (rKm / (111.32 * Math.cos(toRad(lat)))) * Math.cos(t), lat + (rKm / 110.57) * Math.sin(t)]);
    }
    return out;
  }

  function sampleGrid(ring, maxPts = 900) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [x, y] of ring) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
    const area = polyAreaKm2(ring);
    let step = Math.sqrt(Math.max(area, 0.01) / maxPts) / 111;
    step = Math.max(step, 0.004);
    const pts = [];
    for (let y = minY + step / 2; y < maxY; y += step)
      for (let x = minX + step / 2; x < maxX; x += step)
        if (pointInPoly(x, y, ring)) pts.push([x, y]);
    if (!pts.length) {
      const cx = ring.reduce((s, p) => s + p[0], 0) / ring.length, cy = ring.reduce((s, p) => s + p[1], 0) / ring.length;
      pts.push([cx, cy]);
    }
    return { pts, step };
  }

  /* Full area analysis for a drawn polygon ring [[lon,lat],...] */
  function analyseArea(ring, catalysts, models, opts = {}) {
    const { pts, step } = sampleGrid(ring, opts.maxPts || 700);
    const H = opts.horizon ?? 5;
    const cells = pts.map(([lon, lat]) => {
      const pm = pointModel(lat, lon, catalysts, models, opts);
      return { lon, lat, price: pm.basePrice, cagr: pm.cagr, mult: pm.mult, district: pm.district, state: pm.state, top: pm.links[0] ? pm.links[0].c.n : null };
    });
    const prices = cells.map((c) => c.price).sort((a, b) => a - b);
    const q = (p) => prices[Math.min(prices.length - 1, Math.floor(p * (prices.length - 1)))];
    const mean = (arr) => arr.reduce((s, v) => s + v, 0) / Math.max(1, arr.length);
    const districts = {};
    for (const c of cells) districts[c.district + "|" + c.state] = (districts[c.district + "|" + c.state] || 0) + 1;
    const inside = catalysts.filter((c) => {
      if (c.pt) return pointInPoly(c.pt[0], c.pt[1], ring);
      if (c.path) return c.path.some((p) => pointInPoly(p[0], p[1], ring));
      if (c.ring) return circleRing(c.ring.lon, c.ring.lat, c.ring.rdeg * 111, 36).some((p) => pointInPoly(p[0], p[1], ring));
      return false;
    });
    const nearby = catalysts
      .map((c) => ({ c, d: Math.min(...ring.map((p) => distToCatalyst(c, p[1], p[0]))) }))
      .filter((x) => !inside.includes(x.c) && x.d < (BL.TYPES[x.c.t]?.r || 10) * 2.5)
      .sort((a, b) => a.d - b.d)
      .slice(0, 6);
    const hotspots = [...cells].sort((a, b) => b.cagr - a.cagr).slice(0, 5);
    const value = [...cells].sort((a, b) => a.price / a.mult - b.price / b.mult).slice(0, 5);
    return {
      areaKm2: polyAreaKm2(ring), acres: polyAreaKm2(ring) * 247.105, step, n: cells.length, cells,
      priceMean: mean(cells.map((c) => c.price)), p10: q(0.1), p50: q(0.5), p90: q(0.9),
      cagrMean: mean(cells.map((c) => c.cagr)), multMean: mean(cells.map((c) => c.mult)),
      districts: Object.entries(districts).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ name: k.split("|")[0], state: k.split("|")[1], share: v / cells.length })),
      inside, nearby, hotspots, value, horizon: H
    };
  }

  /* Hotspot grid around catalysts and anchors (for the heat layer). */
  function hotspotGrid(catalysts, models, opts = {}) {
    const seeds = [];
    for (const c of catalysts) {
      if (c.pt) seeds.push([c.pt[0], c.pt[1], (BL.TYPES[c.t]?.r || 10) * 2.2]);
      else if (c.path) for (let i = 0; i < c.path.length - 1; i++) {
        const a = c.path[i], b = c.path[i + 1];
        const segKm = hav(a[1], a[0], b[1], b[0]);
        const k = Math.max(1, Math.round(segKm / 40));
        for (let j = 0; j <= k; j++) seeds.push([a[0] + ((b[0] - a[0]) * j) / k, a[1] + ((b[1] - a[1]) * j) / k, 22]);
      } else if (c.ring) for (const p of circleRing(c.ring.lon, c.ring.lat, c.ring.rdeg * 111, 16)) seeds.push([p[0], p[1], 20]);
    }
    const seen = new Set(), out = [];
    const step = opts.step || 0.06;
    for (const [lon, lat, rKm] of seeds) {
      const rDeg = rKm / 111;
      for (let y = lat - rDeg; y <= lat + rDeg; y += step)
        for (let x = lon - rDeg; x <= lon + rDeg; x += step) {
          const key = Math.round(x / step) + ":" + Math.round(y / step);
          if (seen.has(key)) continue;
          seen.add(key);
          const gx = Math.round(x / step) * step, gy = Math.round(y / step) * step;
          if (hav(gy, gx, lat, lon) > rKm) continue;
          let up = 0;
          for (const c of catalysts) {
            const cw = catalystWeight(c, gy, gx, 0);
            if (!c.scrapYear) up += cw.w * completionP(c, opts.scenario) * (1 - realisation(c, BL.MODEL_YEAR, "base"));
          }
          if (up > 0.03) out.push({ lon: +gx.toFixed(3), lat: +gy.toFixed(3), up });
        }
    }
    return out;
  }

  /* Tamil Nadu village guideline values -> low-weight derived evidence rows. */
  function expandTNVillages(rows, mult) {
    return (rows || []).map((r) => {
      const [v, sro, dist, lat, lon, gmin, gmax, gmed, streets, fuzzy, path, rm, rbasis] = r;
      const gv = gmed || Math.round(Math.sqrt(gmin * gmax));
      const m = rm || mult;
      const src = "https://proquiro.com/tools/tamil-nadu-guideline-value/" + path;
      return {
        loc: v, district: dist, taluk: sro + " SRO", state: "Tamil Nadu", lat, lon, land: "plot",
        govt_sqyd: gv * 9, govt_date: "2026-10", govt_src: src,
        govt_note: `TNREGINET guideline values, ${streets} streets, Rs${gmin}-${gmax}/sq ft` + (gmed ? `, median Rs${gmed}` : `, value used = midpoint Rs${gv}`) + (fuzzy ? ". Location matched approximately by name." : "."),
        derived: true, type: "derived_gv", price: Math.round(gv * m), txn_sqyd: Math.round(gv * m) * 9, w: gmed ? 0.06 : 0.04,
        low: Math.round(gmin * m), high: Math.round(gmax * m), mult: m, multBasis: rbasis || "state default",
        date: "2026-10", retrieved: "2026-10-25", src,
        method: `Official street guideline Rs${gmin}-${gmax}/sq ft (${gmed ? "median Rs" + gmed : "midpoint Rs" + gv}) x ${dist} market-to-guideline multiple ${m} (${rbasis || "state default"}).`,
        note: `Derived: guideline Rs${gv}/sq ft x ${dist} multiple ${m}`, village: true, path
      };
    });
  }

  // Cross-checked evidence localities -> verified points. Only 'asserted' ones carry a price into the model.
  function expandEvidence(ev) {
    if (!ev || !ev.localities) return [];
    const disc = 0.9;
    return ev.localities.map((o) => {
      const ok = o.status === "asserted";
      const sale = Math.round(o.typ * disc);
      const g = o.guideline && !o.guideline.unreliable ? ` Official guideline nearby Rs${o.guideline.rs_sqft}/sq ft; implied multiple ${o.multiple}.` : "";
      return {
        loc: o.loc, district: (o.guideline && o.guideline.district) || "", state: o.state, lat: o.lat, lon: o.lon, land: "plot",
        type: ok ? "consensus" : "unverified", price: ok ? sale : 0, txn_sqyd: (ok ? sale : o.typ) * 9, w: ok ? 1.0 : 0,
        low: o.low, high: o.high, typ: o.typ, status: o.status, nSites: o.n_sites, nAgree: o.n_agree, nPoints: o.n_points,
        sources: o.sources, official: o.official, siteMedians: o.site_medians, evidenceId: o.id,
        date: ev.method.asof, retrieved: ev.method.asof, src: (o.sources[0] || {}).url || "",
        method: ok
          ? `Cross-checked: ${o.n_agree} of ${o.n_sites} sites agree (${o.n_points} listings). Typical asking Rs${o.typ}/sq ft (median of agreeing sites), range Rs${o.low}-${o.high} (20th-80th percentile); x0.9 asking-to-sale = Rs${sale}/sq ft used in model.${g}`
          : `Not asserted: ${o.status === "single-source" ? "only one site reports prices here" : `only ${o.n_agree} of ${o.n_sites} sites agree`}. Shown for reference; not used in the model.`,
        note: `${o.status}; geocode: ${o.geo}`
      };
    });
  }

  // Land-type values for a TN village (official class rate x fitted district multiple), with confidence + method.
  function landTypeFor(path, district) {
    const LT = (typeof window !== "undefined" ? window : globalThis).BL_LANDTYPE; if (!LT || !path) return null;
    const v = LT.villages[path]; if (!v) return null;
    const out = {};
    const pick = (t) => { const d = LT.districts[t][district]; return d && d.asserted ? { m: d.multiple, conf: d.confidence, basis: `${district} fit (${d.n_agree} of ${d.n_sites} sites agree, ${d.n_listings} listings)` } : { m: LT.state[t], conf: "Low", basis: `state median of ${LT.state[t + "_n"]} fitted districts (no cross-checked ${t} data for ${district})` }; };
    if (v[0]) { const p = pick("farm"); out.farm = { guide: v[0], value: Math.round(v[0] * p.m), unit: "Rs/acre", mult: p.m, conf: p.conf, method: `Official farm guideline Rs${v[0].toLocaleString("en-IN")}/acre (village median of wet/dry classes) x farm market-to-guideline multiple ${p.m} (${p.basis}).`, ratio: (LT.districts.farm[district] || {}).farm_to_res }; }
    if (v[1]) { const p = pick("comm"); out.comm = { guide: v[1], value: Math.round(v[1] * p.m), unit: "Rs/sq ft", mult: p.m, conf: p.conf, method: `Official commercial guideline Rs${v[1]}/sq ft (highest commercial class) x commercial multiple ${p.m} (${p.basis}).` }; }
    out.rev = v[2]; return out;
  }

  BL.Engine = {
    landTypeFor, expandTNVillages, expandEvidence,
    hav, segDist, distToCatalyst, eff, hash01, completionP, realisation, effEta, urbanGravity, catalystWeight,
    prepare, relink, evaluate, priceAt, sigmaAt, series, contributions, riskOf, momentum, analogueFor,
    pointModel, pointInPoly, polyAreaKm2, circleRing, sampleGrid, analyseArea, hotspotGrid, clamp, SQFT_PER_ACRE,
    setCalibration, calibFactor, calibContrib, calibrationEvidence, calibrateDistricts, oppScore, buildModel
  };
})(typeof window !== "undefined" ? window : globalThis);
