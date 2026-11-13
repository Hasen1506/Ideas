/* Bhoomi Lens - application layer (map, panels, tools). */
(function () {
  "use strict";
  const BL = window.BL, E = BL.Engine, C = BL.Charts;
  const { fmtINR, pct, esc } = C;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const MY = BL.MODEL_YEAR;
  const clamp = E.clamp;
  const LINE_TYPES = ["expressway", "metro", "hsr", "freight", "ring"];

  /* ------------------------------------------------------------------ */
  /* Layer definitions                                                    */
  /* ------------------------------------------------------------------ */
  const RAMPS = {
    price: ["#0d1b2a", "#16324f", "#1f5c84", "#2a8f9e", "#5fc08e", "#c8e06a", "#ffd166", "#ff9a4d", "#ff5c7a"],
    growth: ["#0f1222", "#1d2550", "#33307f", "#5b2ea6", "#9335c4", "#d045c0", "#ff6aa0", "#ffa27a", "#ffd9a0"],
    opp: ["#0a121c", "#0f2e33", "#0f5550", "#0f8a78", "#14b89a", "#62d98a", "#b9ec6b", "#f3f27a", "#fffbd0"],
    risk: ["#0b1a14", "#123d27", "#2f6b1f", "#7a9a14", "#d6a70d", "#f2771b", "#e2402b", "#b51d3a", "#6e0f2a"],
    liq: ["#0b1220", "#11264a", "#163f77", "#1d5fa6", "#2a85cf", "#43aee6", "#6fd3f4", "#a8ecfb", "#e4fbff"],
    gap: ["#120d1f", "#26184a", "#3f2575", "#5d339f", "#7e45c4", "#a35ddf", "#c47ff0", "#e0a9f8", "#f6dbff"],
    impact: ["#b9414c", "#a95454", "#886061", "#655d65", "#444d59", "#386e6f", "#329996", "#2ec1b0", "#79ead0"]
  };
  const LAYERS = {
    price: { label: "Price", title: "Estimated market price", norm: (m) => (Math.log10(Math.max(m.price, 5)) - 1) / 3.5, val: (m) => fmtINR(m.price) + " / sq ft", ll: ["\u20B910", "\u20B9300", "\u20B930k+"] },
    growth: { label: "Growth", title: "Modelled growth per year", norm: (m) => (m.cagr - 0.035) / 0.09, val: (m) => pct(m.cagr) + " / yr", ll: ["3.5%", "8%", "12.5%+"] },
    opp: { label: "Opportunity", title: "Modelled opportunity score", norm: (m) => m.opp / 100, val: (m) => m.opp + " / 100", ll: ["0", "50", "100"] },
    risk: { label: "Risk", title: "Modelled composite risk", norm: (m) => (m.risk.total - 22) / 36, val: (m) => Math.round(m.risk.total) + " / 100", ll: ["Low", "Medium", "High"] },
    liq: { label: "Liquidity", title: "Modelled liquidity score", norm: (m) => m.liq / 100, val: (m) => Math.round(m.liq) + " / 100", ll: ["Lower score", "", "Higher score"] },
    gap: { label: "Circle gap", title: "Modelled circle-rate gap", norm: (m) => (m.gap - 0.3) / 0.3, val: (m) => "modelled gap " + Math.round(m.gap * 100) + "%", ll: ["30%", "45%", "60%"] },
    impact: { label: "Sim impact", title: "Assumed scenario change", norm: (m) => clamp((m.delta + 0.5) / 1.0), val: (m) => pct(m.delta), ll: ["-50%", "0%", "+50%"] }
  };
  const TOOLS = [
    { id: "explore", label: "Explore and insights", icon: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5" stroke="currentColor" stroke-width="1.8" fill="none"/>' },
    { id: "draw", label: "Draw an area", icon: '<path d="M5 18l3-11 9 2 2 8z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-dasharray="3 2"/><circle cx="5" cy="18" r="2" fill="currentColor"/><circle cx="8" cy="7" r="2" fill="currentColor"/><circle cx="17" cy="9" r="2" fill="currentColor"/><circle cx="19" cy="17" r="2" fill="currentColor"/>' },
    { id: "simulate", label: "Ripple simulator", icon: '<circle cx="12" cy="12" r="2.5" fill="currentColor"/><circle cx="12" cy="12" r="6" fill="none" stroke="currentColor" stroke-width="1.6" opacity=".7"/><circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" stroke-width="1.4" opacity=".4"/>' },
    { id: "catalysts", label: "Catalyst tracker", icon: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round"/>' },
    { id: "screener", label: "Screener", icon: '<path d="M4 5h16l-6 7.5V19l-4-2v-4.5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>' },
    { id: "shortlist", label: "Infra-led shortlist", icon: '<path d="M4 6h16M4 12h10M4 18h6" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round"/><path d="M17 15l2 2 3-4" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round"/>' },
    { id: "alerts", label: "Spot alerts", icon: '<path d="M6 16V11a6 6 0 1112 0v5l1.5 2h-15z M10 20a2 2 0 004 0" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>' },
    { id: "track", label: "Track record", icon: '<path d="M4 19h16M6 16l4-5 3 3 5-7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>' },
    { id: "housing", label: "Housing index sources", icon: '<path d="M3 11l9-7 9 7M5 10v9h14v-9M9 19v-5h6v5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>' },
    { id: "data", label: "Data sources and freshness", icon: '<ellipse cx="12" cy="5" rx="7" ry="2.5" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M5 5v7c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V5M5 12v7c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-7" fill="none" stroke="currentColor" stroke-width="1.7"/>' },
    "sep",
    { id: "watchlist", label: "Watchlist and signals", icon: '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>' },
    { id: "compare", label: "Compare districts", icon: '<path d="M4 6h7v13H4zM13 10h7v9h-7z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>' },
    { id: "method", label: "How the model works", icon: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M9.5 9.5a2.5 2.5 0 114 2c-.9.6-1.5 1.1-1.5 2.2M12 17h.01" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round"/>' }
  ];

  /* ------------------------------------------------------------------ */
  /* State                                                                */
  /* ------------------------------------------------------------------ */
  const store = {
    get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } },
    set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };
  const S = {
    layer: "price", year: MY, horizon: 5, scenario: "base",
    tool: null, sel: null, three: false, sat: false, recent: false, imageYear: null, heat: false, zones: false,
    userCats: [], watch: store.get("bl_watch", []), compare: store.get("bl_compare", []),
    playing: false, draw: null, placing: null, area: null, catFilter: "all", catStage: "all",
    simType: "airport", simEffect: 25, simProbability: 50, simDistance: 20, simPricedIn: 35, simYear: MY + 5, hoverId: null, radiusKm: 10, loc: null, real: false, proj: false, tint: true, labels: false,
    scr: { state: "all", sort: "opp", maxRisk: 100, maxPrice: 0 }, tnCpiArea: "Tamil Nadu"
  };
  const opts = () => ({ year: S.year, horizon: S.horizon, scenario: S.scenario });
  const allCats = () => BL.CATALYSTS.concat(S.userCats);
  const catById = (id) => allCats().find((c) => c.id === id);
  const influenceRadius = (c) => c.user && Number.isFinite(c.assumedDistance) ? c.assumedDistance : BL.TYPES[c.t].r;

  const GEO = window.BL_DISTRICTS;
  const STATES_GEO = window.BL_STATES_GEO;
  const OVR = window.BL_OVERRIDES || {};
  if (window.BL_PROJECTS && window.BL_PROJECTS.length) BL.CATALYSTS = window.BL_PROJECTS;
  window.BL_VERIFIED = (window.BL_VERIFIED || []).filter((p) => !/SRO villages \(/.test(p.loc || ""))
    .concat(E.expandTNVillages(window.BL_TN_VILLAGES, ((window.BL_EVIDENCE || {}).multiples || {}).state || 2.3))
    .concat(E.expandEvidence(window.BL_EVIDENCE));
  (function downweightOldListings() {
    const cons = window.BL_VERIFIED.filter((p) => p.type === "consensus");
    for (const p of window.BL_VERIFIED) {
      if (p.type !== "listing" || !p.price) continue;
      if (cons.some((c) => E.hav(c.lat, c.lon, p.lat, p.lon) < 3)) { p.w = Math.min(p.w || 0.5, 0.2); p.superseded = true; }
    }
  })();
  const VERIFIED = window.BL_VERIFIED;
  E.setCalibration(VERIFIED.filter((p) => p.price > 0), BL.CATALYSTS);
  let models = E.prepare(GEO.features, BL.CATALYSTS);
  E.calibrateDistricts(models, GEO.features, BL.CATALYSTS);
  (function realCircleRatio() {
    const ratios = E.observedCircleRatios(VERIFIED);
    if (ratios.overall == null) return;
    for (const m of models) if (m.calibrated) m.st = Object.assign({}, m.st, { cg: ratios.states[m.state] ?? ratios.overall });
  })();
  for (const m of models) {
    const o = OVR[m.name + "|" + m.state];
    if (o) { m.ov = o; if (o.price) m.basePrice = o.price; }
  }
  const byId = new Map(models.map((m) => [m.id, m]));
  const featById = new Map(GEO.features.map((f) => [f.properties.id, f]));

  function recompute() {
    if (S.userCats.length) {
      E.relink(models, BL.CATALYSTS);
      E.evaluate(models, opts());
      for (const m of models) m.baseMult = m.mult;
      E.relink(models, allCats());
    } else if (models[0] && models[0].links.some((l) => l.c.user)) {
      E.relink(models, BL.CATALYSTS);
    }
    E.evaluate(models, opts());
    for (const m of models) m.delta = S.userCats.length ? m.mult / m.baseMult - 1 : 0;
  }

  /* ------------------------------------------------------------------ */
  /* Map                                                                  */
  /* ------------------------------------------------------------------ */
  const loader = document.createElement("div");
  loader.className = "loader";
  loader.innerHTML = '<div><div class="ring"></div><p>Loading the land of India</p></div>';
  document.body.appendChild(loader);

  const sub = ["a", "b", "c", "d"];
  const map = new maplibregl.Map({
    container: "map",
    // Key-free basemap: OpenFreeMap (OpenStreetMap vector tiles, no API key, no sign-up).
    style: "https://tiles.openfreemap.org/styles/dark",
    center: [80.5, 22.6], zoom: 4.15, minZoom: 3.2, maxZoom: 15.5,
    maxBounds: [[55, -2], [106, 42]],
    attributionControl: { compact: true },
    dragRotate: true
  });
  map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
  const FALLBACK_STYLE = { version: 8, sources: {}, layers: [{ id: "bg", type: "background", paint: { "background-color": "#0b1222" } }] };
  let mapReady = false;
  setTimeout(() => { if (!mapReady) { console.warn("Basemap slow or unavailable - using plain background"); map.setStyle(FALLBACK_STYLE); } }, 10000);
  let BEFORE;
  map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-right");

  // meters-per-pixel aware radius (km -> px) for circles and corridor widths
  const kmPx = (prop, mul = 1) => ["interpolate", ["exponential", 2], ["zoom"],
    0, ["/", ["*", ["get", prop], 1000 * mul], 147150],
    22, ["/", ["*", ["get", prop], 1000 * mul], 147150 / Math.pow(2, 22)]];

  const ramp = (key) => {
    const cols = RAMPS[key], out = ["interpolate", ["linear"], ["coalesce", ["feature-state", "v"], 0]];
    cols.forEach((c, i) => out.push(i / (cols.length - 1), c));
    return out;
  };

  const gridRamp = (key) => {
    const cols = RAMPS[key], out = ["interpolate", ["linear"], ["get", "v"]];
    cols.forEach((c, i) => out.push(i / (cols.length - 1), c));
    return out;
  };
  // Keep the paint expression zoom-and-feature dependent for every lens.
  // Changing between composite and source-only expressions while vector tiles
  // are loading can leave MapLibre with an incompatible render binder.
  function districtOpacity(layer, base) {
    const hov = (on, off) => ["case", ["boolean", ["feature-state", "hover"], false], on, off];
    if (layer === "price" || layer === "growth") return ["interpolate", ["linear"], ["zoom"], 7.2, hov(0.94, base), 8.2, hov(0.12, 0.06), 12, hov(0.04, 0.03), 16, 0];
    return ["interpolate", ["linear"], ["zoom"], 7.2, hov(0.94, base), 16, hov(0.94, base)];
  }
  function verifiedFC() {
    return { type: "FeatureCollection", features: (window.BL_VERIFIED || []).map((p, i) => ({ type: "Feature", properties: { i, type: p.price ? p.type : "govt" }, geometry: { type: "Point", coordinates: [p.lon, p.lat] } })) };
  }
  function catLineFC() {
    const fs = [];
    for (const c of allCats()) {
      const T = BL.TYPES[c.t];
      let coords = null;
      if (c.path) coords = c.path;
      else if (c.ring) coords = E.circleRing(c.ring.lon, c.ring.lat, c.ring.rdeg * 111, 96);
      if (!coords) continue;
      fs.push({ type: "Feature", properties: { id: c.id, t: c.t, color: T.color, rkm: influenceRadius(c), op: c.stage >= 4 ? 1 : 0, user: c.user ? 1 : 0 }, geometry: { type: "LineString", coordinates: coords } });
    }
    return { type: "FeatureCollection", features: fs };
  }
  function catPtFC() {
    return { type: "FeatureCollection", features: allCats().filter((c) => c.pt).map((c) => ({ type: "Feature", properties: { id: c.id, t: c.t, color: BL.TYPES[c.t].color, rkm: influenceRadius(c) }, geometry: { type: "Point", coordinates: c.pt } })) };
  }
  function heatFC() {
    const pts = E.hotspotGrid(allCats(), models, { scenario: S.scenario });
    return { type: "FeatureCollection", features: pts.map((p) => ({ type: "Feature", properties: { up: p.up }, geometry: { type: "Point", coordinates: [p.lon, p.lat] } })) };
  }
  const emptyFC = () => ({ type: "FeatureCollection", features: [] });

  map.on("load", () => {
    if (mapReady) return;
    mapReady = true;
    const sty = map.getStyle() || { layers: [] };
    const firstSym = (sty.layers || []).find((l) => l.type === "symbol");
    BEFORE = firstSym ? firstSym.id : undefined;
    const add = (l) => map.addLayer(l, BEFORE);
    map.addSource("sat", { type: "raster", tiles: ["https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2025_3857/default/g/{z}/{y}/{x}.jpg"], tileSize: 256, maxzoom: 14, attribution: 'Sentinel-2 cloudless 2025 © <a href="https://maps.eox.at/" target="_blank" rel="noopener">EOX</a>, contains modified Copernicus Sentinel data 2025' });
    add({ id: "sat", type: "raster", source: "sat", layout: { visibility: "none" }, paint: { "raster-opacity": 0.95 } });
    map.addSource("districts", { type: "geojson", data: GEO });
    map.addSource("grid", { type: "geojson", data: emptyFC() });
    map.addSource("verified", { type: "geojson", data: verifiedFC() });
    map.addSource("verified-agg", { type: "geojson", data: (() => { // evidence counted per ~0.4 degree cell, shown until zoom 9
      const g = new Map(); (window.BL_VERIFIED || []).forEach((p) => { if (!p.lat) return; const k = Math.floor(p.lat / 0.4) + "," + Math.floor(p.lon / 0.4); const c = g.get(k) || { n: 0, la: 0, lo: 0 }; c.n++; c.la += p.lat; c.lo += p.lon; g.set(k, c); });
      return { type: "FeatureCollection", features: [...g.values()].map((c) => ({ type: "Feature", properties: { n: c.n, t: c.n >= 1000 ? Math.round(c.n / 100) / 10 + "k" : String(c.n) }, geometry: { type: "Point", coordinates: [c.lo / c.n, c.la / c.n] } })) }; })() });
    map.addSource("states", { type: "geojson", data: STATES_GEO });
    map.addSource("farm", { type: "geojson", data: { type: "FeatureCollection", features: VERIFIED.map((p, i) => ({ p, i })).filter((x) => x.p.village).map((x) => { const lt = E.landTypeFor(x.p.path, x.p.district); return lt && lt.farm ? { type: "Feature", properties: { i: x.i, v: lt.farm.value / 1e5, c: lt.farm.conf }, geometry: { type: "Point", coordinates: [x.p.lon, x.p.lat] } } : null; }).filter(Boolean) } });
    map.addSource("catLines", { type: "geojson", data: catLineFC() });
    map.addSource("catPts", { type: "geojson", data: catPtFC() });
    map.addSource("heat", { type: "geojson", data: emptyFC() });
    map.addSource("cells", { type: "geojson", data: emptyFC() });
    map.addSource("draw", { type: "geojson", data: emptyFC() });

    add({ id: "d-fill", type: "fill", source: "districts", paint: {
      "fill-color": ramp("price"),
      "fill-opacity": districtOpacity("price", 0.74),
      "fill-opacity-transition": { duration: 200 }
    } });
    add({ id: "d-ext", type: "fill-extrusion", source: "districts", layout: { visibility: "none" }, paint: {
      "fill-extrusion-color": ramp("price"),
      "fill-extrusion-height": ["*", ["coalesce", ["feature-state", "h"], 0], 140000],
      "fill-extrusion-opacity": 0.88
    } });
    add({ id: "grid-fill", type: "fill", source: "grid", paint: { "fill-color": gridRamp("price"), "fill-opacity": ["interpolate", ["linear"], ["zoom"], 7.2, 0, 8.2, 0.5, 11, 0.4, 13, 0.28, 14.5, 0.14, 16, 0.06], "fill-outline-color": "rgba(0,0,0,0)" } });
    add({ id: "d-line", type: "line", source: "districts", paint: { "line-color": "rgba(255,255,255,0.07)", "line-width": ["interpolate", ["linear"], ["zoom"], 4, 0.3, 8, 1] } });
    add({ id: "s-line", type: "line", source: "states", paint: { "line-color": "rgba(220,230,255,0.28)", "line-width": ["interpolate", ["linear"], ["zoom"], 4, 0.8, 8, 1.8] } });
    add({ id: "heat", type: "heatmap", source: "heat", layout: { visibility: "none" }, paint: {
      "heatmap-weight": ["interpolate", ["linear"], ["get", "up"], 0, 0, 0.6, 1],
      "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 3, 0.7, 9, 2.2],
      "heatmap-radius": ["interpolate", ["exponential", 2], ["zoom"], 3, 6, 6, 18, 10, 90],
      "heatmap-opacity": 0.85,
      "heatmap-color": ["interpolate", ["linear"], ["heatmap-density"], 0, "rgba(0,0,0,0)", 0.15, "rgba(46,230,197,0.35)", 0.4, "#2ee6c5", 0.65, "#ffd166", 0.85, "#ff7a59", 1, "#ff3d6e"]
    } });
    add({ id: "cat-glow", type: "line", source: "catLines", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": ["get", "color"], "line-width": kmPx("rkm", 2), "line-opacity": 0.09, "line-blur": 6 } });
    add({ id: "cat-case", type: "line", source: "catLines", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#05070f", "line-width": ["interpolate", ["linear"], ["zoom"], 4, 3.6, 10, 7.5], "line-opacity": 0.85 } });
    add({ id: "cat-line-op", type: "line", source: "catLines", filter: ["==", ["get", "op"], 1], layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": ["get", "color"], "line-width": ["interpolate", ["linear"], ["zoom"], 4, 1.6, 10, 4] } });
    add({ id: "cat-line-uc", type: "line", source: "catLines", filter: ["==", ["get", "op"], 0], layout: { "line-join": "round" }, paint: { "line-color": ["get", "color"], "line-width": ["interpolate", ["linear"], ["zoom"], 4, 1.6, 10, 4], "line-dasharray": [2, 1.5] } });
    add({ id: "cat-infl", type: "circle", source: "catPts", minzoom: 8, paint: { "circle-radius": kmPx("rkm"), "circle-color": ["get", "color"], "circle-opacity": 0.07, "circle-stroke-color": ["get", "color"], "circle-stroke-opacity": 0.45, "circle-stroke-width": 1, "circle-pitch-alignment": "map" } });
    add({ id: "cells", type: "circle", source: "cells", paint: {
      "circle-radius": ["interpolate", ["exponential", 2], ["zoom"], 5, 1.5, 9, 4, 12, 12],
      "circle-color": ["interpolate", ["linear"], ["get", "g"], 0.03, "#33307f", 0.07, "#d045c0", 0.11, "#ffa27a", 0.15, "#fff3c4"],
      "circle-opacity": 0.85, "circle-stroke-width": 0
    } });
    add({ id: "draw-fill", type: "fill", source: "draw", filter: ["==", ["geometry-type"], "Polygon"], paint: { "fill-color": "#ffb547", "fill-opacity": 0.08 } });
    add({ id: "draw-line", type: "line", source: "draw", filter: ["!=", ["geometry-type"], "Point"], paint: { "line-color": "#ffb547", "line-width": 2, "line-dasharray": [2, 1] } });
    add({ id: "draw-pt", type: "circle", source: "draw", filter: ["==", ["geometry-type"], "Point"], paint: { "circle-radius": 4.5, "circle-color": "#0a0f1a", "circle-stroke-color": "#ffb547", "circle-stroke-width": 2 } });
    map.addLayer({ id: "d-sel", type: "line", source: "districts", filter: ["==", ["get", "id"], -1], paint: { "line-color": "#ffffff", "line-width": 2.4 } });
    map.addSource("catFocus", { type: "geojson", data: emptyFC() });
    map.addLayer({ id: "cat-hl-zone", type: "fill", source: "catFocus", filter: ["==", ["get", "k"], "zone"], paint: { "fill-color": "#ffd166", "fill-opacity": 0.08 } });
    map.addLayer({ id: "cat-hl-buf", type: "line", source: "catFocus", filter: ["all", ["==", ["get", "k"], "geom"], ["==", ["geometry-type"], "LineString"]], layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#ffd166", "line-width": kmPx("rkm", 2), "line-opacity": 0.1 } });
    map.addLayer({ id: "cat-hl-line", type: "line", source: "catFocus", filter: ["==", ["geometry-type"], "LineString"], layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#ffd166", "line-width": ["interpolate", ["linear"], ["zoom"], 4, 4, 10, 9], "line-opacity": 0.95, "line-blur": 0.5 } });
    // Dense evidence dots are grouped into counted bubbles until zoom 11; click a bubble to zoom in.
    map.addLayer({ id: "verified-cl", type: "circle", source: "verified-agg", maxzoom: 9, layout: { visibility: "none" }, paint: { "circle-color": "#2ee6c5", "circle-opacity": 0.25, "circle-stroke-color": "#2ee6c5", "circle-stroke-width": 1.5, "circle-radius": ["step", ["get", "n"], 9, 10, 13, 50, 18, 200, 24] } });
    try { map.addLayer({ id: "verified-cl-n", type: "symbol", source: "verified-agg", maxzoom: 9, layout: { visibility: "none", "text-field": ["get", "t"], "text-size": 11, "text-allow-overlap": true, "text-font": ["Noto Sans Regular"] }, paint: { "text-color": "#e8eefc" } }); } catch (e) { console.warn("cluster labels unavailable", e); }
    map.on("click", "verified-cl", (ev) => { const f = ev.features[0]; map.easeTo({ center: f.geometry.coordinates, zoom: Math.max(9.2, map.getZoom() + 2.5) }); });
    map.on("mouseenter", "verified-cl", () => { map.getCanvas().style.cursor = "pointer"; }); map.on("mouseleave", "verified-cl", () => { map.getCanvas().style.cursor = ""; });
    map.addLayer({ id: "verified", type: "circle", source: "verified", minzoom: 9, layout: { visibility: "none" }, paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 3, 9, 6.5, 13, 10],
      "circle-color": ["match", ["get", "type"], "govt_auction", "#ffd166", "govt_allotment", "#ffb547", "registered", "#2ee6c5", "reported_deal", "#2ee6c5", "listing", "#c9d3e6", "derived_gv", "#7f8aa3", "#b98cff"],
      "circle-stroke-color": "#0a0f1a", "circle-stroke-width": 2, "circle-opacity": 0.95 } });
    map.addLayer({ id: "farm", type: "circle", source: "farm", minzoom: 8, layout: { visibility: "none" }, paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 6, 3, 10, 6, 13, 9],
      "circle-color": ["interpolate", ["linear"], ["get", "v"], 10, "#3b6e3b", 40, "#7bc96f", 80, "#e7d36a", 150, "#f39c4a", 300, "#e0484f"],
      "circle-stroke-color": ["match", ["get", "c"], "High", "#ffffff", "Medium", "#bbbbbb", "#555555"], "circle-stroke-width": 1.2, "circle-opacity": 0.9 } });
    map.on("click", "farm", (ev) => { const f = ev.features[0]; if (f) verifiedPopup(f.properties.i); });
    map.addLayer({ id: "d-sel-glow", type: "line", source: "districts", filter: ["==", ["get", "id"], -1], paint: { "line-color": "#ffb547", "line-width": 9, "line-opacity": 0.35, "line-blur": 6 } });

    // Clean first view: projects, zones and evidence dots start hidden; chips turn them on.
    ["cat-glow", "cat-line-op", "cat-line-uc", "cat-infl"].forEach((l) => map.setLayoutProperty(l, "visibility", "none"));
    // Make basemap place names readable over the price colours.
    for (const l of (map.getStyle().layers || [])) if (l.type === "symbol") {
      try { map.setPaintProperty(l.id, "text-color", "#eef2fb"); map.setPaintProperty(l.id, "text-halo-color", "rgba(7,11,20,0.92)"); map.setPaintProperty(l.id, "text-halo-width", 1.6); } catch (e) {}
    }
    // Basemap place names and their dots start hidden for a clean map; the "Labels" chip turns them on.
    S.baseSyms = (map.getStyle().layers || []).filter((l) => l.type === "symbol" && !/^(cat|d-|grid|verified|farm|draw)/.test(l.id)).map((l) => l.id);
    const setLabels = () => S.baseSyms.forEach((id) => { try { map.setLayoutProperty(id, "visibility", S.labels ? "visible" : "none"); } catch (e) {} });
    setLabels();
    $("#btnLabels").addEventListener("click", (e) => { S.labels = !S.labels; e.currentTarget.classList.toggle("on", S.labels); setLabels(); });
    // Infra layers: all off by default; one chip opens a menu of opt-in layers so the base map stays clean.
    if (BL.Infra) {
      BL.Infra.addLayers(map, BEFORE);
      const menu = $("#infraMenu"), btn = $("#btnInfra");
      const paint = () => { menu.innerHTML = BL.Infra.menuHtml(); btn.classList.toggle("on", Object.keys(BL.Infra.LAYERS).some((k) => BL.Infra.isOn(k))); };
      btn.addEventListener("click", (e) => { e.stopPropagation(); const open = menu.classList.toggle("hidden") === false; btn.setAttribute("aria-expanded", open); if (open) paint(); });
      menu.addEventListener("click", (e) => e.stopPropagation());
      menu.addEventListener("change", (e) => { const k = e.target.dataset.ixToggle; if (k) { BL.Infra.setLayer(map, k, e.target.checked); paint(); } });
      document.addEventListener("click", () => { menu.classList.add("hidden"); btn.setAttribute("aria-expanded", "false"); });
      document.addEventListener("click", (e) => { const l = e.target.closest && e.target.closest("[data-ix]"); if (l) { e.preventDefault(); BL.Infra.setLayer(map, l.dataset.ix, true); paint(); toast(BL.Infra.LAYERS[l.dataset.ix].desc); } });
      BL.Infra.onStatus = (t) => { const st = menu.querySelector(".ix-status"); if (st) st.textContent = t; toast(t); };
      BL.Infra.onPick = (html, ll) => { if (ll) new maplibregl.Popup({ maxWidth: "320px" }).setLngLat(ll).setHTML(html).addTo(map); };
    }
    recompute();
    paint();
    buildMarkers();
    bindMapEvents();
    map.on("moveend", () => { scheduleGrid(); scheduleRecent(); });
    map.on("error", (e) => { if (e.sourceId === "sat-recent" && (S.recent || S.imageYear != null)) imageryStatus(S.imageYear != null ? "Past image tiles could not load. Grey areas have no displayed imagery; try again later." : "Recent image tiles could not load. The 2025 mosaic remains underneath; try again later."); });
    readHash();
    loader.classList.add("done");
    setTimeout(() => loader.remove(), 600);
    if (!store.get("bl_intro", false) && !S.loc && S.sel == null) $("#intro").classList.remove("hidden");
  });

  /* ---------------- Fine price surface (zoom >= 7.2) ---------------- */
  const BOX = new Map();
  function fBox(f) {
    if (BOX.has(f)) return BOX.get(f);
    const b = [180, 90, -180, -90];
    const walk = (c) => { if (typeof c[0] === "number") { if (c[0] < b[0]) b[0] = c[0]; if (c[1] < b[1]) b[1] = c[1]; if (c[0] > b[2]) b[2] = c[0]; if (c[1] > b[3]) b[3] = c[1]; } else c.forEach(walk); };
    walk(f.geometry.coordinates); BOX.set(f, b); return b;
  }
  function insideIndia(lon, lat, cand) {
    for (const f of cand) {
      const b = fBox(f); if (lon < b[0] || lon > b[2] || lat < b[1] || lat > b[3]) continue;
      const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
      for (const p of polys) if (E.pointInPoly(lon, lat, p[0])) return true;
    }
    return false;
  }
  const GRID_LENSES = ["price", "growth"];
  let gridT = null;
  function scheduleGrid() { clearTimeout(gridT); gridT = setTimeout(buildGrid, 220); }
  function buildGrid() {
    const src = map.getSource && map.getSource("grid"); if (!src) return;
    if (map.getZoom() < 7.2 || !GRID_LENSES.includes(S.layer)) { src.setData(emptyFC()); return; }
    const b = map.getBounds();
    const w = b.getWest(), e = b.getEast(), n = b.getNorth(), so = b.getSouth();
    // Cover the whole viewport (plus one cell of padding) with ~2,800 cells, clipped to India's land boundary.
    const step = Math.sqrt(((e - w) * (n - so)) / 2800);
    const x0 = Math.floor(w / step) * step - step, y0 = Math.floor(so / step) * step - step;
    const cols = Math.ceil((e - x0) / step) + 1, rows = Math.ceil((n - y0) / step) + 1;
    const L = LAYERS[S.layer], fs = [], cats = allCats();
    const cand = GEO.features.filter((f) => { const b = fBox(f); return !(b[2] < w - step || b[0] > e + step || b[3] < so - step || b[1] > n + step); });
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const lon = x0 + (c + 0.5) * step, lat = y0 + (r + 0.5) * step;
      if (!insideIndia(lon, lat, cand)) continue;
      const pm = E.pointModel(lat, lon, cats, models, opts());
      if (!pm) continue;
      const v = clamp(L.norm({ price: S.year === MY ? pm.basePrice : E.priceAt(pm, S.year, S.scenario), cagr: pm.cagr }));
      const h = step / 2;
      fs.push({ type: "Feature", properties: { v }, geometry: { type: "Polygon", coordinates: [[[lon - h, lat - h], [lon + h, lat - h], [lon + h, lat + h], [lon - h, lat + h], [lon - h, lat - h]]] } });
    }
    src.setData({ type: "FeatureCollection", features: fs });
  }

  function paint() {
    const L = LAYERS[S.layer];
    for (const m of models) {
      const v = clamp(L.norm(m));
      const h = clamp((Math.log10(Math.max(m.price, 5)) - 1) / 3.5);
      map.setFeatureState({ source: "districts", id: m.id }, { v, h: S.layer === "price" ? Math.pow(h, 2.2) : Math.pow(v, 1.6) * 0.6 });
    }
    map.setPaintProperty("d-fill", "fill-color", ramp(S.layer));
    map.setPaintProperty("d-ext", "fill-extrusion-color", ramp(S.layer));
    const base = S.sat ? 0.42 : S.proj ? 0.5 : 0.74; // dimmer when project lines are on so they stay readable
    // Hover highlight fades with zoom for the detailed price and growth grids.
    map.setPaintProperty("d-fill", "fill-opacity", districtOpacity(S.layer, base));
    if (map.getLayer("grid-fill")) map.setPaintProperty("grid-fill", "fill-color", gridRamp(GRID_LENSES.includes(S.layer) ? S.layer : "price"));
    scheduleGrid();
    renderLegend();
    if (S.sel != null) renderDetail();
    else if (S.loc) renderLocation();
    if (S.tool) refreshPanel();
    writeHash();
  }

  /* ------------------------------------------------------------------ */
  /* Catalyst markers                                                     */
  /* ------------------------------------------------------------------ */
  const markers = new Map();
  function markerPos(c) {
    if (c.pt) return c.pt;
    if (c.path) return c.path[Math.floor((c.path.length - 1) / 2)];
    if (c.ring) return [c.ring.lon, c.ring.lat + c.ring.rdeg];
    return null;
  }
  function buildMarkers() {
    for (const [, mk] of markers) mk.remove();
    markers.clear();
    for (const c of allCats()) {
      const T = BL.TYPES[c.t];
      const wrap = document.createElement("div");
      const el = document.createElement("div");
      wrap.appendChild(el);
      el.className = "cat-mk" + (c.user ? " user" : "") + (c.stage < 2 || c.cancelled ? " dim" : "");
      el.style.background = T.color;
      el.style.color = T.color;
      el.innerHTML = `<span style="color:#0a0f1a">${esc(T.icon)}</span>`;
      el.title = c.n;
      wrap.addEventListener("click", (ev) => { ev.stopPropagation(); if (S.draw || S.placing) return; focusCatalyst(c.id); });
      const mk = new maplibregl.Marker({ element: wrap, anchor: "center" }).setLngLat(markerPos(c)).addTo(map);
      markers.set(c.id, mk);
    }
    setMarkerVisibility();
  }
  function setMarkerVisibility() {
    for (const c of allCats()) {
      const mk = markers.get(c.id); if (!mk) continue;
      if (!S.proj && !c.user) { mk.getElement().style.display = "none"; continue; }
      const okT = S.catFilter === "all" || S.catFilter === c.t || (S.catFilter === "roads" && (c.t === "expressway" || c.t === "ring"));
      const okS = S.catStage === "all" || String(c.stage) === S.catStage;
      mk.getElement().style.display = okT && okS ? "" : "none";
    }
  }
  function applyTypeFilter() { // Projects chip picker + Catalyst tracker share S.catFilter; lines and rings follow it too
    const tf = S.catFilter === "all" ? null : S.catFilter === "roads" ? ["in", ["get", "t"], ["literal", ["expressway", "ring"]]] : ["==", ["get", "t"], S.catFilter];
    [["cat-glow", null], ["cat-case", null], ["cat-line-op", ["==", ["get", "op"], 1]], ["cat-line-uc", ["==", ["get", "op"], 0]], ["cat-infl", null]].forEach(([id, base]) => { if (!map.getLayer(id)) return; const f = [base, tf].filter(Boolean); map.setFilter(id, f.length ? (f.length === 1 ? f[0] : ["all", ...f]) : null); });
  }
  function refreshCatalystSources() {
    if (!map.getSource("catLines")) return;
    map.getSource("catLines").setData(catLineFC());
    map.getSource("catPts").setData(catPtFC());
    if (S.heat) map.getSource("heat").setData(heatFC());
    buildMarkers();
  }

  let popup = null;
  function catPopupHTML(c) {
    const T = BL.TYPES[c.t];
    const p = E.completionP(c, S.scenario), eta = E.effEta(c, S.scenario);
    return `<div style="min-width:240px;max-width:290px">
      <div class="row"><span class="cat-ico" style="background:${T.color}">${esc(T.icon)}</span><div class="grow"><b>${esc(c.n)}</b><div class="small muted">${esc(T.label)} | ${esc(c.ag || "")}</div></div></div>
      <div class="row sb" style="margin:10px 0 6px">${c.user ? '<span class="tag">Your hypothetical project</span>' : c.cancelled ? '<span class="tag down">Cancelled / dropped</span>' : C.stage(c.stage) + `<span class="small muted">${esc(BL.STAGES[c.stage])}</span>`}</div>
      ${c.path ? c.user ? '<div class="small muted" style="margin:4px 0">This route was drawn by you and is not an official alignment.</div>' : '<div class="small muted" style="margin:4px 0">Line drawn from published alignment maps: approximate, not the surveyed route. Turn on Infra layers > Expressway routes (live) for mapped geometry.</div>' : ""}${c.cancelled ? "" : `<div class="row sb small"><span class="muted">Assumed completion probability</span><b>${Math.round(p * 100)}%</b></div><div class="small muted">${c.user ? "Chosen by you for this scenario." : "Heuristic model input; not a validated probability."}</div>`}
      ${c.cancelled ? "" : `<div class="row sb small"><span class="muted">${c.user ? "Assumed completion year" : `${c.stage >= 4 ? "Opened" : "Expected"} (${esc(BL.SCENARIOS[S.scenario].label)})`}</span><b>${eta}</b></div>`}
      ${c.user ? `<div class="small muted">Assumed effect at project ${pct(c.assumedEffect)}; distance scale ${c.assumedDistance} km; ${Math.round(c.assumedPricedIn * 100)}% already reflected.</div>` : `<div class="row sb small"><span class="muted">Agency credibility</span><b>${Math.round(c.cred * 100)} / 100</b></div>`}
      ${c.cancelled ? '<div class="small down" style="margin-top:6px"><b>Cancelled / dropped.</b> The model assumes its project contribution unwinds; the actual price effect is unknown.</div>' : ""}
      ${c.status ? `<p class="small" style="margin:8px 0 0;line-height:1.5">${esc(c.status)}</p>` : ""}
      <p class="small muted" style="margin:6px 0 0;line-height:1.5">${esc(c.note || "")}</p>
      ${c.events && c.events.length ? `<div class="small" style="margin-top:8px"><b>Timeline</b>${c.events.slice(-5).map((ev) => `<div class="row" style="gap:6px;padding:2px 0"><span class="muted" style="width:54px;flex:none">${esc(ev.date)}</span><span class="${/scrap|cancel|delay|halt|stay/.test(ev.kind) ? "down" : /open/.test(ev.kind) ? "up" : ""}">${esc(ev.kind.replace(/_/g, " "))}</span><span class="muted grow">${ev.src ? `<a href="${esc(ev.src)}" target="_blank" rel="noopener">${esc(ev.note || "source")}</a>` : esc(ev.note || "")}</span></div>`).join("")}</div>` : ""}
      ${c.src ? `<div class="small" style="margin-top:6px">Status as of ${esc(c.asof || BL.DATA_ASOF)} | <a href="${esc(c.src)}" target="_blank" rel="noopener">Source</a>${c.src2 ? ` | <a href="${esc(c.src2)}" target="_blank" rel="noopener">Source 2</a>` : ""}</div>` : ""}
      ${c.user ? `<button class="btn sm danger" style="margin-top:8px" data-act="sim-remove" data-id="${esc(c.id)}">Remove simulated project</button>` : ""}
    </div>`;
  }
  function focusCatalyst(id) {
    const c = catById(id); if (!c) return;
    S.focusCat = id;
    if (!S.proj) $("#btnProj").click();
    const T = BL.TYPES[c.t];
    const fs = [];
    if (c.pt) fs.push({ type: "Feature", properties: { k: "zone" }, geometry: { type: "Polygon", coordinates: [E.circleRing(c.pt[0], c.pt[1], influenceRadius(c) * 1.5, 72)] } });
    const g = c.pt ? { type: "Point", coordinates: c.pt } : { type: "LineString", coordinates: c.path || E.circleRing(c.ring.lon, c.ring.lat, c.ring.rdeg * 111, 96) };
    fs.push({ type: "Feature", properties: { k: "geom", color: T.color, rkm: influenceRadius(c) * 1.5 }, geometry: g });
    if (map.getSource("catFocus")) map.getSource("catFocus").setData({ type: "FeatureCollection", features: fs });
    for (const [cid, mk] of markers) mk.getElement().style.opacity = cid === id ? "1" : "0.35";
    if (map.getLayer("cat-hl-line")) map.setPaintProperty("cat-hl-line", "line-color", T.color);
    showProjectCard(c);
    if (popup) popup.remove();
    if (c.pt) map.flyTo({ center: c.pt, zoom: Math.max(map.getZoom(), 8.5), duration: 1200 });
    else {
      const pts = c.path || E.circleRing(c.ring.lon, c.ring.lat, c.ring.rdeg * 111, 24);
      const b = pts.reduce((bb, p) => bb.extend(p), new maplibregl.LngLatBounds(pts[0], pts[0]));
      map.fitBounds(b, { padding: padFor(), duration: 1200 });
    }
    popup = null;
    const mk = markers.get(id);
    const inner = mk && mk.getElement().firstChild;
    if (inner) { inner.classList.add("pulse"); setTimeout(() => inner.classList.remove("pulse"), 4000); }
  }

  function clearFocus() {
    S.focusCat = null;
    if (map.getSource("catFocus")) map.getSource("catFocus").setData(emptyFC());
    for (const [, mk] of markers) mk.getElement().style.opacity = "";
  }
  function showProjectCard(c) {
    const T = BL.TYPES[c.t];
    const hit = models.map((m) => { const L = m.links.find((l) => l.c.id === c.id); return L ? { m, d: L.d, up: L.w * (E.eff(c, MY + S.horizon, S.scenario) - E.eff(c, MY, "base")) } : null; }).filter(Boolean).sort((a, b) => c.user ? Math.abs(b.up) - Math.abs(a.up) : b.up - a.up).slice(0, 8);
    const pts = (window.BL_VERIFIED || []).map((p, i) => ({ p, i, d: E.distToCatalyst(c, p.lat, p.lon) })).filter((x) => x.d < influenceRadius(c) * 1.5).sort((a, b) => a.d - b.d).slice(0, 8);
    S.sel = null; S.loc = null;
    document.body.classList.add("detail-open"); $("#detail").classList.remove("hidden");
    $("#detailBody").innerHTML = `<div class="d-hero"><div class="kicker">${esc(T.label)} | ${esc(c.ag || "")}</div><h1 style="font-size:20px">${esc(c.n)}</h1>
      <div class="row" style="flex-wrap:wrap;gap:6px;margin-top:6px">${c.user ? `<span class="tag">Hypothetical | ${Math.round(E.completionP(c, S.scenario) * 100)}% assumed</span>` : `${c.cancelled ? "" : `<span class="tag">${esc(BL.STAGES[c.stage])}</span>`}${c.cancelled ? `<span class="tag down">Cancelled${c.scrapYear ? " " + c.scrapYear : ""}</span>` : `<span class="tag">${Math.round(E.completionP(c, S.scenario) * 100)}% assumed by ${E.effEta(c, S.scenario)}</span>`}${c.delays ? `<span class="tag warn">Delayed ${c.delays}x</span>` : ""}<span class="tag">as of ${esc(c.asof || BL.DATA_ASOF)}</span>`}</div>
      <div class="acts"><button class="icon-btn" data-act="clear-focus" title="Close"><svg viewBox="0 0 24 24" width="16" height="16"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button></div></div>
      <div class="d-body">${catPopupHTML(c)}
      ${(() => { const U = ((window.BL_UPDATES || {}).items || []).filter((u) => u.pid === c.id).slice(0, 6); return U.length ? `<h3>Latest leads from the weekly re-check</h3><div class="card small" style="padding:6px 12px">${U.map((u) => `<div style="padding:3px 0"><span class="muted">${esc(u.date || u.found)}</span> <a href="${esc(u.url)}" target="_blank" rel="noopener">${esc(u.title)}</a> ${(u.tags || []).map((t) => `<span class="tag" style="padding:0 5px">${esc(t)}</span>`).join("")}</div>`).join("")}<div class="muted" style="margin-top:4px">Automatic news matches, not yet confirmed. Project status only changes after a source is checked. Last run ${esc((window.BL_UPDATES || {}).gen || "")}.</div></div>` : ""; })()}
      <h3>Districts it moves most (next ${S.horizon} yrs)</h3>${hit.length ? hit.map((h, i) => listItem(h.m, i, `<span class="pill ${h.up < 0 ? "r" : ""}">${pct(h.up)}</span>`)).join("") : '<div class="empty">Effect too small at district level. Zoom in on the corridor.</div>'}
      ${pts.length ? `<h3>Reference data inside its reach</h3>${pts.map((x) => `<div class="list-item" data-act="verified" data-i="${x.i}"><div class="grow"><b>${esc(x.p.loc)}</b> <span class="small muted">${x.d.toFixed(1)} km | ${esc(TYPE_LABEL[x.p.type] || x.p.type || "official rate")}</span></div><span class="pill s">${x.p.txn_sqyd ? fmtINR(x.p.txn_sqyd / 9) + "/sq ft" : "govt " + fmtINR((x.p.govt_sqyd || x.p.govt_sqyd_agri) / 9)}</span></div>`).join("")}` : ""}
      <p class="small muted" style="margin-top:10px">The highlighted band is a model reference distance (about ${Math.round(influenceRadius(c) * 1.5)} km), not a measured boundary.</p></div>`;
    $("#detail").scrollTop = 0;
  }

  /* ------------------------------------------------------------------ */
  /* Map events: hover, click, drawing, placement                         */
  /* ------------------------------------------------------------------ */
  const tip = $("#tooltip");
  function bindMapEvents() {
    map.on("mousemove", "d-fill", (e) => {
      if (S.draw || S.placing) { hideTip(); return; }
      const f = e.features[0]; if (!f) return;
      const id = f.id ?? f.properties.id;
      if (S.hoverId !== id) {
        if (S.hoverId != null) map.setFeatureState({ source: "districts", id: S.hoverId }, { hover: false });
        S.hoverId = id;
        map.setFeatureState({ source: "districts", id }, { hover: true });
      }
      const m = byId.get(id); if (!m) return;
      const L = LAYERS[S.layer];
      tip.innerHTML = `<b>${esc(m.name)}</b> <span class="muted small">${esc(m.state)}</span><div class="tv">${esc(L.val(m))}</div><div class="small muted">${esc(L.title)}${S.layer === "price" && S.year !== MY ? " in " + S.year : ""}</div>`;
      tip.style.left = e.originalEvent.clientX + 14 + "px";
      tip.style.top = e.originalEvent.clientY + 14 + "px";
      tip.classList.add("show");
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", "d-fill", () => {
      if (S.hoverId != null) map.setFeatureState({ source: "districts", id: S.hoverId }, { hover: false });
      S.hoverId = null; hideTip();
      map.getCanvas().style.cursor = S.draw || S.placing ? "crosshair" : "";
    });
    map.on("click", (e) => {
      const ll = [e.lngLat.lng, e.lngLat.lat];
      if (S.draw) return drawClick(ll);
      if (S.placing) return placeClick(ll);
      if (map.getLayer("verified-cl") && map.queryRenderedFeatures(e.point, { layers: ["verified-cl"] }).some((f) => f.layer && f.layer.id === "verified-cl")) return; // bubble click only zooms
      const vf = map.getLayer("verified") ? map.queryRenderedFeatures(e.point, { layers: ["verified"] })[0] : null;
      if (vf) return verifiedPopup(vf.properties.i);
      const f = map.queryRenderedFeatures(e.point, { layers: ["d-fill"] })[0];
      if (f) openLocation(ll[0], ll[1]);
    });
    map.on("contextmenu", (e) => { if (S.draw || S.placing) return; e.preventDefault && e.preventDefault(); openLocation(e.lngLat.lng, e.lngLat.lat); });
    map.on("mouseenter", "verified", () => { map.getCanvas().style.cursor = "pointer"; });
    map.on("dblclick", (e) => {
      if (S.draw && S.draw.mode === "poly") { e.preventDefault(); finishPoly(); }
      else if (S.placing && S.placing.path) { e.preventDefault(); finishPlacement(); }
    });
    map.on("mousemove", (e) => {
      const ll = [e.lngLat.lng, e.lngLat.lat];
      if (S.draw) drawMove(ll);
      else if (S.placing && S.placing.path && S.placing.path.length) renderDraw(S.placing.path.concat([ll]), "line");
    });
  }
  function hideTip() { tip.classList.remove("show"); }

  /* ---------------- Drawing ---------------- */
  const hint = $("#drawHint");
  function showHint(html) { hint.innerHTML = html; hint.classList.remove("hidden"); }
  function hideHint() { hint.classList.add("hidden"); }
  function renderDraw(coords, kind) {
    const fs = [];
    if (kind === "poly" && coords.length >= 3) fs.push({ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [coords.concat([coords[0]])] } });
    if (coords.length >= 2) fs.push({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: kind === "poly" && coords.length >= 3 ? coords.concat([coords[0]]) : coords } });
    if (kind !== "ring") for (const c of coords) fs.push({ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: c } });
    map.getSource("draw").setData({ type: "FeatureCollection", features: fs });
  }
  function startDraw(mode) {
    cancelPlacement();
    S.draw = { mode, pts: [], a: null };
    map.doubleClickZoom.disable();
    map.getCanvas().style.cursor = "crosshair";
    const msg = { poly: "Click to add points. Double-click or press Enter to finish.", circle: "Click anywhere to drop a circle of the radius set in the panel.", rect: "Click one corner, then click the opposite corner." }[mode];
    showHint(`<b>Draw</b><span class="muted">${msg}</span><button class="btn sm ghost" data-act="draw-cancel">Cancel (Esc)</button>`);
    refreshPanel();
  }
  function cancelDraw() {
    if (!S.draw) return;
    S.draw = null; hideHint();
    map.getSource("draw").setData(emptyFC());
    map.getCanvas().style.cursor = "";
    setTimeout(() => map.doubleClickZoom.enable(), 300);
    refreshPanel();
  }
  function drawClick(ll) {
    const d = S.draw;
    if (d.mode === "poly") { d.pts.push(ll); renderDraw(d.pts, "poly"); }
    else if (d.mode === "circle") { finishArea(E.circleRing(ll[0], ll[1], S.radiusKm, 72)); }
    else if (!d.a) { d.a = ll; }
    else {
      const ring = d.mode === "circle" ? E.circleRing(d.a[0], d.a[1], Math.max(0.5, E.hav(d.a[1], d.a[0], ll[1], ll[0])), 72) : rectRing(d.a, ll);
      finishArea(ring);
    }
  }
  function drawMove(ll) {
    const d = S.draw;
    if (d.mode === "poly" && d.pts.length) renderDraw(d.pts.concat([ll]), "poly");
    else if (d.mode === "circle") {
      renderDraw(E.circleRing(ll[0], ll[1], S.radiusKm, 72).slice(0, -1), "poly");
    }
    else if (d.a) {
      if (d.mode === "circle") {
        const r = E.hav(d.a[1], d.a[0], ll[1], ll[0]);
        renderDraw(E.circleRing(d.a[0], d.a[1], Math.max(0.2, r), 72).slice(0, -1), "poly");
        showHint(`<b>Radius ${r.toFixed(1)} km</b><span class="muted">Click to finish</span><button class="btn sm ghost" data-act="draw-cancel">Cancel (Esc)</button>`);
      } else renderDraw(rectRing(d.a, ll).slice(0, -1), "poly");
    }
  }
  function rectRing(a, b) { return [[a[0], a[1]], [b[0], a[1]], [b[0], b[1]], [a[0], b[1]], [a[0], a[1]]]; }
  function finishPoly() {
    const d = S.draw; if (!d || d.pts.length < 3) { toast("Add at least three points"); return; }
    finishArea(d.pts.concat([d.pts[0]]));
  }
  function finishArea(ring) {
    S.draw = null; hideHint();
    map.getCanvas().style.cursor = "";
    setTimeout(() => map.doubleClickZoom.enable(), 300);
    renderDraw(ring.slice(0, -1), "poly");
    const t0 = performance.now();
    S.area = E.analyseArea(ring, allCats(), models, opts());
    if (!S.area) {
      map.getSource("draw").setData(emptyFC());
      map.getSource("cells").setData(emptyFC());
      toast("No mapped district land in this area. Select an area within India.");
      openTool("draw", true);
      return;
    }
    S.area.ring = ring;
    S.area.ms = Math.round(performance.now() - t0);
    setAreaCells(S.area);
    const b = ring.reduce((bb, p) => bb.extend(p), new maplibregl.LngLatBounds(ring[0], ring[0]));
    map.fitBounds(b, { padding: padFor(), duration: 900, maxZoom: 12 });
    openTool("draw", true);
  }
  function clearArea() {
    S.area = null;
    setAreaCells(null);
    map.getSource("draw").setData(emptyFC());
    refreshPanel();
  }

  /* ---------------- Simulator placement ---------------- */
  function startPlacement() {
    cancelDraw();
    const isLine = LINE_TYPES.includes(S.simType) && S.simType !== "ring";
    S.placing = { t: S.simType, path: isLine ? [] : null };
    map.doubleClickZoom.disable();
    map.getCanvas().style.cursor = "crosshair";
    const T = BL.TYPES[S.simType];
    showHint(isLine
      ? `<b>Route a ${esc(T.label.toLowerCase())}</b><span class="muted">Click points along the alignment. Double-click or Enter to finish.</span><button class="btn sm ghost" data-act="place-cancel">Cancel</button>`
      : `<b>Place a ${esc(T.label.toLowerCase())}</b><span class="muted">Click anywhere on the map.</span><button class="btn sm ghost" data-act="place-cancel">Cancel</button>`);
  }
  function cancelPlacement() {
    if (!S.placing) return;
    S.placing = null; hideHint();
    map.getSource("draw") && map.getSource("draw").setData(emptyFC());
    map.getCanvas().style.cursor = "";
    setTimeout(() => map.doubleClickZoom.enable(), 300);
  }
  function placeClick(ll) {
    if (S.placing.path) { S.placing.path.push(ll); renderDraw(S.placing.path, "line"); return; }
    if (S.placing.t === "ring") {
      addUserCat({ ring: { lon: ll[0], lat: ll[1], rdeg: 0.35 } });
    } else addUserCat({ pt: ll });
  }
  function finishPlacement() {
    const p = S.placing; if (!p || !p.path) return;
    if (p.path.length < 2) { toast("Add at least two points to the alignment"); return; }
    addUserCat({ path: p.path.slice() });
  }
  function addUserCat(geom) {
    const T = BL.TYPES[S.simType];
    const nameEl = $("#simName");
    const n = (nameEl && nameEl.value.trim()) || `Hypothetical ${T.label.toLowerCase()} #${S.userCats.length + 1}`;
    const c = Object.assign({ id: "u" + Date.now().toString(36), n, t: S.simType, stage: 1, ann: MY, eta: S.simYear, cred: 0.5, ag: "Your scenario", note: "A hypothetical project using your assumptions. Its effects and completion chance are not measured or validated.", user: true, assumedEffect: S.simEffect / 100, assumedProbability: S.simProbability / 100, assumedDistance: S.simDistance, assumedPricedIn: S.simPricedIn / 100 }, geom);
    S.userCats.push(c);
    cancelPlacement();
    if (nameEl) nameEl.value = "";
    recompute();
    refreshCatalystSources();
    if (S.area) reanalyse();
    S.layer = "impact"; renderLayerSeg();
    paint();
    ripple(markerPos(c));
    openTool("simulate", true);
    toast(`${c.n} added. The map shows a hypothetical change using your assumptions.`);
  }
  function removeUserCat(id) {
    S.userCats = S.userCats.filter((c) => c.id !== id);
    if (popup) popup.remove();
    recompute(); refreshCatalystSources(); if (S.area) reanalyse();
    if (!S.userCats.length && S.layer === "impact") { S.layer = "growth"; renderLayerSeg(); }
    paint();
  }
  function ripple(pos) {
    for (let i = 0; i < 3; i++) setTimeout(() => {
      const wrap = document.createElement("div"); const el = document.createElement("div"); el.className = "ripple"; wrap.appendChild(el);
      const mk = new maplibregl.Marker({ element: wrap, anchor: "center" }).setLngLat(pos).addTo(map);
      setTimeout(() => mk.remove(), 2300);
    }, i * 450);
  }

  /* ------------------------------------------------------------------ */
  /* Top bar, rail, legend, time machine                                  */
  /* ------------------------------------------------------------------ */
  function renderLayerSeg() {
    $("#layerSeg").innerHTML = Object.entries(LAYERS)
      .filter(([k]) => k !== "impact" || S.userCats.length)
      .map(([k, L], i) => `<button role="tab" class="${S.layer === k ? "on" : ""}" data-layer="${k}" title="${esc(L.title)} (${i + 1})">${esc(L.label)}</button>`).join("");
  }
  $("#layerSeg").addEventListener("click", (e) => { const b = e.target.closest("[data-layer]"); if (b) setLayer(b.dataset.layer); });
  function setLayer(k) {
    if (!LAYERS[k] || (k === "impact" && !S.userCats.length)) return;
    S.layer = k; renderLayerSeg(); paint();
    // Say what the colours now mean, so a lens switch is never "just new colours".
    const EXPL = { price: "Colours = modelled price estimates, not plot valuations.", growth: "Colours = modelled yearly growth for the chosen scenario and horizon.", opp: "Colours = a relative model score, not an investment recommendation.", risk: "Colours = heuristic district risk indicators, not site-specific assessments.", liq: "Colours = a model score based on assumptions, not measured deal volume or guaranteed resale.", gap: "Colours = a modelled difference between estimated circle and market rates, not an actual plot's official rate." };
    if (EXPL[k] && S.tint) toast(EXPL[k] + " Click any district for its numbers.");
    if (EXPL[k] && !S.tint) toast("Colours are off (Satellite or the Colours chip). Turn Colours on to see this lens.");
  }

  function renderRail() {
    $("#rail").innerHTML = TOOLS.map((t) => t === "sep" ? '<div class="sep"></div>' :
      `<button data-tool="${t.id}" class="${S.tool === t.id ? "on" : ""}" aria-label="${esc(t.label)}"><svg viewBox="0 0 24 24" width="20" height="20">${t.icon}</svg><span class="tip">${esc(t.label)}</span>${t.id === "watchlist" && S.watch.length ? `<span class="badge">${S.watch.length}</span>` : ""}${t.id === "compare" && S.compare.length ? `<span class="badge">${S.compare.length}</span>` : ""}</button>`).join("");
  }
  $("#rail").addEventListener("click", (e) => { const b = e.target.closest("[data-tool]"); if (b) openTool(b.dataset.tool); });

  function renderLegend() {
    const L = LAYERS[S.layer], cols = RAMPS[S.layer];
    const sub = S.layer === "price" ? (S.year === MY ? "today" : S.year < MY ? `modelled, ${S.year}` : `projected, ${S.year}`) : S.layer === "growth" ? `${S.horizon}-yr CAGR, ${BL.SCENARIOS[S.scenario].label.toLowerCase()} case` : "";
    $("#legend").innerHTML = `<div class="lt"><b>${esc(L.title)}</b><span>${esc(sub)}</span></div><div class="ramp" style="background:linear-gradient(90deg,${cols.join(",")})"></div><div class="ll">${L.ll.map((x) => `<span>${esc(x)}</span>`).join("")}</div>`;
  }

  const yearEl = $("#year");
  function setYear(y, fromSlider) {
    S.year = y; yearEl.value = y;
    $("#yearVal").textContent = y;
    $("#yearTag").textContent = y === MY ? "Today" : y < MY ? "Modelled past" : "Projected";
    const yb = $("#yearBanner");
    if (yb) { yb.classList.toggle("hidden", y === MY); $("#yearBannerText").textContent = y < MY ? `Map shows modelled prices in ${y}` : `Map shows projected prices in ${y} (${BL.SCENARIOS[S.scenario].label.toLowerCase()} case)`; }
    if (S.layer !== "price") { S.layer = "price"; renderLayerSeg(); if (fromSlider) toast("The time machine shows prices, so the map has switched to the price lens."); }
    E.evaluate(models, opts());
    for (const m of models) m.delta = S.userCats.length ? m.mult / (m.baseMult || m.mult) - 1 : 0;
    paint();
  }
  yearEl.addEventListener("input", () => setYear(+yearEl.value, true));
  let playT = null;
  $("#playBtn").addEventListener("click", () => {
    S.playing = !S.playing;
    $("#playIcon").innerHTML = S.playing ? '<path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" fill="currentColor"/>' : '<path d="M7 5l12 7-12 7z" fill="currentColor"/>';
    if (S.playing) {
      if (S.year >= BL.YEAR_MAX) setYear(BL.YEAR_MIN);
      playT = setInterval(() => {
        if (S.year >= BL.YEAR_MAX) { $("#playBtn").click(); return; }
        setYear(S.year + 1);
      }, 700);
    } else clearInterval(playT);
  });

  $("#scenario").addEventListener("change", (e) => { S.scenario = e.target.value; recompute(); setYear(S.year); if (S.heat) map.getSource("heat").setData(heatFC()); paint(); if (S.area) reanalyse(); });
  $("#horizon").addEventListener("change", (e) => { S.horizon = +e.target.value; recompute(); paint(); if (S.area) reanalyse(); });
  function setAreaCells(area) {
    map.getSource("cells").setData(area ? { type: "FeatureCollection", features: area.cells.map((c) => ({ type: "Feature", properties: { g: c.cagr, p: c.price }, geometry: { type: "Point", coordinates: [c.lon, c.lat] } })) } : emptyFC());
  }
  function reanalyse() {
    if (!S.area) return;
    const t0 = performance.now(), ring = S.area.ring;
    const area = E.analyseArea(ring, allCats(), models, opts());
    if (area) { S.area = area; S.area.ring = ring; S.area.ms = Math.round(performance.now() - t0); }
    else { S.area = null; toast("No mapped district land in this area. Select another area."); }
    setAreaCells(S.area);
    if (S.tool) refreshPanel();
  }

  $("#btn3d").addEventListener("click", (e) => {
    S.three = !S.three; e.currentTarget.classList.toggle("on", S.three);
    map.setLayoutProperty("d-ext", "visibility", S.three ? "visible" : "none");
    map.setLayoutProperty("d-fill", "visibility", S.three ? "none" : "visible");
    map.easeTo({ pitch: S.three ? 52 : 0, bearing: S.three ? -12 : 0, duration: 1000 });
  });
  let recentTimer = null, recentAbort = null, recentScene = null, recentVersion = 0, sceneMode = null;
  const sceneCache = [];
  const imageYear = $("#imageYear"), currentImageYear = new Date().getUTCFullYear();
  for (let year = currentImageYear; year >= 1984; year--) {
    const option = document.createElement("option"); option.value = String(year); option.textContent = String(year); imageYear.appendChild(option);
  }
  imageYear.value = String(Math.min(2012, currentImageYear));
  function imageryStatus(message, scene) {
    const el = $("#imageryStatus");
    el.textContent = message; el.classList.toggle("hidden", !message);
    if (scene && scene.id) { const a = document.createElement("a"); a.href = "https://planetarycomputer.microsoft.com/api/stac/v1/collections/" + encodeURIComponent(scene.collection) + "/items/" + encodeURIComponent(scene.id); a.target = "_blank"; a.rel = "noopener"; a.textContent = " Scene details"; el.appendChild(a); }
  }
  function removeRecent() {
    clearTimeout(recentTimer); recentTimer = null; recentVersion++;
    if (recentAbort) recentAbort.abort(); recentAbort = null; recentScene = null; sceneMode = null;
    if (map.getLayer("sat-recent")) map.removeLayer("sat-recent");
    if (map.getSource("sat-recent")) map.removeSource("sat-recent");
    if (map.getLayer("sat-empty")) map.removeLayer("sat-empty");
  }
  function markSceneMode(mode) {
    S.recent = mode === "recent"; S.imageYear = mode === "past" ? Number(imageYear.value) : null;
    for (const [id, active] of [["#btnRecent", S.recent], ["#btnPast", S.imageYear != null]]) {
      const button = $(id); button.classList.toggle("on", active); button.setAttribute("aria-pressed", String(active));
    }
  }
  function mosaicStatus() { imageryStatus(S.sat ? "Sentinel-2 cloudless mosaic: 2025, 10 m. The time slider changes the model, not the imagery." : ""); }
  function scheduleRecent() {
    if ((!S.recent && S.imageYear == null) || !S.sat || !mapReady) return;
    const past = S.imageYear != null, year = S.imageYear, mode = past ? `year:${year}` : "recent";
    const center = map.getCenter();
    if (sceneMode === mode && BL.Imagery.contains(recentScene, center.lng, center.lat, E.pointInPoly)) return;
    removeRecent();
    map.setLayoutProperty("sat", "visibility", past ? "none" : "visible");
    if (past) map.addLayer({ id: "sat-empty", type: "background", paint: { "background-color": "#273341" } }, "d-fill");
    if (map.getZoom() < 8) { imageryStatus(past ? `Zoom in to load a ${year} scene. Grey means no image is shown.` : "Zoom in to load a recent scene at the map center. The 2025 mosaic is shown meanwhile."); return; }
    imageryStatus(past ? `Finding a ${year} satellite scene at the map center…` : "Finding a recent Sentinel-2 scene at the map center…");
    const version = recentVersion;
    recentTimer = setTimeout(async () => {
      const controller = new AbortController(); recentAbort = controller;
      const timeout = setTimeout(() => controller.abort(), 20000);
      try {
        const cached = sceneCache.find((item) => item.mode === mode && Date.now() - item.saved < 30 * 60 * 1000 && BL.Imagery.contains(item.scene, center.lng, center.lat, E.pointInPoly));
        const scene = cached ? cached.scene : past ? await BL.Imagery.yearScene(center.lng, center.lat, year, { signal: controller.signal }) : await BL.Imagery.recentScene(center.lng, center.lat, { signal: controller.signal });
        if (version !== recentVersion || !S.sat || (past ? S.imageYear !== year : !S.recent)) return;
        const current = map.getCenter();
        if (!BL.Imagery.contains(scene, current.lng, current.lat, E.pointInPoly)) { scheduleRecent(); return; }
        if (!cached) { sceneCache.push({ mode, scene, saved: Date.now() }); if (sceneCache.length > 12) sceneCache.shift(); }
        const attribution = scene.collection === "landsat-c2-l2" ? 'Landsat data courtesy of the <a href="https://www.usgs.gov/landsat-missions" target="_blank" rel="noopener">U.S. Geological Survey</a>, served by <a href="https://planetarycomputer.microsoft.com/" target="_blank" rel="noopener">Microsoft Planetary Computer</a>' : 'Contains modified Copernicus Sentinel data, served by <a href="https://planetarycomputer.microsoft.com/" target="_blank" rel="noopener">Microsoft Planetary Computer</a>';
        map.addSource("sat-recent", { type: "raster", tiles: scene.tiles, bounds: scene.bounds, tileSize: 256, maxzoom: scene.maxzoom, attribution });
        map.addLayer({ id: "sat-recent", type: "raster", source: "sat-recent" }, "d-fill");
        recentScene = scene; sceneMode = mode;
        const date = new Date(scene.date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
        const source = scene.collection === "landsat-c2-l2" ? (scene.scanGaps ? "Landsat 7; stripe gaps possible" : "Landsat") : "Sentinel-2";
        imageryStatus(past ? `Past scene: ${date} · ${source} · ${scene.resolution} m · ${scene.cloud.toFixed(1)}% scene-wide cloud. Grey means no image. Clouds, season and resolution affect comparisons; the model time slider does not change imagery.` : `Recent scene at map center: ${date} · ${scene.cloud.toFixed(1)}% scene-wide cloud · 10 m. Clouds may remain; 2025 mosaic outside the scene. The time slider changes the model only.`, scene);
      } catch (error) {
        if (version !== recentVersion || !S.sat || (past ? S.imageYear !== year : !S.recent)) return;
        const message = error.name === "AbortError" ? "Image search timed out" : error.message;
        imageryStatus(past ? `${message}. Grey means no past image is shown; try another year or location.` : `${message}. Showing the 2025 mosaic; move the map or try again.`);
      } finally { clearTimeout(timeout); if (recentAbort === controller) recentAbort = null; }
    }, 350);
  }
  $("#btnSat").addEventListener("click", (e) => {
    S.sat = !S.sat; e.currentTarget.classList.toggle("on", S.sat);
    e.currentTarget.setAttribute("aria-pressed", String(S.sat));
    map.setLayoutProperty("sat", "visibility", S.sat ? "visible" : "none");
    // Satellite is for seeing the ground: hide the colour overlay while it is on, restore it after.
    if (S.sat) { S.tintBeforeSat = S.tint; if (S.tint) $("#btnTint").click(); mosaicStatus(); toast("2025 satellite mosaic on. Turn Colours back on to overlay the analysis."); }
    else { if (S.recent || S.imageYear != null) { markSceneMode(null); removeRecent(); } mosaicStatus(); if (S.tintBeforeSat && !S.tint) $("#btnTint").click(); }
    paint();
  });
  $("#btnRecent").addEventListener("click", (e) => {
    if (!S.sat) $("#btnSat").click();
    const turnOn = !S.recent; markSceneMode(turnOn ? "recent" : null);
    if (turnOn) scheduleRecent(); else { removeRecent(); map.setLayoutProperty("sat", "visibility", "visible"); mosaicStatus(); }
  });
  $("#btnPast").addEventListener("click", () => {
    if (!S.sat) $("#btnSat").click();
    const turnOn = S.imageYear == null; markSceneMode(turnOn ? "past" : null);
    if (turnOn) scheduleRecent(); else { removeRecent(); map.setLayoutProperty("sat", "visibility", "visible"); mosaicStatus(); }
  });
  imageYear.addEventListener("change", () => {
    if (!S.sat) $("#btnSat").click();
    markSceneMode("past"); scheduleRecent();
  });
  $("#btnProj").addEventListener("click", (e) => {
    S.proj = !S.proj; e.currentTarget.classList.toggle("on", S.proj);
    ["cat-line-op", "cat-line-uc"].forEach((l) => map.setLayoutProperty(l, "visibility", S.proj ? "visible" : "none"));
    ["cat-glow", "cat-infl"].forEach((l) => map.setLayoutProperty(l, "visibility", S.proj && S.zones ? "visible" : "none"));
    setMarkerVisibility(); renderOverlayLegend();
  });
  $("#btnTint").addEventListener("click", (e) => {
    S.tint = !S.tint; e.currentTarget.classList.toggle("on", S.tint);
    ["d-fill", "grid-fill"].forEach((l) => map.setLayoutProperty(l, "visibility", S.tint ? "visible" : "none"));
    if (S.three && !S.tint) $("#btn3d").click();
  });
  $("#yearReset").addEventListener("click", () => setYear(MY));
  function renderOverlayLegend() {
    const el = $("#ovLegend");
    if (!S.proj && !S.real) { el.classList.add("hidden"); return; }
    el.classList.remove("hidden");
    el.innerHTML = (S.proj ? `<b>Projects</b>${Object.values(BL.TYPES).map((T) => `<div class="ov-row"><i style="background:${T.color}">${esc(T.icon)}</i>${esc(T.label)}</div>`).join("")}
      <div class="ov-row"><span class="ov-line"></span>Solid line = open</div><div class="ov-row"><span class="ov-line dash"></span>Dashed = being built / planned</div><div class="ov-row muted">Faded marker = early stage or cancelled</div>` : "") +
      (S.real ? `<b style="margin-top:6px;display:block">Real data</b><div class="ov-row"><span class="ov-dot" style="background:#ffd166"></span>Govt auction</div><div class="ov-row"><span class="ov-dot" style="background:#ffb547"></span>Govt allotment</div><div class="ov-row"><span class="ov-dot" style="background:#2ee6c5"></span>Registered / reported deal</div><div class="ov-row"><span class="ov-dot" style="background:#c9d3e6"></span>Listing (asking -10%)</div><div class="ov-row"><span class="ov-dot" style="background:#7f8aa3"></span>From govt guideline value</div><div class="ov-row"><span class="ov-dot" style="background:#b98cff"></span>Govt rate only</div>` : "");
  }
  $("#btnReal").addEventListener("click", (e) => {
    S.real = !S.real; e.currentTarget.classList.toggle("on", S.real);
    ["verified", "verified-cl", "verified-cl-n"].forEach((l) => { if (map.getLayer(l)) map.setLayoutProperty(l, "visibility", S.real ? "visible" : "none"); });
    renderOverlayLegend();
    if (S.real) toast(`${VERIFIED.length} reference points: listings, reported deals, official rates and guideline-derived estimates. Click one for its source and type.`);
  });
  $("#btnFarm").addEventListener("click", (e) => {
    S.farm = !S.farm; e.currentTarget.classList.toggle("on", S.farm);
    map.setLayoutProperty("farm", "visibility", S.farm ? "visible" : "none");
    if (S.farm) toast("Farm estimates use official rates and fitted multiples. Ring colours indicate source agreement, not measured accuracy. Click a dot for the method.");
  });
  $("#projType").addEventListener("change", (e) => {
    S.catFilter = e.target.value; if (!S.proj) $("#btnProj").click();
    setMarkerVisibility(); applyTypeFilter(); if (S.tool === "catalysts") refreshPanel();
    const n = allCats().filter((c) => S.catFilter === "all" || c.t === S.catFilter || (S.catFilter === "roads" && (c.t === "expressway" || c.t === "ring"))).length;
    toast(S.catFilter === "all" ? "Showing all project types." : `Showing only ${e.target.selectedOptions[0].text.toLowerCase()} (${n}).`);
  });
  // Focus mode: one district (or state) at a time; everything outside is dimmed and lists follow it.
  function setFocus(f) {
    S.focus = f || null;
    const bar = $("#focusBar");
    if (!map.getLayer("focus-mask")) map.addLayer({ id: "focus-mask", type: "fill", source: "districts", paint: { "fill-color": "#04060d", "fill-opacity": 0.72 } }, map.getLayer("cat-glow") ? "cat-glow" : undefined);
    if (!f) { map.setLayoutProperty("focus-mask", "visibility", "none"); bar.classList.add("hidden"); S.scr.state = ""; if (S.tool) refreshPanel(); return; }
    const inF = f.kind === "district" ? ["==", ["get", "id"], f.id] : ["==", ["get", "state"], f.state];
    map.setFilter("focus-mask", ["!", inF]); map.setLayoutProperty("focus-mask", "visibility", "visible");
    const b = new maplibregl.LngLatBounds();
    const fm = models.filter((m) => f.kind === "district" ? m.id === f.id : m.state === f.state);
    (GEO.features || []).filter((g) => fm.some((m) => m.id === g.properties.id)).forEach((g) => { const walk = (c) => typeof c[0] === "number" ? b.extend(c) : c.forEach(walk); walk(g.geometry.coordinates); });
    if (!b.isEmpty()) map.fitBounds(b, { padding: 80, duration: 1200 });
    S.scr.state = fm.length ? fm[0].state : "";
    $("#focusText").textContent = "Focused: " + f.label; bar.classList.remove("hidden");
    toast(`Focused on ${f.label}. Outside is dimmed; Screener and Shortlist follow it. Click x on the bar to leave.`);
    if (S.tool) refreshPanel();
  }
  BL.setFocus = setFocus;
  $("#focusClose").addEventListener("click", () => setFocus(null));
  $("#btnHideAll").addEventListener("click", () => {
    ["btnProj", "btnReal", "btnFarm", "btnHeat", "btnTint", "btnLabels", "btn3d"].forEach((id) => { const b = $("#" + id); if (b && b.classList.contains("on")) b.click(); });
    if (BL.Infra) Object.keys(BL.Infra.LAYERS).forEach((k) => { if (BL.Infra.isOn(k)) BL.Infra.setLayer(map, k, false); });
    const ib = $("#btnInfra"); if (ib) ib.classList.remove("on");
    toast("All overlays hidden. Turn on only what you need: Colours for the lens, Projects for infrastructure.");
  });
  $("#btnHeat").addEventListener("click", (e) => {
    S.heat = !S.heat; e.currentTarget.classList.toggle("on", S.heat);
    if (S.heat) { map.getSource("heat").setData(heatFC()); toast("Hotspots show where unrealised infrastructure upside is concentrated."); }
    map.setLayoutProperty("heat", "visibility", S.heat ? "visible" : "none");
  });

  /* ------------------------------------------------------------------ */
  /* Detail drawer                                                        */
  /* ------------------------------------------------------------------ */
  function padFor() {
    const w = window.innerWidth;
    if (w < 900) return { top: 120, bottom: 300, left: 30, right: 30 };
    return { top: 100, bottom: 110, left: S.tool ? 470 : 90, right: S.sel != null ? 440 : 60 };
  }
  function fitDistrict(id) {
    const f = featById.get(id); if (!f) return;
    const b = new maplibregl.LngLatBounds();
    const walk = (c) => (typeof c[0] === "number" ? b.extend(c) : c.forEach(walk));
    walk(f.geometry.coordinates);
    map.fitBounds(b, { padding: padFor(), duration: 1100, maxZoom: 9.5 });
  }
  function openDetail(id, fly = true) {
    S.sel = id; S.loc = null; if (pinMk) { pinMk.remove(); pinMk = null; }
    document.body.classList.add("detail-open");
    map.setFilter("d-sel", ["==", ["get", "id"], id]);
    map.setFilter("d-sel-glow", ["==", ["get", "id"], id]);
    $("#detail").classList.remove("hidden");
    renderDetail();
    $("#detail").scrollTop = 0;
    if (fly) fitDistrict(id);
    writeHash();
  }
  function closeDetail() {
    S.sel = null; S.loc = null; if (pinMk) { pinMk.remove(); pinMk = null; }
    document.body.classList.remove("detail-open");
    $("#detail").classList.add("hidden");
    map.setFilter("d-sel", ["==", ["get", "id"], -1]);
    map.setFilter("d-sel-glow", ["==", ["get", "id"], -1]);
    writeHash();
  }

  /* ---------------- Location (plot-level) card ---------------- */
  let pinMk = null;
  function openLocation(lon, lat) {
    if (!E.districtAt(lat, lon, models)) { toast("This location is outside the mapped districts."); return; }
    S.sel = null; S.loc = { lon, lat };
    map.setFilter("d-sel", ["==", ["get", "id"], -1]); map.setFilter("d-sel-glow", ["==", ["get", "id"], -1]);
    if (pinMk) pinMk.remove();
    const wrap = document.createElement("div"); wrap.innerHTML = '<div class="pin"></div>';
    pinMk = new maplibregl.Marker({ element: wrap, anchor: "bottom" }).setLngLat([lon, lat]).addTo(map);
    document.body.classList.add("detail-open");
    $("#detail").classList.remove("hidden");
    renderLocation(); $("#detail").scrollTop = 0; writeHash();
  }
  function nearVerified(lat, lon, maxKm) {
    return (window.BL_VERIFIED || []).map((p, i) => ({ p, i, d: E.hav(lat, lon, p.lat, p.lon) })).filter((x) => x.d <= maxKm).sort((a, b) => a.d - b.d);
  }
  const TYPE_LABEL = { govt_auction: "Govt auction", registered: "Reported registered sale", reported_deal: "Reported price or deal", listing: "Listing or quoted price", consensus: "Cross-checked listings (asking, -10%)", unverified: "Unverified asking price", govt_allotment: "Govt allotment", bank_auction: "Bank auction reference", compensation: "Acquisition compensation", official: "Official rate", derived_gv: "Derived from govt guideline value" };
  function sourceEvidenceHTML(nearAll) {
    const Cmp = BL.Comparables, groups = Cmp.groups(nearAll);
    const first = Cmp.GROUPS.find((g) => groups[g.id].length);
    const rowLabel = (r) => r.kind === "asking" ? (r.type === "consensus" ? "Listing aggregate; asking price" : r.type === "unverified" ? "Unverified asking reference" : "Listing or quoted asking reference") : r.kind === "reported" ? "Reported sale or registration" : r.kind === "auction" ? "Auction or allotment; may be a reserve" : r.kind === "official" ? (r.officialKind === "guideline-range" ? "Reported guideline range; not a single rate" : r.officialKind === "guideline" ? "Reported guideline rate or summary" : "Other reported official rate") : r.kind === "compensation" ? "Acquisition compensation, not a market sale" : "Derived model input, not a sale";
    const rows = Cmp.GROUPS.filter((g) => groups[g.id].length).map((g) => {
      const all = groups[g.id], shown = all.slice(0, 6);
      return `<details class="more" data-evidence-group="${g.id}" ${first && first.id === g.id ? "open" : ""}><summary>${esc(g.label)} (${all.length})</summary>${shown.map((r) => {
        const dates = r.date ? `Date recorded: ${esc(r.date)}` : "Date not recorded";
        const retrieved = r.retrieved && r.retrieved !== r.date ? ` | retrieved ${esc(r.retrieved)}` : "";
        const source = r.source ? `<a href="${esc(r.source)}" target="_blank" rel="noopener noreferrer">Open source</a>` : "Source link unavailable";
        const amount = r.officialKind === "guideline-range" ? `${fmtINR(r.low)}–${fmtINR(r.high)} /sq ft` : `${fmtINR(r.value)} /sq ft`;
        return `<div class="card small" style="margin-top:8px;line-height:1.5"><div class="row sb"><b>${amount}</b><span class="muted">${r.distance.toFixed(1)} km away</span></div><div>${esc(rowLabel(r))}</div><div class="muted">${esc(r.loc)}${r.state ? ", " + esc(r.state) : ""} | Land: ${esc(r.land)}</div><div class="muted">${dates}${retrieved}</div>${r.note ? `<div class="muted">${esc(r.note.length > 180 ? r.note.slice(0, 177) + "…" : r.note)}</div>` : ""}<div>${source}${Number.isInteger(r.index) ? ` | <button class="btn sm" data-act="verified" data-i="${r.index}">Details</button>` : ""}</div></div>`;
      }).join("")}${all.length > shown.length ? `<p class="small muted">Showing the ${shown.length} nearest of ${all.length} reference rows.</p>` : ""}</details>`;
    }).join("");
    return `<h3>Nearby price evidence</h3><p class="small muted">References within 12 km are grouped by source type. Dates can be collection dates, locations are approximate, and rows may repeat the same property. Land type and the original source need checking.</p>${rows || '<div class="card small muted">No priced or guideline reference is recorded within 12 km.</div>'}<p class="small muted">A validated comparable-sale range is not available from these mixed references. Guideline-derived inputs are not market sales.</p>`;
  }
  function guidelineHistoryHTML(lat, lon, state) {
    const data = window.BL_TN_GV || { rows: [], rev: [] };
    const nearby = BL.Guideline.nearest(data, lat, lon, 5, 3);
    if (!nearby.length) return state === "Tamil Nadu" ? `<h3>Tamil Nadu guideline history</h3><div class="card small muted">No matched guideline history is recorded within 5 km. This does not mean an official rate is unavailable. <a href="https://tnreginet.gov.in/portal/" target="_blank" rel="noopener noreferrer">Check TNREGINET</a>.</div>` : "";
    const entries = nearby.map(({ row, distance }, i) => {
      const values = BL.Guideline.observations(data, row).map((o) => `<tr><td>${esc(o.revision)}</td><td style="text-align:right">${o.value == null ? "Not recorded" : "₹" + o.value.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</td></tr>`).join("");
      return `<details class="more" data-tn-history ${i === 0 ? "open" : ""}><summary>${esc(row[0])}, ${esc(row[3])} · ${distance.toFixed(1)} km</summary><div class="small muted">${esc(row[1])} · ${esc(row[2])} SRO · approximate village location</div><table class="small" style="width:100%;margin-top:6px"><thead><tr><th style="text-align:left">Revision searched</th><th style="text-align:right">Median reported street rate /sq ft</th></tr></thead><tbody>${values}</tbody></table></details>`;
    }).join("");
    return `<h3>Tamil Nadu guideline history nearby</h3><p class="small muted">Up to three matched village histories within 5 km. These are recorded revision searches, not market sales or estimates for the selected plot. Missing years are not interpolated.</p>${entries}<p class="small muted">Village coordinates are automatic name matches. Streets and land classes may differ between revisions, so medians may not be comparable. Some records were collected without HTTPS certificate verification; check the original register. <a href="https://tnreginet.gov.in/portal/" target="_blank" rel="noopener noreferrer">TNREGINET</a> · <a href="https://github.com/Hasen1506/Ideas/blob/main/bhoomi-lens/docs/TAMIL_NADU_DATA_OPERATIONS.md" target="_blank" rel="noopener noreferrer">Source and coverage</a></p>`;
  }
  function renderLocation() {
    const { lon, lat } = S.loc;
    const pm = E.pointModel(lat, lon, allCats(), models, opts());
    pm.priceNow = pm.basePrice;
    const ser = E.series(pm, S.scenario), con = E.contributions(pm, S.horizon, S.scenario);
    con.parts.forEach((p) => (p.color = p.c ? BL.TYPES[p.c.t].color : "#8fa3c7"));
    const cf = E.calibFactor(lat, lon);
    const nearAll = nearVerified(lat, lon, 12), near = nearAll.slice(0, 8);
    const evidence = BL.Insights.evidenceSummary(nearAll);
    const gov = nearAll.find((x) => x.d <= 8 && x.p.govt_sqyd);
    const dm = models.find((m) => m.name === pm.district && m.state === pm.state);
    const projs = allCats().map((c) => ({ c, d: E.distToCatalyst(c, lat, lon) })).filter((x) => x.d < 60).sort((a, b) => a.d - b.d).slice(0, 8);
    $("#detailBody").innerHTML = `
      <div class="d-hero">
        <div class="kicker">Location estimate | ${esc(pm.district || "")}${pm.state ? ", " + esc(pm.state) : ""}</div>
        <h1 style="font-size:20px">${near.length && near[0].d < 6 ? "Near " + esc(near[0].p.loc) : esc(pm.district || "Selected spot")}</h1>
        <div class="small muted">${lat.toFixed(4)}, ${lon.toFixed(4)}${near.length && near[0].d < 6 ? ` | ${near[0].d.toFixed(1)} km from ${esc(near[0].p.loc)}` : ""}</div>
        <div class="row" style="flex-wrap:wrap;gap:6px;margin-top:6px">
          <span class="tag">${pm.nearest ? Math.round(pm.nearestD) + " km from " + esc(pm.nearest.n) : ""}</span>
          ${Math.abs(cf - 1) > 0.05 ? `<span class="tag" style="border-color:#ffd166;color:#ffd166">Adjusted using reference data ${pct(cf - 1, 0)}</span>` : ""}
        </div>
        <div class="acts"><button class="icon-btn" data-act="close-detail" title="Close"><svg viewBox="0 0 24 24" width="16" height="16"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button></div>
      </div>
      <div class="d-body">
        ${guidelineHistoryHTML(lat, lon, pm.state)}
        ${sourceEvidenceHTML(nearAll)}
        ${(() => { // Buyer summary first: the 4 things a buyer needs, everything else below or collapsed.
          const ex = BL.Infra ? BL.Infra.nearestExit(lat, lon) : null, ap = BL.Infra ? BL.Infra.nearestAirport(lat, lon) : null, aq = BL.Infra ? BL.Infra.nearAcq(lat, lon, 3) : [];
          const warn = [];
          if (aq.length) warn.push(`Land-acquisition notice: ${esc(aq[0].a.v)} village (${aq[0].d.toFixed(1)} km)`);
          if (ap && ap.d <= 20) warn.push(`Within 20 km of ${esc(ap.n)}: height clearance may apply`);
          if (!evidence.market) warn.push("No market reference within 5 km: estimate is model-led");
          if (dm && dm.risk && dm.risk.total >= 55) warn.push("Elevated modelled district risk score");
          return `<div class="card buyer-sum" style="margin-top:4px">
            <div class="small muted">Buyer summary</div>
            <div class="row sb" style="margin-top:4px"><span>Model estimate</span><b>${fmtINR(pm.basePrice)} <span class="small muted">/sq ft</span></b></div>
            <div class="row sb small"><span class="muted">Within 5 km</span><span>${evidence.market} market references | ${evidence.proxies} guideline proxies${evidence.other ? ` | ${evidence.other} other` : ""}</span></div>
            <div class="row sb small"><span class="muted">Road access</span><span>${ex ? ex.d.toFixed(1) + " km to " + esc(ex.n || "an expressway exit") : "No expressway exit nearby"}</span></div>
            <div class="small" style="margin-top:6px">${warn.length ? warn.slice(0, 3).map((w) => `<div class="warn">! ${w}</div>`).join("") : '<div class="up">No flags from the public checks below (not legal clearance)</div>'}</div>
            <div class="small muted" style="margin-top:6px">This is not a plot valuation. Compare an asking price below; no validated plot-level error range is available.</div></div>`; })()}
        <h3>Value at this spot</h3>
        <div class="kpis">
          <div class="kpi"><div class="k">Est. land price</div><div class="v">${fmtINR(pm.basePrice)}<span class="small muted"> /sq ft</span></div><div class="s">${fmtINR(pm.basePrice * 9)} /sq yd | ${fmtINR(pm.basePrice * E.SQFT_PER_ACRE)} /acre</div></div>
          <div class="kpi"><div class="k">${S.horizon}-yr outlook</div><div class="v up">${pm.mult.toFixed(2)}x</div><div class="s">${pct(pm.cagr)} per year, ${esc(BL.SCENARIOS[S.scenario].label.toLowerCase())}</div></div>
          ${gov ? `<div class="kpi wide"><div class="k">Reported guideline reference nearby (${esc(gov.p.loc)}, ${gov.d.toFixed(1)} km)</div><div class="v">${fmtINR(gov.p.govt_sqyd)}<span class="small muted"> /sq yd</span></div><div class="s">${gov.p.govt_date ? "Recorded date " + esc(gov.p.govt_date) + " | " : ""}${gov.p.govt_retrieved ? "Retrieved " + esc(gov.p.govt_retrieved) + " | " : ""}<a href="${esc(gov.p.govt_src)}" target="_blank" rel="noopener">source</a> | model estimate vs reference: ${Math.round((pm.basePrice / (gov.p.govt_sqyd / 9) - 1) * 100)}%. This summary may not apply to the plot.</div></div>` : ""}
        </div>
        ${(() => { const v = nearVerified(lat, lon, 5).find((x) => x.p.village && E.landTypeFor(x.p.path, x.p.district)); return v ? `<h3>By land type (Tamil Nadu, nearest guideline village ${esc(v.p.loc)}, ${v.d.toFixed(1)} km)</h3><div class="card">${landTypeHTML(E.landTypeFor(v.p.path, v.p.district))}</div>` : ""; })()}
        ${BL.Insights ? BL.Insights.block({ pm, lat, lon, nearAll, gov, place: near.length && near[0].d < 6 ? "Near " + near[0].p.loc : (pm.district || "Selected spot"), ser, con, horizon: S.horizon, scenario: S.scenario }) : ""}
        <details class="more"><summary>Model detail: how the price was built, price path and drivers</summary>
        <h3>How this price was arrived at</h3>
        <div class="card small" style="line-height:1.6">${(() => {
          const cc = E.calibContrib(lat, lon);
          const raw = pm.modelPrice;
          return `<div class="row sb"><span class="muted">1. Base model (state farmland baseline + pull of ${esc(pm.nearest ? pm.nearest.n : "nearest city")})</span><b>${fmtINR(raw)}</b></div>
            <div class="row sb"><span class="muted">2. Adjustment from nearby reference data</span><b class="${cc.factor < 1 ? "down" : "up"}">x${cc.factor.toFixed(2)}</b></div>
            <div class="row sb" style="border-top:1px solid var(--line);margin-top:4px;padding-top:4px"><span>Estimate today</span><b>${fmtINR(pm.basePrice)}</b></div>
            ${cc.top.length ? `<div class="muted" style="margin-top:6px">Weight of model inputs: ${cc.top.map((t) => `${esc(t.loc)} ${Math.round(t.share * 100)}% (${t.d.toFixed(1)} km, input ${fmtINR(t.real)})`).join("; ")}; model prior ${Math.round(cc.priorShare * 100)}%. Inputs can include guideline-derived proxies.</div>` : '<div class="muted" style="margin-top:6px">No priced reference input nearby, so this is model-only.</div>'}
            <div class="muted" style="margin-top:4px">3. Forecast = today's estimate grown by the state drift and each project's priced-in share x completion odds (see drivers below).</div>`;
        })()}</div>
        <h3>Analyse around this point</h3>
        <div class="btn-row">${[2, 5, 10, 15, 25, 50].map((r) => `<button class="btn sm" data-act="loc-radius" data-r="${r}" data-lon="${lon}" data-lat="${lat}">${r} km</button>`).join("")}</div>
        ${near.length ? `<h3>Nearby reference points (${near.length})</h3><div class="card" style="padding:4px 12px">${near.map((x) => `<div class="cat-row" data-act="verified" data-i="${x.i}"><span class="cat-ico" style="background:${x.p.type === "govt_auction" ? "#ffd166" : x.p.price ? "#c9d3e6" : "#b98cff"}">${x.p.price ? "Rs" : "G"}</span><div class="grow"><div class="cn">${esc(x.p.loc)}</div><div class="small muted">${x.p.price ? fmtINR(x.p.txn_sqyd) + "/sq yd | " + esc(TYPE_LABEL[x.p.type] || x.p.type) + " | " + esc(x.p.date || "") : x.p.govt_sqyd || x.p.govt_sqyd_agri ? "Official rate " + fmtINR(x.p.govt_sqyd || x.p.govt_sqyd_agri) + "/sq yd" : x.p.txn_sqyd ? "Unverified asking price " + fmtINR(x.p.txn_sqyd) + "/sq yd (not used in model)" : "No price recorded"} | ${x.d.toFixed(1)} km</div></div></div>`).join("")}</div>` : ""}
        <h3>Illustrative price path</h3><div class="card">${C.fan(ser, { cursor: S.year !== MY ? S.year : null })}<div class="small muted">The forecast band is an unvalidated model assumption, not an 80% prediction interval.</div></div>
        <h3>Model components for the next ${S.horizon} years</h3><div class="card">${C.bars(con.parts)}<div class="small muted">The model's combined change is allocated across its inputs; this does not establish what caused a real price change.</div></div>
        </details>
        ${BL.Infra ? BL.Infra.checks(lat, lon) : ""}
        <h3>Projects within 60 km</h3>
        <div class="card" style="padding:4px 12px">${projs.length ? projs.map((x) => catRow(x.c, `${x.d.toFixed(1)} km away`)).join("") : '<div class="empty">No tracked project within 60 km.</div>'}</div>
        ${dm ? `<div class="btn-row" style="margin-top:12px"><button class="btn sm" data-act="open-d" data-id="${dm.id}">Open ${esc(dm.name)} district card</button></div>` : ""}
        <p class="small muted" style="margin-top:12px">District boundaries are simplified. Check the location, land type and original sources before using an estimate.</p>
      </div>`;
  }
  function landTypeHTML(lt) {
    if (!lt) return "";
    const row = (k, x) => x ? `<div class="row sb small" style="margin-top:4px"><span class="muted">${k} <span class="tag" style="padding:0 5px;color:${x.conf === "High" ? "#5bd18b" : x.conf === "Medium" ? "#ffd166" : "#ff8a5c"}">${x.conf}</span></span><b>${fmtINR(x.value)} ${x.unit === "Rs/acre" ? "/acre" : "/sq ft"}</b></div><div class="small muted">${esc(x.method)}${x.ratio ? ` The model uses ${Math.round(x.ratio * 1000) / 10}% of residential plot prices per sq ft; this is not a verified sale ratio.` : ""}</div>` : "";
    return `<div style="margin-top:6px"><b class="small">By land type</b>${row("Farm land", lt.farm)}${row("Commercial land", lt.comm)}${lt.rev ? `<div class="small muted">Guideline revision on record: ${esc(lt.rev)}</div>` : ""}</div>`;
  }
  // Every displayed rate carries its source, method and retrieval timestamp.
  function provenanceHTML(p) {
    if (!p) return "";
    const rng = p.low && p.high ? `<div class="row sb small" style="margin-top:6px"><span class="muted">Range</span><b>${fmtINR(p.low)}-${fmtINR(p.high)}/sq ft</b></div>` : "";
    const st = p.status ? `<span class="tag" style="border-color:${p.status === "asserted" ? "#5bd18b" : "#ffd166"};color:${p.status === "asserted" ? "#5bd18b" : "#ffd166"}">${p.status === "asserted" ? "Cross-checked" : p.status === "single-source" ? "Single source, not asserted" : "Sources disagree, not asserted"}</span>` : "";
    const how = p.method ? `<p class="small" style="margin:6px 0 0;line-height:1.45"><b>How this was arrived at:</b> ${esc(p.method)}</p>` : "";
    const srcs = (p.sources || []).slice(0, 12).map((x) => `<div class="small" style="padding:1px 0"><a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.site)}</a> ${fmtINR(x.rs_sqft)}/sq ft | ${esc(x.kind || "")} ${esc(x.date || "")}${x.sub_area ? " | " + esc(x.sub_area) : ""}</div>`).join("");
    const more = p.sources && p.sources.length > 12 ? `<div class="small muted">+${p.sources.length - 12} more sources</div>` : "";
    const ts = `<div class="small muted" style="margin-top:4px">Retrieved ${esc(p.retrieved || p.date || "")}${p.src && !(p.sources || []).length ? ` | <a href="${esc(p.src)}" target="_blank" rel="noopener">source</a>` : ""}</div>`;
    return `${st}${rng}${how}${srcs ? `<div style="margin-top:6px"><b class="small">Sources</b>${srcs}${more}</div>` : ""}${ts}`;
  }
  function verifiedPopup(i) {
    const p = (window.BL_VERIFIED || [])[i]; if (!p) return;
    if (popup) popup.remove();
    popup = new maplibregl.Popup({ offset: 10, maxWidth: "320px" }).setLngLat([p.lon, p.lat]).setHTML(`<div style="min-width:230px">
      <b>${esc(p.loc)}</b><div class="small muted">${esc(p.district)}${p.taluk ? ", " + esc(p.taluk) : ""}, ${esc(p.state || "")} | reference data point</div>
      ${(() => { const lt = S.farm && p.village ? E.landTypeFor(p.path, p.district) : null; const f = lt && lt.farm; if (!f) return ""; const cc = f.conf === "High" ? "#5bd18b" : f.conf === "Medium" ? "#ffd166" : "#ff8a5c";
        return `<div class="card" style="margin:8px 0;padding:8px 10px"><div class="small muted">Farm land estimate</div><div style="font-size:20px;font-weight:700">${fmtINR(f.value)}<span class="small muted"> /acre</span></div><div class="small">Source agreement <b style="color:${cc}">${esc(f.conf)}</b>${f.method ? ` | ${esc(f.method)}` : ""}</div><div class="small muted" style="margin-top:4px">Source agreement is not measured valuation accuracy. Residential plot figures below are for comparison only.</div></div>`; })()}
      ${p.price ? `<div class="row sb small" style="margin-top:8px"><span class="muted">${esc(TYPE_LABEL[p.type] || p.type)}</span><b>${fmtINR(p.txn_sqyd)}/sq yd</b></div><div class="small muted">${esc(p.date || "")} | ${fmtINR(p.price)}/sq ft · ${E.isCalibrationInput(p) ? "used as a model input" : "context only; excluded from direct calibration"}</div>${p.note ? `<p class="small" style="margin:6px 0 0;line-height:1.45">${esc(p.note)}</p>` : ""}<div class="small"><a href="${esc(p.src)}" target="_blank" rel="noopener">Price source</a></div>` : ""}
      ${p.govt_sqyd || p.govt_sqyd_agri ? `<div class="row sb small" style="margin-top:8px"><span class="muted">Reported guideline reference${p.govt_sqyd ? "" : " (agri)"}</span><b>${fmtINR(p.govt_sqyd || p.govt_sqyd_agri)}/sq yd</b></div><div class="small"><span class="muted">${p.govt_date ? "Recorded " + esc(p.govt_date) : p.govt_retrieved ? "Retrieved " + esc(p.govt_retrieved) : "Date not recorded"}</span> | <a href="${esc(p.govt_src)}" target="_blank" rel="noopener">Rate source</a></div>` : p.govt_low_sqft && p.govt_high_sqft ? `<div class="row sb small" style="margin-top:8px"><span class="muted">Reported guideline range</span><b>${fmtINR(p.govt_low_sqft)}–${fmtINR(p.govt_high_sqft)}/sq ft</b></div><div class="small muted">Not a single plot rate; retrieved ${esc(p.govt_retrieved || "date not recorded")} | <a href="${esc(p.govt_src)}" target="_blank" rel="noopener">Rate source</a></div>` : ""}
      ${provenanceHTML(p)}
      ${p.village ? landTypeHTML(E.landTypeFor(p.path, p.district)) : ""}
      <button class="btn sm" style="margin-top:8px" data-act="open-loc" data-lon="${p.lon}" data-lat="${p.lat}">Explore this location</button></div>`).addTo(map);
  }

  function riskWord(v) { return v < 0.33 ? "Low" : v < 0.6 ? "Moderate" : "High"; }
  function renderDetail() {
    const m = byId.get(S.sel); if (!m) return;
    const ser = E.series(m, S.scenario);
    const con = E.contributions(m, S.horizon, S.scenario);
    con.parts.forEach((p) => (p.color = p.c ? BL.TYPES[p.c.t].color : "#8fa3c7"));
    const an = E.analogueFor(m.vec);
    const starred = S.watch.includes(m.id), cmp = S.compare.includes(m.id);
    const marks = m.links.slice(0, 6).map((L) => ({ y: E.effEta(L.c, S.scenario), label: L.c.n, color: BL.TYPES[L.c.t].color }));
    const near = m.nearest ? `${Math.round(m.nearestD)} km from ${m.nearest.n}` : "";
    const R = m.risk;
    const yrPrice = S.year !== MY ? `<div class="kpi wide"><div class="k">Time machine, ${S.year}</div><div class="v">${fmtINR(m.price)}<span class="small muted"> / sq ft</span></div><div class="s">${S.year < MY ? "Modelled historical value" : "Projected value, " + BL.SCENARIOS[S.scenario].label.toLowerCase() + " case"} (${pct(m.price / m.priceNow - 1, 0)} vs today)</div></div>` : "";
    $("#detailBody").innerHTML = `
      <div class="d-hero">
        <div class="kicker">${esc(m.state)} | district</div>
        <h1>${esc(m.name)}</h1>
        <div class="row" style="flex-wrap:wrap;gap:6px;margin-top:6px">
          <span class="tag">${esc(near)}</span>
          <span class="tag"><span class="dotc" style="background:${m.u > 0.5 ? "#2ee6c5" : m.u > 0.15 ? "#ffd166" : "#8fa3c7"}"></span>${m.u > 0.5 ? "Urban core" : m.u > 0.15 ? "Peri-urban" : "Rural"}</span>
          ${m.ov ? '<span class="tag" style="border-color:#2ee6c5;color:#2ee6c5">Your data</span>' : ""}
          ${m.calibrated ? `<span class="tag" style="border-color:#ffd166;color:#ffd166">Adjusted using reference data</span>` : ""}
        </div>
        <div class="acts">
          <button class="icon-btn ${starred ? "on" : ""}" data-act="star" data-id="${m.id}" title="${starred ? "Remove from" : "Add to"} watchlist"><svg viewBox="0 0 24 24" width="17" height="17"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z" fill="${starred ? "currentColor" : "none"}" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg></button>
          <button class="btn sm" data-act="focus-d" data-id="${m.id}" title="Focus the map on this district">Focus</button><button class="icon-btn ${cmp ? "on" : ""}" data-act="cmp" data-id="${m.id}" title="Compare"><svg viewBox="0 0 24 24" width="17" height="17"><path d="M4 6h7v13H4zM13 10h7v9h-7z" fill="${cmp ? "currentColor" : "none"}" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg></button>
          <button class="icon-btn" data-act="report" data-id="${m.id}" title="Download report"><svg viewBox="0 0 24 24" width="17" height="17"><path d="M12 4v11M7 10l5 5 5-5M5 20h14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
          <button class="icon-btn" data-act="close-detail" title="Close"><svg viewBox="0 0 24 24" width="16" height="16"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
        </div>
        <div class="score-row">
          <div class="score">${C.gauge(m.opp, { color: "#2ee6c5" })}<div><div class="lab">Model opportunity</div><div class="txt">${m.opp >= 75 ? "Strong" : m.opp >= 60 ? "Above average" : m.opp >= 40 ? "Average" : "Below average"}</div></div></div>
          <div class="score">${C.gauge(R.total, { color: "#ff5c7a" })}<div><div class="lab">Model risk</div><div class="txt">${R.total < 38 ? "Lower score" : R.total < 50 ? "Middle score" : "Higher score"}</div></div></div>
          <div class="score">${C.gauge(m.liq, { color: "#5ad1ff" })}<div><div class="lab">Liquidity score</div><div class="txt">${m.liq > 65 ? "Higher" : m.liq > 40 ? "Middle" : "Lower"} model score</div></div></div>
        </div>
      </div>
      <div class="d-body">
        <h3>Modelled value inputs</h3>
        <div class="kpis">
          <div class="kpi"><div class="k">Modelled market price</div><div class="v">${fmtINR(m.priceNow)}<span class="small muted"> /sq ft</span></div><div class="s">${fmtINR(m.priceNow * E.SQFT_PER_ACRE)} per acre</div></div>
          <div class="kpi"><div class="k">Modelled circle-rate input</div><div class="v">${fmtINR(m.circle)}<span class="small muted"> /sq ft</span></div><div class="s warn">Assumed gap ${Math.round(m.gap * 100)}%; not a verified difference between actual rates.</div></div>
          <div class="kpi"><div class="k">${S.horizon}-yr value multiple</div><div class="v">${m.mult.toFixed(2)}x</div><div class="s">Illustrative range ${m.lo.toFixed(2)}x to ${m.hi.toFixed(2)}x</div></div>
          <div class="kpi"><div class="k">Growth per year</div><div class="v ${m.cagr > 0.09 ? "up" : ""}">${pct(m.cagr)}</div><div class="s">${esc(BL.SCENARIOS[S.scenario].label)} case</div></div>
          ${yrPrice}
        </div>
        <h3>Price path, 2015 to 2036</h3>
        <div class="card">${C.fan(ser, { marks, cursor: S.year !== MY ? S.year : null })}
          <div class="row small muted" style="gap:14px;margin-top:4px"><span><span style="display:inline-block;width:14px;height:2px;background:#8fa3c7;vertical-align:middle"></span> modelled history</span><span><span style="display:inline-block;width:14px;height:2px;background:#ffb547;vertical-align:middle"></span> forecast with illustrative band</span><span>dots = project dates</span></div><div class="small muted">The band is an unvalidated model assumption, not an 80% prediction interval.</div>
        </div>
        <h3>What drives the next ${S.horizon} years</h3>
        <div class="card">${C.bars(con.parts)}<div class="row sb small" style="margin-top:9px;border-top:1px solid var(--line);padding-top:8px"><span class="muted">Total modelled change</span><b class="up">${pct(con.total)}</b></div><div class="small muted">Inputs are model assumptions, not causal project effects.</div></div>
        <h3>Looks like</h3>
        <div class="analogue">
          <div class="small muted">Closest case by model pattern score (${Math.round(an.similarity * 100)}%)</div>
          <b>${esc(an.a.n)} in ${an.a.y}</b>
          <p class="small" style="margin:6px 0 0;line-height:1.5;color:var(--tx-2)">${esc(an.a.why)} The case input uses <b style="color:var(--tx)">${an.a.mult}x</b> over the following decade. The match and the case input are not independently validated.</p>
        </div>
        <h3>Modelled risk profile</h3><p class="small muted">Heuristic district-level indicators, not a site inspection or measured plot risk.</p>
        <div class="card"><div class="row" style="align-items:center">
          <div style="width:52%">${C.radar([{ label: "Flood", v: R.flood }, { label: "Heat", v: R.heat }, { label: "Water", v: R.water }, { label: "Title", v: R.title }, { label: "Rules", v: R.reg }])}</div>
          <div class="grow small">
            ${[["Flood", R.flood], ["Heat", R.heat], ["Water stress", R.water], ["Title and records", R.title], ["Buyer restrictions", R.reg]].map(([k, v]) => `<div class="row sb" style="padding:3px 0"><span class="muted">${k}</span><span class="${v >= 0.6 ? "down" : v >= 0.33 ? "warn" : "up"}">${riskWord(v)}</span></div>`).join("")}
          </div></div>
          ${R.reg > 0.6 ? `<p class="small warn" style="margin:8px 0 0">The model indicates possible buyer restrictions. Check current law and eligibility for the specific land.</p>` : ""}
        </div>
        <h3>Projects in range (${m.links.length})</h3>
        <div class="card" style="padding:4px 12px">${m.links.length ? m.links.slice(0, 8).map((L) => catRow(L.c, `${Math.round(L.d)} km away`)).join("") : '<div class="empty">No tracked project is within the model’s assumed reach. This does not establish whether projects affect prices here.</div>'}</div>
        <h3>Act on it</h3>
        <div class="btn-row">
          <button class="btn sm" data-act="radius" data-id="${m.id}">Analyse 15 km around</button>
          <button class="btn sm" data-act="sim-here" data-id="${m.id}">Simulate a project here</button>
          <button class="btn sm" data-act="report" data-id="${m.id}">Download report</button>
        </div>
      </div>`;
  }
  function catRow(c, sub) {
    const T = BL.TYPES[c.t];
    return `<div class="cat-row" data-act="fly-cat" data-id="${esc(c.id)}"><span class="cat-ico" style="background:${T.color}">${esc(T.icon)}</span><div class="grow"><div class="cn ellipsis">${esc(c.n)}</div><div class="row small muted" style="gap:8px;margin-top:3px">${c.cancelled ? '<span class="down">Cancelled / dropped</span>' : `${C.stage(c.stage)}<span>${esc(BL.STAGES[c.stage])}</span><span>| ${c.stage >= 4 ? "open" : "ETA " + E.effEta(c, S.scenario)}</span>`}</div>${sub ? `<div class="small muted" style="margin-top:2px">${esc(sub)}</div>` : ""}${c.cancelled ? '<div class="small down">Cancelled: model assumes its contribution unwinds</div>' : c.delays ? `<div class="small warn">Delayed ${c.delays}x | as of ${esc(c.asof || "")}</div>` : c.asof ? `<div class="small muted">as of ${esc(c.asof)}</div>` : ""}</div><span class="pill ${E.completionP(c, S.scenario) < 0.5 ? "r" : ""}" title="Assumed model input, not a validated probability">${Math.round(E.completionP(c, S.scenario) * 100)}% assumed</span></div>`;
  }

  /* ------------------------------------------------------------------ */
  /* Tool panels                                                          */
  /* ------------------------------------------------------------------ */
  const PANEL_TITLES = { track: "Track record: past projects", housing: "Housing index sources", data: "Data sources and freshness", shortlist: "Infra-led shortlist", alerts: "Spot alerts", explore: "Explore", draw: "Area analysis", simulate: "Ripple simulator", catalysts: "Catalyst tracker", screener: "Screener", watchlist: "Watchlist and signals", compare: "Compare", method: "How the model works" };
  function openTool(id, force) {
    if (S.tool === id && !force) { closeTool(); return; }
    if (id !== "draw") cancelDraw();
    if (id !== "simulate") cancelPlacement();
    S.tool = id;
    $("#panel").classList.remove("hidden");
    $("#panelTitle").textContent = PANEL_TITLES[id];
    renderRail();
    refreshPanel();
    $("#panelBody").scrollTop = 0;
  }
  function closeTool() {
    cancelDraw(); cancelPlacement();
    S.tool = null; $("#panel").classList.add("hidden"); renderRail();
  }
  $("#panelClose").addEventListener("click", closeTool);
  if (BL.Insights) BL.Insights.onChange = () => refreshPanel();

  function refreshPanel() {
    if (!S.tool) return;
    const body = $("#panelBody");
    const fn = { track: () => BL.Infra.trackPanel(), housing: pHousingHistory, data: pDataHealth, shortlist: () => BL.Insights.shortlistPanel(models), alerts: () => BL.Insights.alertsPanel((la, lo) => { const q = E.pointModel(la, lo, allCats(), models, opts()); return q; }), explore: pExplore, draw: pDraw, simulate: pSimulate, catalysts: pCatalysts, screener: pScreener, watchlist: pWatch, compare: pCompare, method: pMethod }[S.tool];
    body.innerHTML = fn();
    renderRail();
  }

  function listItem(m, i, right) {
    return `<div class="list-item" data-act="open-d" data-id="${m.id}"><span class="rank">${i + 1}</span><div class="grow"><div class="ellipsis" style="font-weight:600">${esc(m.name)}</div><div class="small muted ellipsis">${esc(m.state)} | ${fmtINR(m.priceNow)}/sq ft</div></div>${right}</div>`;
  }

  function pExplore() {
    const top = [...models].filter((m) => m.area > 30).sort((a, b) => b.opp - a.opp || b.cagr - a.cagr).slice(0, 8);
    const emerging = [...models].filter((m) => m.priceNow < 900 && m.area > 30).sort((a, b) => b.mom - a.mom).slice(0, 6);
    const gaps = [...models].filter((m) => m.area > 30).sort((a, b) => b.gap - a.gap).slice(0, 5);
    const priced = [...models].sort((a, b) => b.priceNow - a.priceNow).slice(0, 5);
    const nat = models.reduce((s, m) => s + m.cagr, 0) / models.length;
    return `<p class="lead">Explore mapped districts, source evidence and illustrative model scenarios. Switch lenses at the top, use the time slider, or click a district.</p>
      <div class="kpis">
        <div class="kpi"><div class="k">Districts modelled</div><div class="v">${models.length}</div><div class="s">${Object.keys(BL.STATES).length} states and UTs</div></div>
        <div class="kpi"><div class="k">Projects tracked</div><div class="v">${allCats().length}</div><div class="s">${allCats().filter((c) => c.stage < 4).length} still in the pipeline</div></div>
        <div class="kpi wide"><div class="k">Mean model growth across districts (${S.horizon} yrs)</div><div class="v">${pct(nat)} <span class="small muted">per year, ${esc(BL.SCENARIOS[S.scenario].label.toLowerCase())} case</span></div></div>
      </div>
      <h3>Highest model opportunity scores</h3>${top.map((m, i) => listItem(m, i, `<span class="pill">${m.opp}</span>`)).join("")}
      <h3>Lower model prices near tracked projects</h3>${emerging.map((m, i) => listItem(m, i, `<span class="pill s">${pct(m.cagr)}</span>`)).join("")}
      <h3>Widest modelled circle-rate gaps</h3>${gaps.map((m, i) => listItem(m, i, `<span class="pill r">${Math.round(m.gap * 100)}%</span>`)).join("")}
      <h3>Highest modelled land prices</h3>${priced.map((m, i) => listItem(m, i, `<span class="pill s">${fmtINR(m.priceNow)}</span>`)).join("")}`;
  }

  function pDraw() {
    const modes = [["poly", "Lasso"], ["circle", "Radius"], ["rect", "Box"]];
    const tools = `<div class="tabs">${modes.map(([k, l]) => `<button class="${S.draw && S.draw.mode === k ? "on" : ""}" data-act="draw-mode" data-mode="${k}">${l}</button>`).join("")}</div>
      <div class="field"><label><span>Radius for the Radius tool</span><span>${S.radiusKm} km</span></label><input type="range" id="radiusKm" min="1" max="60" step="1" value="${S.radiusKm}"/>
      <div class="btn-row" style="margin-top:6px">${[2, 5, 10, 15, 25, 50].map((r) => `<button class="btn sm ${S.radiusKm === r ? "primary" : ""}" data-act="set-radius" data-r="${r}">${r} km</button>`).join("")}</div></div>`;
    if (!S.area) return `<p class="lead">Pick a shape and outline any patch of land: a village cluster, a corridor or a whole taluk. Bhoomi Lens samples it on a fine grid and runs the full model on every cell.</p>${tools}
      <div class="empty">${S.draw ? "Drawing in progress. Follow the hint at the top of the map." : "Choose Lasso, Radius or Box to begin."}</div>
      <h3>Try a hotspot</h3>
      <div class="btn-row">
        <button class="btn sm" data-act="quick-area" data-lon="77.61" data-lat="28.17" data-r="25">Jewar airport, 25 km</button>
        <button class="btn sm" data-act="quick-area" data-lon="73.07" data-lat="18.99" data-r="20">Navi Mumbai airport, 20 km</button>
        <button class="btn sm" data-act="quick-area" data-lon="72.19" data-lat="22.25" data-r="25">Dholera, 25 km</button>
        <button class="btn sm" data-act="quick-area" data-lon="79.79" data-lat="12.93" data-r="20">Parandur, 20 km</button>
        <button class="btn sm" data-act="quick-area" data-lon="80.52" data-lat="16.51" data-r="20">Amaravati, 20 km</button>
      </div>`;
    const A = S.area;
    const budget = +(store.get("bl_budget", 5000000));
    const acres = budget / (A.p50 * E.SQFT_PER_ACRE);
    const mid = budget * A.multMean;
    return `${tools}
      <div class="kpis">
        <div class="kpi"><div class="k">Area</div><div class="v">${A.areaKm2 >= 100 ? Math.round(A.areaKm2).toLocaleString("en-IN") : A.areaKm2.toFixed(1)} km\u00B2</div><div class="s">${Math.round(A.acres).toLocaleString("en-IN")} acres | ${A.n} grid cells</div></div>
        <div class="kpi"><div class="k">Median price</div><div class="v">${fmtINR(A.p50)}<span class="small muted">/sq ft</span></div><div class="s">${fmtINR(A.p50 * E.SQFT_PER_ACRE)} per acre</div></div>
        <div class="kpi"><div class="k">Price spread (P10 to P90)</div><div class="v" style="font-size:15px">${fmtINR(A.p10)} to ${fmtINR(A.p90)}</div><div class="s">per sq ft</div></div>
        <div class="kpi"><div class="k">${A.horizon}-yr outlook</div><div class="v up">${A.multMean.toFixed(2)}x</div><div class="s">${pct(A.cagrMean)} per year on average</div></div>
      </div>
      <h3>Price distribution</h3><div class="card">${C.histogram(A.cells.map((c) => c.price))}</div>
      <h3>Illustrative budget scenario</h3>
      <div class="card">
        <div class="field"><label><span>Budget (INR)</span><span>${fmtINR(budget)}</span></label><input type="number" id="budget" value="${budget}" min="100000" step="100000"/></div>
        <div class="small muted">At the modelled median, this budget corresponds to about <b style="color:var(--tx)">${acres >= 1 ? acres.toFixed(1) + " acres" : Math.round(acres * E.SQFT_PER_ACRE).toLocaleString("en-IN") + " sq ft"}</b>. Applying the model's average ${A.horizon}-year multiple gives <b style="color:var(--tx)">${fmtINR(mid)}</b>.</div><div class="small muted" style="margin-top:6px">This is arithmetic using unvalidated model assumptions, not a quote or return forecast. Land class, fees, taxes and plot characteristics are not included.</div>
      </div>
      <h3>Hottest cells (fastest growth)</h3>
      ${A.hotspots.map((c, i) => `<div class="list-item" data-act="fly-pt" data-lon="${c.lon}" data-lat="${c.lat}"><span class="rank">${i + 1}</span><div class="grow"><div style="font-weight:600">${c.lat.toFixed(3)}, ${c.lon.toFixed(3)}</div><div class="small muted ellipsis">${esc(c.district)} | ${c.top ? "near " + esc(c.top) : "no catalyst"}</div></div><span class="pill">${pct(c.cagr)}</span></div>`).join("")}
      <h3>Best value for growth</h3>
      ${A.value.map((c, i) => `<div class="list-item" data-act="fly-pt" data-lon="${c.lon}" data-lat="${c.lat}"><span class="rank">${i + 1}</span><div class="grow"><div style="font-weight:600">${fmtINR(c.price)}/sq ft</div><div class="small muted ellipsis">${esc(c.district)} | ${c.mult.toFixed(2)}x in ${A.horizon} yrs</div></div><span class="pill s">${pct(c.cagr)}</span></div>`).join("")}
      <h3>Catalysts inside (${A.inside.length})</h3>
      <div class="card" style="padding:4px 12px">${A.inside.length ? A.inside.map((c) => catRow(c)).join("") : '<div class="empty">None inside the boundary.</div>'}</div>
      ${A.nearby.length ? `<h3>Just outside</h3><div class="card" style="padding:4px 12px">${A.nearby.map((x) => catRow(x.c, Math.round(x.d) + " km from the edge")).join("")}</div>` : ""}
      <h3>Districts covered</h3>
      ${A.districts.slice(0, 6).map((d) => { const m = models.find((x) => x.name === d.name && x.state === d.state); return `<div class="list-item" ${m ? `data-act="open-d" data-id="${m.id}"` : ""}><div class="grow"><b>${esc(d.name)}</b> <span class="small muted">${esc(d.state)}</span></div><span class="small muted">${Math.round(d.share * 100)}%</span></div>`; }).join("")}
      <div class="btn-row" style="margin-top:12px"><button class="btn sm" data-act="area-csv">Export cells (CSV)</button><button class="btn sm danger" data-act="clear-area">Clear area</button></div>
      <p class="small muted">Computed in ${A.ms || 0} ms on a ${(A.step * 111).toFixed(1)} km grid. Estimates use ${A.n} of ${A.sampled} sampled cells inside mapped districts; selected area includes any land or water outside the map.</p>`;
  }

  function pSimulate() {
    const types = Object.entries(BL.TYPES);
    const imp = S.userCats.length ? [...models].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 8).filter((m) => Math.abs(m.delta) > 0.002) : [];
    return `<p class="lead">Explore what could happen under assumptions you choose. The numbers below are editable examples, not measured project effects or validated probabilities.</p>
      <div class="type-grid">${types.map(([k, T]) => `<button class="${S.simType === k ? "on" : ""}" style="--c:${T.color}" data-act="sim-type" data-t="${k}"><i>${esc(T.icon)}</i>${esc(T.label)}</button>`).join("")}</div>
      <div class="field"><label><span>Project name (optional)</span></label><input type="text" id="simName" placeholder="e.g. Third Mumbai airport"/></div>
      <div class="field"><label><span>Assumed effect if completed, at the project</span><span>${S.simEffect}%</span></label><input type="range" id="simEffect" min="-80" max="300" step="5" value="${S.simEffect}"/></div>
      <div class="field"><label><span>Assumed chance of completion</span><span>${S.simProbability}%</span></label><input type="range" id="simProbability" min="0" max="100" step="5" value="${S.simProbability}"/></div>
      <div class="field"><label><span>Distance scale</span><span>${S.simDistance} km</span></label><input type="range" id="simDistance" min="2" max="150" step="1" value="${S.simDistance}"/></div>
      <div class="field"><label><span>Share of probability-weighted effect already in today's price</span><span>${S.simPricedIn}%</span></label><input type="range" id="simPricedIn" min="0" max="100" step="5" value="${S.simPricedIn}"/></div>
      <div class="field"><label><span>Assumed completion year</span><span>${S.simYear}</span></label><input type="range" id="simYear" min="${MY + 1}" max="${MY + 20}" step="1" value="${S.simYear}"/></div>
      <div class="small muted" style="margin:-2px 0 10px">At the distance scale, the assumed effect falls to about 37% of its value at the project; it continues to decay beyond that distance. The model weights the assumed completion effect by your probability. The priced-in share refers to that probability-weighted effect. The assumed chance and year stay fixed across market scenarios. No causal effect has been validated for this project.</div>
      <div class="btn-row">${S.placing ? `<button class="btn primary" data-act="place-cancel">Cancel placing</button>${S.placing.path ? '<button class="btn" data-act="sim-finish">Finish route</button>' : ""}` : `<button class="btn primary" data-act="sim-place">Place on map</button>`}</div>
      ${S.userCats.length ? `
        <h3>Your simulated projects</h3>
        ${S.userCats.map((c) => `<div class="card row"><span class="cat-ico" style="background:${BL.TYPES[c.t].color}">${esc(BL.TYPES[c.t].icon)}</span><div class="grow"><div style="font-weight:600" class="ellipsis">${esc(c.n)}</div><div class="small muted">Assumed ${pct(c.assumedEffect)} at site | ${Math.round(c.assumedProbability * 100)}% chance | ${c.eta}</div></div><button class="btn sm ghost" data-act="fly-cat" data-id="${esc(c.id)}">View</button><button class="btn sm danger" data-act="sim-remove" data-id="${esc(c.id)}">Remove</button></div>`).join("")}
        <h3>Largest hypothetical district changes (${S.horizon} years)</h3>
        ${imp.length ? imp.map((m, i) => listItem(m, i, `<span class="pill ${m.delta < 0 ? "r" : ""}">${pct(m.delta)}</span>`)).join("") : '<div class="empty">No district has a material change under these assumptions.</div>'}
        <p class="small muted">These changes illustrate the model's assumptions. A total land value created cannot be estimated without verified affected land, land use and market evidence.</p>
        <div class="btn-row" style="margin-top:10px"><button class="btn sm danger" data-act="sim-clear">Clear all simulations</button></div>` : ""}`;
  }

  function pCatalysts() {
    const bb = S.inView && map.getBounds ? map.getBounds() : null;
    const inB = (c) => !bb || (c.pt ? [c.pt] : c.path || [[c.ring.lon, c.ring.lat]]).some((p) => p[0] >= bb.getWest() && p[0] <= bb.getEast() && p[1] >= bb.getSouth() && p[1] <= bb.getNorth());
    const list = allCats().filter((c) => (S.catFilter === "all" || c.t === S.catFilter) && (S.catStage === "all" || String(c.stage) === S.catStage) && inB(c))
      .sort((a, b) => E.effEta(a, S.scenario) - E.effEta(b, S.scenario));
    const types = ["all", ...Object.keys(BL.TYPES)];
    const delayed = allCats().filter((c) => c.stage < 4 && E.effEta(c, "bear") - c.eta >= 3).length;
    return `<p class="lead">Tracked projects and their recorded stages. Statuses are a snapshot and the credibility scores are model assumptions; verify current status with each source.</p>
      <div class="kpis" style="margin-bottom:10px">
        <div class="kpi"><div class="k">In pipeline</div><div class="v">${allCats().filter((c) => c.stage < 4).length}</div><div class="s">${allCats().filter((c) => c.stage === 3).length} under construction</div></div>
        <div class="kpi"><div class="k">Delay-prone</div><div class="v warn">${delayed}</div><div class="s">3+ years late in the bear case</div></div>
      </div>
      <div class="field"><label><span>Type</span></label><select id="catType">${types.map((t) => `<option value="${t}" ${S.catFilter === t ? "selected" : ""}>${t === "all" ? "All types" : esc(BL.TYPES[t].label)}</option>`).join("")}</select></div>
      <div class="field"><label><span>Stage</span></label><select id="catStage"><option value="all">All stages</option>${BL.STAGES.map((s, i) => `<option value="${i}" ${S.catStage === String(i) ? "selected" : ""}>${esc(s)}</option>`).join("")}</select></div>
      <label class="row small muted" style="margin:4px 0 4px;cursor:pointer"><input type="checkbox" id="zones" ${S.zones ? "checked" : ""}/> Show influence zones on the map</label>
      <label class="row small muted" style="margin:0 0 10px;cursor:pointer"><input type="checkbox" id="inView" ${S.inView ? "checked" : ""}/> Only projects in the current map view</label>
      <div class="card" style="padding:4px 12px">${list.length ? list.map((c) => catRow(c, `${c.ag} | credibility ${Math.round(c.cred * 100)}`)).join("") : '<div class="empty">No projects match.</div>'}</div>`;
  }

  function pScreener() {
    const sc = S.scr;
    let list = models.filter((m) => m.area > 5 && (sc.state === "all" || m.state === sc.state) && m.risk.total <= sc.maxRisk && (!sc.maxPrice || m.priceNow <= sc.maxPrice));
    const sorters = { opp: (a, b) => b.opp - a.opp, cagr: (a, b) => b.cagr - a.cagr, cheap: (a, b) => a.priceNow - b.priceNow, risk: (a, b) => a.risk.total - b.risk.total, gap: (a, b) => b.gap - a.gap, liq: (a, b) => b.liq - a.liq };
    list = list.sort(sorters[sc.sort]).slice(0, 40);
    const states = [...new Set(models.map((m) => m.state))].sort();
    const right = (m) => sc.sort === "cagr" ? `<span class="pill">${pct(m.cagr)}</span>` : sc.sort === "cheap" ? `<span class="pill s">${fmtINR(m.priceNow)}</span>` : sc.sort === "risk" ? `<span class="pill r">${Math.round(m.risk.total)}</span>` : sc.sort === "gap" ? `<span class="pill r">${Math.round(m.gap * 100)}%</span>` : sc.sort === "liq" ? `<span class="pill">${Math.round(m.liq)}</span>` : `<span class="pill">${m.opp}</span>`;
    return `<p class="lead">Filter districts using unvalidated model scores and price estimates. Results are not verified rankings or plot valuations.</p>
      <div class="field"><label><span>State</span></label><select id="scrState"><option value="all">All of India</option>${states.map((s) => `<option ${sc.state === s ? "selected" : ""}>${esc(s)}</option>`).join("")}</select></div>
      <div class="field"><label><span>Rank by</span></label><select id="scrSort">${[["opp", "Opportunity score"], ["cagr", "Forecast growth"], ["cheap", "Cheapest land"], ["risk", "Lowest risk"], ["gap", "Widest circle gap"], ["liq", "Most liquid"]].map(([k, l]) => `<option value="${k}" ${sc.sort === k ? "selected" : ""}>${l}</option>`).join("")}</select></div>
      <div class="field"><label><span>Max risk</span><span>${sc.maxRisk}</span></label><input type="range" id="scrRisk" min="20" max="100" value="${sc.maxRisk}"/></div>
      <div class="field"><label><span>Max price per sq ft (0 = any)</span></label><input type="number" id="scrPrice" min="0" step="100" value="${sc.maxPrice}"/></div>
      <div class="row sb small muted" style="margin:6px 0"><span>${list.length} results shown</span><button class="btn sm" data-act="csv">Export all districts (CSV)</button></div>
      ${list.length ? list.map((m, i) => listItem(m, i, right(m))).join("") : '<div class="empty">Nothing matches. Loosen the filters.</div>'}`;
  }

  function signalsFor(m) {
    const out = [];
    for (const L of m.links.slice(0, 5)) {
      const eta = E.effEta(L.c, S.scenario);
      if (!L.c.cancelled && L.c.stage < 4 && eta <= MY + 3) out.push({ k: "up", t: `${L.c.n}: scenario opening ${eta}, assumed delivery factor ${Math.round(E.completionP(L.c, S.scenario) * 100)}%` });
      if (!L.c.cancelled && L.c.stage <= 1 && L.c.cred < 0.55) out.push({ k: "warn", t: `${L.c.n} is early-stage with low delivery credibility` });
    }
    if (m.opp >= 75) out.push({ k: "up", t: "High model opportunity score; not a verified investment signal." });
    if (m.risk.total >= 55) out.push({ k: "down", t: "High model risk score; it does not verify title or flood exposure." });
    if (m.gap >= 0.5) out.push({ k: "warn", t: "Wide modelled circle-rate gap; check actual prices and official rates." });
    if (m.liq < 35) out.push({ k: "warn", t: "Low model liquidity score; transaction volumes were not measured." });
    return out.slice(0, 4);
  }
  function pWatch() {
    if (!S.watch.length) return `<div class="empty">Star districts from their detail card to track them here.<br/>You will see modelled signals based on the tracked-project snapshot.</div>`;
    return S.watch.map((id) => byId.get(id)).filter(Boolean).map((m) => `<div class="card click" data-act="open-d" data-id="${m.id}">
      <div class="row sb"><div><b style="font-family:var(--display);font-size:14px">${esc(m.name)}</b> <span class="small muted">${esc(m.state)}</span></div><span class="pill">${m.opp}</span></div>
      <div class="row small muted" style="gap:12px;margin:5px 0 7px"><span>${fmtINR(m.priceNow)}/sq ft</span><span class="up">${pct(m.cagr)}/yr</span><span>risk ${Math.round(m.risk.total)}</span></div>
      ${signalsFor(m).map((s) => `<div class="small ${s.k}" style="padding:2px 0">- ${esc(s.t)}</div>`).join("") || '<div class="small muted">No active signals.</div>'}
    </div>`).join("");
  }

  const CMP_COLORS = ["#ffb547", "#2ee6c5", "#b98cff"];
  function pCompare() {
    const ms = S.compare.map((id) => byId.get(id)).filter(Boolean);
    const addBox = ms.length < 3 ? `<div class="field"><label><span>Add a district (${ms.length}/3)</span></label><input id="cmpAdd" list="cmpList" placeholder="Type a district name, e.g. Krishnagiri" autocomplete="off"/><datalist id="cmpList">${models.filter((m) => !S.compare.includes(m.id)).map((m) => `<option value="${esc(m.name)} (${esc(m.state)})"></option>`).join("")}</datalist></div>` : "";
    if (!ms.length) return addBox + `<div class="empty">Pick up to three districts above (or from a district card) to compare them side by side.</div>`;
    const rows = [
      ["Price / sq ft", (m) => m.priceNow, fmtINR, "min"],
      ["Per acre", (m) => m.priceNow * E.SQFT_PER_ACRE, fmtINR, null],
      ["Circle gap", (m) => m.gap, (v) => Math.round(v * 100) + "%", null],
      [`${S.horizon}-yr multiple`, (m) => m.mult, (v) => v.toFixed(2) + "x", "max"],
      ["Growth / yr", (m) => m.cagr, (v) => pct(v), "max"],
      ["Opportunity", (m) => m.opp, (v) => v, "max"],
      ["Risk", (m) => m.risk.total, (v) => Math.round(v), "min"],
      ["Liquidity", (m) => m.liq, (v) => Math.round(v), "max"],
      ["Projects in range", (m) => m.links.length, (v) => v, "max"]
    ];
    const table = `<table class="cmp"><tr><th></th>${ms.map((m, i) => `<th style="color:${CMP_COLORS[i]}">${esc(m.name)}</th>`).join("")}</tr>${rows.map(([l, f, fmt, best]) => {
      const vals = ms.map(f); const b = best === "max" ? Math.max(...vals) : best === "min" ? Math.min(...vals) : null;
      return `<tr><td>${l}</td>${vals.map((v) => `<td class="${ms.length > 1 && v === b ? "best" : ""}">${fmt(v)}</td>`).join("")}</tr>`;
    }).join("")}</table>`;
    const chart = C.lines(ms.map((m, i) => ({ color: CMP_COLORS[i], series: E.series(m, S.scenario).map((s) => ({ y: s.y, v: (s.p / m.priceNow) * 100 })) })), { fmt: (v) => Math.round(v) });
    return `${addBox}${table}<h3>Price index (today = 100)</h3><div class="card">${chart}</div>
      <div class="btn-row">${ms.map((m) => `<button class="btn sm" data-act="cmp" data-id="${m.id}">Remove ${esc(m.name)}</button>`).join("")}</div>`;
  }

  function pHousingHistory() {
    return `<p class="lead">The National Housing Bank publishes city-wide housing indices. They describe housing markets, not vacant-land sale prices, plot valuations or an infrastructure project's causal effect.</p>
      <div class="card small" style="line-height:1.6"><h3>Open the original source</h3>
      <p><a href="https://residex.nhbonline.org.in/" target="_blank" rel="noopener noreferrer">National Housing Bank RESIDEX dashboard</a> · <a href="https://www.nhb.org.in/data-graphs/" target="_blank" rel="noopener noreferrer">Earlier NHB data and graphs</a></p>
      <p>Index bases, coverage and methods change over time. Check the original dates and definitions before comparing periods.</p>
      <p class="muted">The previously displayed archive and automatic refresh have been withdrawn while NHB's publication-specific reuse terms are clarified. <a href="https://residex.nhbonline.org.in/Dashboard/Disclaimer" target="_blank" rel="noopener noreferrer">NHB RESIDEX terms</a>.</p></div>`;
  }

  function pDataHealth() {
    const market = VERIFIED.filter(E.isMarketReference);
    const proxies = VERIFIED.filter((p) => p.derived && p.price > 0);
    const n = (v) => Number(v || 0).toLocaleString("en-IN");
    const count = (types) => market.filter((p) => types.includes(p.type)).length;
    const years = {}, byPlace = new Map();
    for (const p of market) {
      const match = String(p.date || "").match(/\b(?:19|20)\d{2}\b/);
      if (!match) { years.unknown = (years.unknown || 0) + 1; continue; }
      const year = match[0], key = `${p.state || ""}|${String(p.loc || "").toLowerCase().trim()}`;
      years[year] = (years[year] || 0) + 1;
      if (!byPlace.has(key)) byPlace.set(key, new Set());
      byPlace.get(key).add(year);
    }
    const multi = [...byPlace.values()].filter((s) => s.size > 1).length;
    const datedYears = Object.keys(years).filter((y) => /^\d{4}$/.test(y)).sort().reverse();
    const yearSummary = datedYears.slice(0, 2).map((y) => `${n(years[y])} rows have a ${esc(y)} date`).join(", ");
    const gv = window.BL_TN_GV || { rows: [] }, updates = window.BL_UPDATES || {}, gazette = window.BL_GAZETTE || {};
    const coverage = updates.coverage;
    const cpi = window.BL_MACRO_CPI || { series: [] }, wb = window.BL_MACRO_WB || { series: [] };
    const tnCpi = window.BL_TN_DISTRICT_CPI || { series: [] };
    const tnArea = tnCpi.series.find((x) => x.area === S.tnCpiArea) || tnCpi.series[0];
    const tnLatest = tnArea && [...tnArea.points].reverse().find((p) => p[1] != null);
    const tnNow = new Date(), tnMonth = tnLatest && /^(\d{4})-(\d{2})$/.exec(tnLatest[0]);
    const tnLag = tnMonth ? 12 * (tnNow.getUTCFullYear() - Number(tnMonth[1])) + tnNow.getUTCMonth() + 1 - Number(tnMonth[2]) : 0;
    const latestCPI = ["Tamil Nadu", "Maharashtra", "All India"].map((geo) => {
      const series = cpi.series.find((x) => x.geo === geo && x.base === "2024" && x.series === "Current");
      const point = series && [...series.points].reverse().find((p) => p[1] != null);
      return point ? `<div class="row sb"><span>${esc(geo)} · ${esc(point[0])}</span><b>${Number(point[1]).toFixed(2)}${point[2] == null ? "" : ` · ${Number(point[2]).toFixed(2)}% year-on-year`}</b></div>` : "";
    }).join("");
    return `<p class="lead">See what the map is built from and when each source was last captured. Coverage is uneven and these counts do not establish accuracy.</p>
      <h3>Market-related references</h3><div class="card small" style="line-height:1.6">
        <div class="row sb"><span>Priced references</span><b>${n(market.length)}</b></div>
        <div class="row sb"><span>Listings and cross-checked listing aggregates</span><b>${n(count(["listing", "consensus"]))}</b></div>
        <div class="row sb"><span>Auctions and allotments</span><b>${n(count(["govt_auction", "govt_allotment", "bank_auction"]))}</b></div>
        <div class="row sb"><span>Reported prices, deals and registrations</span><b>${n(count(["reported_deal", "registered"]))}</b></div>
        <div class="row sb"><span>TN references labelled registered sales</span><b>${n(market.filter((p) => p.state === "Tamil Nadu" && p.type === "registered").length)}</b></div>
        <p class="muted">These are reference rows, not independent completed sales. Some listings use an assumed 10% asking-to-sale adjustment, which is not validated. The same property or source may appear more than once.</p>
        <p class="muted">${yearSummary || "No dated rows"}; ${n(years.unknown)} have no parseable year. Dates may be collection dates. ${n(multi)} exact place names have rows dated in more than one year; that does not establish comparable sales.</p></div>
      <h3>Official rates and project notices</h3><div class="card small" style="line-height:1.6">
        <div class="row sb"><span>Guideline-derived price proxies</span><b>${n(proxies.length)}</b></div>
        <div class="row sb"><span>Acquisition-compensation references</span><b>${n(VERIFIED.filter((p) => p.type === "compensation" && p.price > 0).length)}</b></div>
        <div class="row sb"><span>TN rate-history locations</span><b>${n((gv.rows || []).length)}</b></div>
        <div class="row sb"><span>Tracked projects, snapshot</span><b>${n(BL.CATALYSTS.length)} · ${esc(BL.DATA_ASOF)}</b></div>
        <div class="row sb"><span>Weekly re-check, last generated</span><b>${esc(updates.gen || "Unavailable")}</b></div>
        <div class="row sb"><span>Gazette data, last generated</span><b>${esc(gazette.gen || "Unavailable")}</b></div>
        <p class="muted">Gazette refresh is paused while reuse rights for its third-party source are reviewed. Existing notices are a historical snapshot.</p>
        <p class="muted">${coverage ? `Latest re-check: ${n(coverage.news_ok)} of ${n(coverage.news_attempted)} news searches and ${n(coverage.sources_ok)} of ${n(coverage.sources_attempted)} source pages succeeded.` : "This older re-check did not record how many source requests succeeded."}</p>
        <p class="muted">Guideline values are official reference rates, not market transactions. Acquisition compensation and standalone official rates are shown as context and excluded from direct price calibration; labelled guideline-derived proxies still influence it. Village locations can be approximate name matches. Some TN history was collected without HTTPS certificate verification; check the official records before relying on it. <a href="https://github.com/Hasen1506/Ideas/blob/main/bhoomi-lens/docs/SOURCE_AUDIT.md" target="_blank" rel="noopener">Source audit</a>. News leads are unconfirmed; project statuses do not update automatically.</p></div>
      <h3>Economic context</h3><div class="card small" style="line-height:1.6">
        <div class="muted">Consumer price index · combined rural and urban · 2024 = 100</div>
        ${latestCPI || '<div class="muted">No checked CPI data available.</div>'}
        <p class="muted">Source: <a href="https://esankhyiki.mospi.gov.in/macroindicators?product=cpi" target="_blank" rel="noopener">MoSPI</a>. Consumer inflation is not a land-price trend. The latest values may be provisional; historical bases and back-series are kept separate and values can be revised.</p>
        <p class="muted">${n(wb.series.length)} India-wide <a href="https://data.worldbank.org/country/india" target="_blank" rel="noopener">World Bank</a> population and economic series are recorded as background, not district data. Captured ${esc((wb.captured_utc || "unknown").slice(0, 10))}.</p><button class="btn sm" data-act="tool" data-tool="housing">Explore NHB housing history</button></div>
      <h3>Tamil Nadu district consumer prices</h3><div class="card small" style="line-height:1.6">
        ${tnArea ? `<label for="tnCpiArea">Published area</label>
          <select id="tnCpiArea">${tnCpi.series.map((x) => `<option value="${esc(x.area)}" ${x.area === tnArea.area ? "selected" : ""}>${esc(x.area)}</option>`).join("")}</select>
          <div class="row sb" id="tnDistrictCpiCurrent"><span>Latest available · ${esc(tnLatest ? tnLatest[0] : "Unavailable")}</span><b>${tnLatest ? Number(tnLatest[1]).toFixed(1) : "Unavailable"}</b></div>
          ${tnLag >= 4 ? `<div class="warn">The latest observation is ${tnLag} months before this device’s current month.</div>` : ""}
          <div class="muted">Combined rural and urban consumer-price index · ${esc(tnCpi.base)}. These figures describe household prices, not land prices. The state series differs from the MoSPI series above.</div>
          <details class="more"><summary>Monthly index values</summary><div>${[...tnArea.points].reverse().map(([month, value]) => `<div class="row sb"><span>${esc(month)}</span><b>${value == null ? "Unavailable" : Number(value).toFixed(1)}</b></div>`).join("")}</div></details>
          <p class="muted">The report names 32 areas; their boundaries have not been matched to the current district map. <a href="${esc(tnCpi.source_url)}" target="_blank" rel="noopener">Tamil Nadu Department of Economics and Statistics</a> · captured ${esc((tnCpi.captured_utc || "unknown").slice(0, 10))}.</p>` : '<p class="muted">No checked district CPI data available.</p>'}
      </div>
      <h3>Earth observation</h3><div class="card small" style="line-height:1.6">
        <p><b>Satellite:</b> <a href="https://maps.eox.at/" target="_blank" rel="noopener">2025 cloudless mosaic</a>. Recent scene mode searches for a dated Sentinel-2 observation at the map center; clouds may remain.</p>
        <p><b>Water history:</b> <a href="https://global-surface-water.appspot.com/download" target="_blank" rel="noopener">Global Surface Water 1984–2024</a>. Both layers are coarse satellite observations, not plot boundaries or flood clearance.</p></div>
      <p class="warn">The price model, project effects, risk scores and forecast bands have not been validated for plot-level decisions. Open “How the model works” for details.</p>`;
  }

  function pMethod() {
    const BT = window.BL_BACKTEST, VS = window.BL_VERIFIED_SUMMARY;
    const btHtml = BT ? `<h3>Historical calibration cases</h3>
      <p>Some cases informed model adjustments; they are not an independent test of future forecasts or causal project effects. Reported prices, periods and comparison benchmarks differ, and some cases have no model calculation. The displayed average log errors apply to fitted cases, not an independent test.</p>
      <table class="cmp"><tr><th>Place</th><th>Years</th><th>Reported</th><th>Old</th><th>New</th></tr>${BT.rows.map((r) => `<tr><td title="${esc(r.project)}"><a href="${esc(r.src)}" target="_blank" rel="noopener">${esc(r.loc.slice(0, 30))}</a></td><td>${r.y0}-${String(r.y1).slice(2)}</td><td>${r.obs.toFixed(2)}x</td><td class="${Math.abs(Math.log(r.old / r.obs)) < 0.15 ? "best" : ""}">${r.old == null ? "-" : r.old.toFixed(2)}x</td><td class="${Math.abs(Math.log(r.now / r.obs)) < 0.15 ? "best" : ""}">${r.now == null ? "-" : r.now.toFixed(2)}x</td></tr>`).join("")}</table>
      <p style="margin-top:8px">What changed (24 Oct 2026 re-fit): airport max uplift 0.85 to 1.8, expressway 0.42 to 1.1, ring road 0.5 to 1.5, metro and rapid rail restored to 0.35 (the earlier cut to 0.2 under-predicted a Namo Bharat case), and cheap rural land gets up to 2.3x the percentage boost of built-up land. The model assumes about 85% of its project effect is priced in by opening. That earlier fit reported average log error ${BT.newLoss} versus ${BT.oldLoss} for the original model on these selected cases; it has not been reevaluated after the price-calibration changes. Some cases, including Yamuna Expressway plots and the Hyderabad ORR belt, were under-predicted; their reported changes are not independently established project effects.</p>` : "";
    const vsHtml = VS ? `<h3>Historical calibration snapshot across India</h3>
      <p>These counts, errors and district corrections describe an earlier model. They have not been recalculated after acquisition compensation and standalone official rates were removed from calibration, so they do not measure the current model's accuracy.</p>
      <p>Tamil Nadu village layer: ${VS.tnVillagesCrawled ? VS.tnVillagesCrawled.toLocaleString("en-IN") : ""} villages crawled from all 595 sub-registrar offices, ${VS.tnVillages ? VS.tnVillages.toLocaleString("en-IN") : ""} automatically geocoded and loaded as very-low-weight derived evidence (official guideline value x ${VS.tnMult}).</p>
      <p>${VS.total} reference localities: ${VS.pricePoints} price references and ${VS.govtPoints} official rates. Price references include listings and reported deals. Before calibration the reported typical error was ${Math.round(VS.errBefore * 100)}%; hiding individual points gave ${Math.round(VS.errLOO * 100)}%. Nearby points and shared sources may be related, so this is not an independent geographic or future-period validation.</p>
      <table class="cmp"><tr><th>State</th><th>Points</th><th>Error before</th><th>After</th></tr>${(VS.stateStats || []).map((x) => `<tr><td>${esc(x.s)}</td><td>${x.n}</td><td>${Math.round(x.before * 100)}%</td><td class="${x.after < x.before ? "best" : ""}">${Math.round(x.after * 100)}%</td></tr>`).join("")}</table>
      <p style="margin-top:8px"><b>Biggest district corrections</b></p>
      <table class="cmp"><tr><th>District</th><th>Old est.</th><th>Now</th><th>Change</th></tr>${VS.districts.map((d) => `<tr><td>${esc(d.n)}</td><td>${fmtINR(d.old)}</td><td>${fmtINR(d.now)}</td><td class="${d.now < d.old ? "down" : "up"}">${pct(d.now / d.old - 1, 0)}</td></tr>`).join("")}</table>
      <p style="margin-top:8px"><b>Sources</b></p>${VS.sources.map((x) => `<p>- <b>${esc(x[0])}</b>: ${esc(x[1])}. Reliability: ${esc(x[2])}.</p>`).join("")}<p class="warn">${esc(VS.gaps)}</p>` : "";
    return `<div class="note">
      <p><b>Project and market reference snapshot: ${esc(BL.DATA_ASOF)}.</b> The ${BL.CATALYSTS.length} tracked projects have source links and may have changed since. Reference data include adjusted listings and guideline-derived proxies; they are not all observed sale prices.</p>
      ${vsHtml}${btHtml}
      <p><b>What this is.</b> Bhoomi Lens is a modelled land-intelligence map. It turns public reference points into an estimate of what land is worth today, where it is heading and what could go wrong. It is not a record of registered transactions.</p>
      <h3>Where every number comes from</h3>
      <p>Prices shown by the model are estimates. Reference points are tagged by type, date and source link (click a dot with Real data on):</p>
      <p>- <b>Govt auction / allotment</b> (gold): reported auction or allotment figures; an auction figure can be a reserve rather than a completed sale.<br/>- <b>Registered / reported deal</b> (teal): reported registrations or land deals.<br/>- <b>Listing</b> (light grey): portal asking prices, cut by an unvalidated 10% assumption for the model.<br/>- <b>Acquisition compensation</b>: reported compensation or offers, shown as context and excluded from price calibration.<br/>- <b>Official govt rate</b> (shown inside each point): guideline, circle, ready reckoner or jantri value; a standalone rate is not used as a market price.<br/>- <b>Derived village value</b> (dark grey, Tamil Nadu only): a reported guideline median where available, otherwise a calculated geometric midpoint of the reported range, multiplied by a district-specific or state-default ratio. The midpoint is not an official single rate; these low-weight derived values are not observed sales.</p>
      <p>Individual sale deeds are not included. Location estimates use a model adjusted by nearby reference data, including guideline-derived estimates. The location card shows the model inputs and their weights; it is not a valuation of a specific plot.</p>
      <h3>1. Price today</h3>
      <p>Each district's price combines a rural baseline (typical agricultural land per acre in that state) with urban gravity: the pull of ${BL.ANCHORS.length} city anchors, each decaying with distance. Circle rates are modelled from state-level guidance-to-market ratios.</p>
      <h3>2. Catalyst uplift</h3>
      <p>Each project has an assumed type-specific uplift and reach. Impact = assumed uplift x distance decay x assumed completion probability x the assumed share already priced in. These are scenarios, not estimates of causation.</p>
      <p><b>Completion probability</b> is a heuristic based on stage and agency credibility; it has not been probability-calibrated. The current formula assumes 35% of the effect at announcement and 85% by opening.</p>
      <h3>3. Forecast band</h3>
      <p>The illustrative band widens with time and unfinished projects. Its coverage has not been tested; it is not an 80% prediction interval. The bear and bull cases change assumptions about completion, timing and growth.</p>
      <h3>4. Risk, liquidity, opportunity</h3>
      <p>Risk and liquidity use state-level assumptions, geography and synthetic local variation, not site-specific hazard, title or transaction-volume data. Opportunity ranks these modelled inputs; it is not an investment recommendation.</p>
      <h3>What the latest official-rate experiment showed</h3>
      <p>The statewide Tamil Nadu experiment reported 9.9% median error for LightGBM versus 1.2% for a district-median baseline on 2017–2024 official-rate growth. Official revisions were often uniform, so this result cannot validate market growth or project uplift. Market-side observations and independent time and region holdouts are needed.</p>
      <h3>5. Looks like</h3>
      <p>Each district is matched to the closest of ${BL.ANALOGUES.length} historical Indian growth stories on price level, pipeline momentum, urban proximity and fundamental growth.</p>
      <h3>Plug in real data</h3>
      <p>Add registered values from state IGR portals to <code>data/overrides.js</code>. The model uses your values in place of its estimates and labels those districts "Your data".</p>
      <p class="warn">Indicative estimates for research and exploration only. This is not investment, legal or valuation advice. Verify title, zoning and project status independently before transacting.</p>
    </div>`;
  }

  /* panel input handlers (delegated) */
  $("#panelBody").addEventListener("input", (e) => {
    const t = e.target;
    if (["simEffect", "simProbability", "simDistance", "simPricedIn", "simYear"].includes(t.id)) {
      S[t.id] = +t.value;
      const label = t.parentElement.querySelector("label span:last-child");
      if (label) label.textContent = t.value + (t.id === "simDistance" ? " km" : t.id === "simYear" ? "" : "%");
    }
    else if (t.id === "scrRisk") { S.scr.maxRisk = +t.value; refreshPanelKeepScroll(); }
    else if (t.id === "radiusKm") { S.radiusKm = +t.value; const lab = t.parentElement.querySelector("label span:last-child"); if (lab) lab.textContent = S.radiusKm + " km"; }
  });
  $("#panelBody").addEventListener("change", (e) => {
    const t = e.target;
    if (t.id === "cmpAdd") { const v = t.value.replace(/\s*\([^)]*\)\s*$/, "").trim().toLowerCase(); const st = (/\(([^)]*)\)\s*$/.exec(t.value) || [])[1]; const m = models.find((x) => x.name.toLowerCase() === v && (!st || x.state === st)); if (m && !S.compare.includes(m.id) && S.compare.length < 3) { toggleList("compare", m.id); toast("Added " + m.name + " to compare"); refreshPanel(); } else if (!m) toast("No district called " + t.value); }
    else if (t.id === "catType") { S.catFilter = t.value; setMarkerVisibility(); applyTypeFilter(); const pt = $("#projType"); if (pt) pt.value = [...pt.options].some((o) => o.value === S.catFilter) ? S.catFilter : "all"; refreshPanel(); }
    else if (t.id === "catStage") { S.catStage = t.value; setMarkerVisibility(); refreshPanel(); }
    else if (t.id === "inView") { S.inView = t.checked; refreshPanel(); }
    else if (t.id === "zones") {
      S.zones = t.checked;
      ["cat-glow", "cat-infl"].forEach((l) => map.setLayoutProperty(l, "visibility", S.zones && S.proj ? "visible" : "none"));
      if (S.zones && !S.proj) $("#btnProj").click();
    }
    else if (t.id === "scrState") { S.scr.state = t.value; refreshPanel(); }
    else if (t.id === "scrSort") { S.scr.sort = t.value; refreshPanel(); }
    else if (t.id === "scrPrice") { S.scr.maxPrice = Math.max(0, +t.value || 0); refreshPanel(); }
    else if (t.id === "tnCpiArea") { S.tnCpiArea = t.value; refreshPanelKeepScroll(); }
    else if (t.id === "budget") { store.set("bl_budget", Math.max(100000, +t.value || 0)); refreshPanelKeepScroll(); }
  });
  function keepName(fn) { const v = $("#simName") ? $("#simName").value : ""; fn(); if ($("#simName")) $("#simName").value = v; }
  function refreshPanelKeepScroll() {
    const b = $("#panelBody"), st = b.scrollTop, a = document.activeElement && document.activeElement.id;
    refreshPanel(); b.scrollTop = st;
    if (a && $("#" + a)) { $("#" + a).focus(); }
  }

  /* ------------------------------------------------------------------ */
  /* Global action delegation                                             */
  /* ------------------------------------------------------------------ */
  document.addEventListener("click", (e) => {
    const a = e.target.closest("[data-act]"); if (!a) return;
    const act = a.dataset.act, id = a.dataset.id;
    const num = id != null && /^\d+$/.test(id) ? +id : id;
    switch (act) {
      case "open-d": openDetail(num); break;
      case "close-detail": closeDetail(); clearFocus(); break;
      case "clear-focus": clearFocus(); closeDetail(); break;
      case "fly-cat": focusCatalyst(id); break;
      case "fly-pt": map.flyTo({ center: [+a.dataset.lon, +a.dataset.lat], zoom: 12, duration: 1000 }); new maplibregl.Popup({ offset: 8 }).setLngLat([+a.dataset.lon, +a.dataset.lat]).setHTML(`<b>Grid cell</b><div class="small muted">${(+a.dataset.lat).toFixed(4)}, ${(+a.dataset.lon).toFixed(4)}</div>`).addTo(map); break;
      case "star": toggleList("watch", num); toast(S.watch.includes(num) ? "Added to watchlist" : "Removed from watchlist"); break;
      case "focus-d": { const m = byId.get(num); if (m) setFocus({ kind: "district", id: m.id, state: m.state, label: m.name + ", " + m.state }); break; }
      case "focus-s": { const m = byId.get(num); if (m) setFocus({ kind: "state", state: m.state, label: m.state }); break; }
      case "cmp":
        if (!S.compare.includes(num) && S.compare.length >= 3) { toast("You can compare up to three districts"); break; }
        toggleList("compare", num); if (S.compare.includes(num)) toast("Added to compare"); break;
      case "report": report(byId.get(num)); break;
      case "radius": { const m = byId.get(num); finishArea(E.circleRing(m.lon, m.lat, 15, 72)); break; }
      case "quick-area": finishArea(E.circleRing(+a.dataset.lon, +a.dataset.lat, +a.dataset.r, 72)); break;
      case "sim-here": { const m = byId.get(num); openTool("simulate", true); map.flyTo({ center: [m.lon, m.lat], zoom: 8 }); toast("Pick a project type, then press Place on map"); break; }
      case "draw-mode": startDraw(a.dataset.mode); break;
      case "set-radius": S.radiusKm = +a.dataset.r; if (S.loc && a.dataset.go) finishArea(E.circleRing(S.loc.lon, S.loc.lat, S.radiusKm, 72)); else refreshPanelKeepScroll(); break;
      case "loc-radius": S.radiusKm = +a.dataset.r; finishArea(E.circleRing(+a.dataset.lon, +a.dataset.lat, S.radiusKm, 72)); break;
      case "open-loc": openLocation(+a.dataset.lon, +a.dataset.lat); break;
      case "verified": verifiedPopup(+a.dataset.i); break;
      case "draw-cancel": cancelDraw(); break;
      case "clear-area": clearArea(); break;
      case "area-csv": areaCSV(); break;
      case "sim-type": S.simType = a.dataset.t; keepName(refreshPanel); break;
      case "sim-place": startPlacement(); keepName(refreshPanel); break;
      case "sim-finish": finishPlacement(); break;
      case "place-cancel": cancelPlacement(); refreshPanel(); break;
      case "sim-remove": removeUserCat(id); break;
      case "sim-clear": S.userCats = []; recompute(); refreshCatalystSources(); if (S.area) reanalyse(); if (S.layer === "impact") S.layer = "growth"; renderLayerSeg(); paint(); break;
      case "csv": allCSV(); break;
      case "tool": openTool(a.dataset.tool); break;
    }
  });
  function toggleList(key, id) {
    const arr = S[key], i = arr.indexOf(id);
    if (i >= 0) arr.splice(i, 1); else arr.push(id);
    store.set(key === "watch" ? "bl_watch" : "bl_compare", arr);
    renderRail(); if (S.sel != null) renderDetail(); if (S.tool) refreshPanel();
  }

  /* ------------------------------------------------------------------ */
  /* Exports                                                              */
  /* ------------------------------------------------------------------ */
  function download(name, text, type = "text/csv") {
    const blob = new Blob([text], { type }); const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const csvCell = BL.CSV.escapeCell;
  function allCSV() {
    const head = ["district", "state", "lat", "lon", "model_price_inr_sqft", "model_price_inr_acre", "model_circle_rate_inr_sqft", "model_gap_pct", `model_multiple_${S.horizon}y`, "illustrative_low_unvalidated", "illustrative_high_unvalidated", "model_growth_pct_per_year", "model_opportunity_score", "model_risk_score", "model_liquidity_score", "top_model_project", "model_analogue", "scenario", "horizon_years", "model_base_year", "validation_status"];
    const rows = models.map((m) => [m.name, m.state, m.lat, m.lon, Math.round(m.priceNow), Math.round(m.priceNow * E.SQFT_PER_ACRE), Math.round(m.circle), Math.round(m.gap * 100), m.mult.toFixed(3), m.lo.toFixed(3), m.hi.toFixed(3), (m.cagr * 100).toFixed(2), m.opp, Math.round(m.risk.total), Math.round(m.liq), m.links[0] ? m.links[0].c.n : "", E.analogueFor(m.vec).a.n, S.scenario, S.horizon, MY, "unvalidated heuristic"]);
    download(`bhoomi-lens-districts-${S.scenario}-${S.horizon}y.csv`, [head, ...rows].map((r) => r.map(csvCell).join(",")).join("\n"));
  }
  function areaCSV() {
    if (!S.area) return;
    const rows = [["lat", "lon", "district", "state", "model_price_inr_sqft", "model_multiple", "model_growth_pct_per_year", "top_model_project", "scenario", "horizon_years", "model_base_year", "validation_status"], ...S.area.cells.map((c) => [c.lat.toFixed(4), c.lon.toFixed(4), c.district, c.state, Math.round(c.price), c.mult.toFixed(3), (c.cagr * 100).toFixed(2), c.top || "", S.scenario, S.horizon, MY, "unvalidated heuristic"])];
    download("bhoomi-lens-area.csv", rows.map((r) => r.map(csvCell).join(",")).join("\n"));
  }
  function report(m) {
    if (!m) return;
    const ser = E.series(m, S.scenario), con = E.contributions(m, S.horizon, S.scenario), an = E.analogueFor(m.vec);
    con.parts.forEach((p) => (p.color = p.c ? BL.TYPES[p.c.t].color : "#8fa3c7"));
    const w = window.open("", "_blank");
    if (!w) { toast("Allow pop-ups to download the report"); return; }
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(m.name)} - Bhoomi Lens report</title>
      <style>body{font-family:Inter,system-ui,sans-serif;color:#111827;max-width:780px;margin:28px auto;padding:0 20px;font-size:13px}h1{font-size:28px;margin:4px 0}h2{font-size:14px;text-transform:uppercase;letter-spacing:1px;color:#6b7280;margin:26px 0 8px;border-bottom:1px solid #e5e7eb;padding-bottom:6px}.k{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.k div{border:1px solid #e5e7eb;border-radius:10px;padding:10px}.k b{display:block;font-size:18px;margin-top:3px}.muted{color:#6b7280}.chart{width:100%}.chart .grid{stroke:#e5e7eb}.chart .axis{fill:#6b7280;font-size:9px}.chart .hist{fill:none;stroke:#64748b;stroke-width:2}.chart .proj{fill:none;stroke:#f59e0b;stroke-width:2.4;stroke-dasharray:5 3}.chart .today{stroke:#9ca3af;stroke-dasharray:2 3}.chart .dot{fill:#f59e0b}.chart .mark line{stroke:#e5e7eb}.bars{display:flex;flex-direction:column;gap:6px}.bar-row{display:grid;grid-template-columns:220px 1fr 60px;gap:8px;align-items:center}.bar-t{height:8px;background:#f3f4f6;border-radius:6px}.bar-f{height:100%;border-radius:6px}.bar-v{text-align:right}table{width:100%;border-collapse:collapse}td{padding:6px 4px;border-bottom:1px solid #f3f4f6}.stage{display:none}.disc{margin-top:28px;font-size:11px;color:#6b7280;border-top:1px solid #e5e7eb;padding-top:10px}</style></head><body>
      <div class="muted">BHOOMI LENS | LAND INTELLIGENCE REPORT | ${new Date().toLocaleDateString("en-IN")}</div>
      <h1>${esc(m.name)}</h1><div class="muted">${esc(m.state)} | ${m.nearest ? Math.round(m.nearestD) + " km from " + esc(m.nearest.n) : ""} | ${esc(BL.SCENARIOS[S.scenario].label)} case, ${S.horizon}-year horizon</div>
      <h2>Summary</h2><div class="k">
        <div>Model price estimate<b>${fmtINR(m.priceNow)}/sq ft</b><span class="muted">${fmtINR(m.priceNow * E.SQFT_PER_ACRE)}/acre</span></div>
        <div>Model circle rate<b>${fmtINR(m.circle)}/sq ft</b><span class="muted">gap ${Math.round(m.gap * 100)}%</span></div>
        <div>${S.horizon}-yr multiple<b>${m.mult.toFixed(2)}x</b><span class="muted">illustrative band ${m.lo.toFixed(2)}x to ${m.hi.toFixed(2)}x</span></div>
        <div>Scores<b>${m.opp} | ${Math.round(m.risk.total)} | ${Math.round(m.liq)}</b><span class="muted">opportunity | risk | liquidity</span></div></div>
      <h2>Price path</h2>${C.fan(ser, { w: 740, h: 230 })}<p class="muted">The band is an unvalidated assumption, not a prediction interval.</p>
      <h2>Model components</h2>${C.bars(con.parts)}<p class="muted">These are model inputs, not estimates of causal project effects.</p>
      <h2>Projects in range</h2><table>${m.links.slice(0, 10).map((L) => `<tr><td><b>${esc(L.c.n)}</b><br><span class="muted">${esc(BL.TYPES[L.c.t].label)} | ${esc(L.c.ag)}</span></td><td>${esc(BL.STAGES[L.c.stage])}</td><td>ETA ${E.effEta(L.c, S.scenario)}</td><td>${Math.round(E.completionP(L.c, S.scenario) * 100)}% assumed</td><td>${Math.round(L.d)} km</td></tr>`).join("") || "<tr><td>None tracked nearby</td></tr>"}</table>
      <h2>Modelled risk</h2><p class="muted">Heuristic district indicators, not site-specific hazard or title checks.</p><table>${[["Flood", m.risk.flood], ["Heat", m.risk.heat], ["Water stress", m.risk.water], ["Title and records", m.risk.title], ["Buyer restrictions", m.risk.reg]].map(([k, v]) => `<tr><td>${k}</td><td>${riskWord(v)}</td><td>${Math.round(v * 100)}/100</td></tr>`).join("")}</table>
      <h2>Historical analogue</h2><p><b>${esc(an.a.n)} in ${an.a.y}</b> (${Math.round(an.similarity * 100)}% similar). ${esc(an.a.why)} Land there moved roughly ${an.a.mult}x over the following decade.</p>
      <div class="disc">Modelled, indicative estimates generated by Bhoomi Lens from public reference points. Not registered transaction data and not investment, legal or valuation advice. Verify title, zoning, encumbrances and project status independently.</div>
      <script>setTimeout(function(){window.print()},400)<\/script></body></html>`);
    w.document.close();
  }

  /* ------------------------------------------------------------------ */
  /* Command palette                                                      */
  /* ------------------------------------------------------------------ */
  const pal = $("#palette"), pin = $("#paletteInput"), plist = $("#paletteList");
  let pItems = [], pIdx = 0;
  const INDEX = [
    ...models.map((m) => ({ k: "District", t: m.name, s: m.state, go: () => openDetail(m.id) })),
    ...BL.CATALYSTS.map((c) => ({ k: "Project", t: c.n, s: BL.TYPES[c.t].label, go: () => focusCatalyst(c.id) })),
    ...BL.ANCHORS.map((a) => ({ k: "City", t: a.n, s: "City", go: () => map.flyTo({ center: [a.lon, a.lat], zoom: 9, duration: 1400 }) })),
    // Survey-number search: every notified village with survey numbers (official notices). Type a survey number or village name.
    ...((BL.Infra && BL.Infra.data && BL.Infra.data.acq) || []).filter((x) => x.sv && x.ll).map((x) => ({ k: "Notice", t: `${x.v} (notified, ${x.nt || "notice"} ${x.dt || ""})`, s: "Survey nos " + (Array.isArray(x.sv) ? x.sv.join(", ") : x.sv), go: () => { map.flyTo({ center: x.ll, zoom: 13, duration: 1400 }); BL.Infra.setLayer && BL.Infra.setLayer(map, "acq", true); } })),
    ...[...new Set(models.map((m) => m.state))].map((s) => ({ k: "State", t: s, s: "State or UT", go: () => fitState(s) })),
    // Suburbs and localities with real price evidence, then Tamil Nadu villages, so "Tambaram" works offline.
    ...(() => { const seen = new Set(); return (window.BL_VERIFIED || []).filter((p) => p.loc && p.lat).map((p) => ({ p, t: String(p.loc).split(/[,(]/)[0].trim() })).filter((x) => { const k = [x.t, x.p.district, x.p.state].join("|").toLowerCase(); return x.t.length > 2 && !seen.has(k) && seen.add(k); }).map((x) => ({ k: "Locality", t: x.t, s: [x.p.district, x.p.state].filter(Boolean).join(", "), go: () => { map.flyTo({ center: [x.p.lon, x.p.lat], zoom: 12.5, duration: 1400 }); openLocation(x.p.lon, x.p.lat); } })); })(),
    ...(() => { const seen = new Set(); return (window.BL_TN_VILLAGES || window.TN_VILLAGES || []).filter((r) => Array.isArray(r) && r[3]).filter((r) => { const k = `${r[0]}|${r[2]}`.toLowerCase(); return !seen.has(k) && seen.add(k); }).map((r) => ({ k: "Village", t: r[0], s: r[2] + ", Tamil Nadu", go: () => { map.flyTo({ center: [r[4], r[3]], zoom: 13, duration: 1400 }); openLocation(r[4], r[3]); } })); })(),
    ...((window.BL_TN_GV || {}).rows || []).map((r) => ({ k: "TN rate", t: r[0], s: `${r[1]}, ${r[2]} SRO, ${r[3]}, Tamil Nadu`, go: () => { map.flyTo({ center: [r[5], r[4]], zoom: 13, duration: 1400 }); openLocation(r[5], r[4]); } }))
  ];
  function fitState(s) {
    const b = new maplibregl.LngLatBounds();
    for (const m of models) if (m.state === s) b.extend([m.lon, m.lat]);
    if (!b.isEmpty()) map.fitBounds(b, { padding: 120, duration: 1200, maxZoom: 8 });
    S.scr.state = s; openTool("screener", true);
  }
  const onlineStatus = $("#onlineStatus"), geoCache = new Map();
  let geoAbort = null, geoSeq = 0, lastGeoRequest = 0;
  function openPalette() { pal.classList.remove("hidden"); pin.value = ""; onlineStatus.textContent = "Optional: sends your query to Photon / OpenStreetMap."; renderPalette(); setTimeout(() => pin.focus(), 20); }
  function closePalette() { pal.classList.add("hidden"); geoSeq++; if (geoAbort) geoAbort.abort(); }
  function renderPalette() {
    if (geoAbort) { geoSeq++; geoAbort.abort(); geoAbort = null; }
    onlineStatus.textContent = "Optional: sends your query to Photon / OpenStreetMap.";
    const q = pin.value.trim().toLowerCase();
    if (!q) pItems = [...INDEX.filter((x) => x.k === "City").slice(0, 6), ...INDEX.filter((x) => x.k === "Project").slice(0, 6)];
    else pItems = INDEX.map((x) => { const t = x.t.toLowerCase(); const sc = t.startsWith(q) ? 3 : t.includes(q) ? 2 : x.s.toLowerCase().includes(q) ? 1 : 0; return { x, sc }; }).filter((o) => o.sc).sort((a, b) => b.sc - a.sc || a.x.t.length - b.x.t.length).slice(0, 40).map((o) => o.x);
    pIdx = 0; drawPalette();
  }
  async function geocode() {
    const q = pin.value.trim().toLowerCase();
    if (q.length < 3) { onlineStatus.textContent = "Enter at least three characters to search online."; return; }
    const apply = (features) => {
      if (q !== pin.value.trim().toLowerCase() || pal.classList.contains("hidden")) return;
      const extra = features.filter((f) => f && f.geometry && f.geometry.type === "Point" && Array.isArray(f.geometry.coordinates) && f.geometry.coordinates.every(Number.isFinite) && (f.properties || {}).countrycode === "IN").map((f) => {
        const p = f.properties, lon = f.geometry.coordinates[0], lat = f.geometry.coordinates[1];
        return { k: "Place", t: String(p.name || p.city || p.county || "Place"), s: [p.city, p.county, p.state, p.country].filter(Boolean).join(", "), go: () => { map.flyTo({ center: [lon, lat], zoom: 12, duration: 1400 }); openLocation(lon, lat); } };
      });
      pItems = pItems.filter((x) => x.k !== "Place").concat(extra); drawPalette();
      onlineStatus.textContent = `${extra.length} online results from Photon / OpenStreetMap. Locations are approximate.`;
    };
    if (geoCache.has(q)) { apply(geoCache.get(q)); return; }
    if (Date.now() - lastGeoRequest < 1200) { onlineStatus.textContent = "Please wait a moment before searching again."; return; }
    if (geoAbort) geoAbort.abort();
    const controller = new AbortController(), request = ++geoSeq; geoAbort = controller; lastGeoRequest = Date.now();
    const timeout = setTimeout(() => controller.abort(), 12000);
    onlineStatus.textContent = "Searching Photon / OpenStreetMap…";
    try {
      const params = new URLSearchParams({ q, limit: "6", bbox: "68,6,98,38" });
      const r = await fetch("https://photon.komoot.io/api/?" + params, { signal: controller.signal });
      if (!r.ok) throw new Error("Online search is unavailable");
      const data = await r.json();
      if (request !== geoSeq || !Array.isArray(data.features)) return;
      if (geoCache.size >= 50) geoCache.delete(geoCache.keys().next().value);
      geoCache.set(q, data.features); apply(data.features);
    } catch (e) { if (request === geoSeq && !pal.classList.contains("hidden")) onlineStatus.textContent = "Online search unavailable. Local results remain available."; }
    finally { clearTimeout(timeout); if (geoAbort === controller) geoAbort = null; }
  }
  $("#onlineSearch").addEventListener("click", geocode);
  function drawPalette() {
    plist.innerHTML = pItems.length ? pItems.map((x, i) => `<div class="p-item ${i === pIdx ? "on" : ""}" data-i="${i}"><span class="pk">${esc(x.k)}</span><div class="grow"><b>${esc(x.t)}</b> <span class="small muted">${esc(x.s)}</span></div></div>`).join("") : '<div class="empty">No matches</div>';
    const on = plist.querySelector(".on"); if (on && on.scrollIntoView) on.scrollIntoView({ block: "nearest" });
  }
  pin.addEventListener("input", renderPalette);
  pin.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { pIdx = Math.min(pItems.length - 1, pIdx + 1); drawPalette(); e.preventDefault(); }
    else if (e.key === "ArrowUp") { pIdx = Math.max(0, pIdx - 1); drawPalette(); e.preventDefault(); }
    else if (e.key === "Enter" && pItems[pIdx]) { closePalette(); pItems[pIdx].go(); }
  });
  plist.addEventListener("click", (e) => { const it = e.target.closest("[data-i]"); if (it) { closePalette(); pItems[+it.dataset.i].go(); } });
  pal.addEventListener("click", (e) => { if (e.target === pal) closePalette(); });
  $("#searchBtn").addEventListener("click", openPalette);

  /* ------------------------------------------------------------------ */
  /* Keyboard, hash, intro, toast                                         */
  /* ------------------------------------------------------------------ */
  document.addEventListener("keydown", (e) => {
    const typing = /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName);
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); openPalette(); return; }
    if (e.key === "Escape") {
      if (!pal.classList.contains("hidden")) closePalette();
      else if (S.draw) cancelDraw();
      else if (S.placing) { cancelPlacement(); refreshPanel(); }
      else if (popup && popup.isOpen()) popup.remove();
      else if (S.sel != null || S.loc) closeDetail();
      else if (S.tool) closeTool();
      return;
    }
    if (typing) return;
    if (e.key === "Enter") { if (S.draw && S.draw.mode === "poly") finishPoly(); else if (S.placing && S.placing.path) finishPlacement(); return; }
    if (e.key === "Backspace" && S.draw && S.draw.mode === "poly" && S.draw.pts.length) { S.draw.pts.pop(); renderDraw(S.draw.pts, "poly"); return; }
    if (e.key === "/") { e.preventDefault(); openPalette(); return; }
    const keys = Object.keys(LAYERS);
    if (/^[1-7]$/.test(e.key)) setLayer(keys[+e.key - 1]);
    else if (e.key.toLowerCase() === "d") openTool("draw", true);
    else if (e.key.toLowerCase() === "s") openTool("simulate", true);
    else if (e.key.toLowerCase() === "c") openTool("catalysts", true);
    else if (e.key === " ") { e.preventDefault(); $("#playBtn").click(); }
  });

  let hashT = null;
  function writeHash() {
    clearTimeout(hashT);
    hashT = setTimeout(() => {
      const p = new URLSearchParams();
      p.set("l", S.layer); if (S.year !== MY) p.set("y", S.year);
      if (S.horizon !== 5) p.set("h", S.horizon); if (S.scenario !== "base") p.set("s", S.scenario);
      if (S.sel != null) p.set("d", S.sel);
      if (S.loc) p.set("pt", `${S.loc.lat.toFixed(4)},${S.loc.lon.toFixed(4)}`);
      history.replaceState(null, "", "#" + p.toString());
    }, 250);
  }
  function readHash() {
    const p = new URLSearchParams(location.hash.slice(1));
    if (p.get("s") && BL.SCENARIOS[p.get("s")]) { S.scenario = p.get("s"); $("#scenario").value = S.scenario; }
    if (p.get("h") && ["3", "5", "10"].includes(p.get("h"))) { S.horizon = +p.get("h"); $("#horizon").value = p.get("h"); }
    if (p.get("l") && LAYERS[p.get("l")] && p.get("l") !== "impact") S.layer = p.get("l");
    recompute();
    if (p.get("y")) setYear(clamp(+p.get("y"), BL.YEAR_MIN, BL.YEAR_MAX)); else { renderLayerSeg(); paint(); }
    const pt = (p.get("pt") || "").match(/^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/);
    if (pt) openLocation(+pt[2], +pt[1]);
    else if (p.get("d") && byId.has(+p.get("d"))) openDetail(+p.get("d"));
  }

  let toastT = null;
  function toast(msg) {
    const t = $("#toast"); t.textContent = msg; t.classList.add("show");
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("show"), 2800);
  }
  $("#introGo").addEventListener("click", () => { $("#intro").classList.add("hidden"); store.set("bl_intro", true); openTool("explore", true); });
  $("#methodLink").addEventListener("click", (e) => { e.preventDefault(); openTool("method", true); });

  renderLayerSeg();
  renderRail();
  renderLegend();
  if (BL.Accounts) BL.Accounts.onChange = () => {
    S.watch = store.get("bl_watch", []); S.compare = store.get("bl_compare", []);
    renderRail(); if (S.sel != null) renderDetail(); else if (S.loc) renderLocation();
    if (S.tool) refreshPanel();
  };
  window.BhoomiLens = { S, models, map, recompute, paint };
})();
