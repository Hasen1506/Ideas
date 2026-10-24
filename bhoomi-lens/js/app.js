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
    impact: ["#0b1020", "#0f2440", "#0f3e66", "#08618f", "#0089b8", "#00b3d9", "#2ee6f0", "#9ff8f6", "#ffffff"]
  };
  const LAYERS = {
    price: { label: "Price", title: "Estimated market price", norm: (m) => (Math.log10(Math.max(m.price, 5)) - 1) / 3.5, val: (m) => fmtINR(m.price) + " / sq ft", ll: ["\u20B910", "\u20B9300", "\u20B930k+"] },
    growth: { label: "Growth", title: "Forecast growth per year", norm: (m) => (m.cagr - 0.035) / 0.09, val: (m) => pct(m.cagr) + " / yr", ll: ["3.5%", "8%", "12.5%+"] },
    opp: { label: "Opportunity", title: "Opportunity score", norm: (m) => m.opp / 100, val: (m) => m.opp + " / 100", ll: ["0", "50", "100"] },
    risk: { label: "Risk", title: "Composite risk", norm: (m) => (m.risk.total - 22) / 36, val: (m) => Math.round(m.risk.total) + " / 100", ll: ["Low", "Medium", "High"] },
    liq: { label: "Liquidity", title: "Liquidity (ease of exit)", norm: (m) => m.liq / 100, val: (m) => Math.round(m.liq) + " / 100", ll: ["Illiquid", "", "Liquid"] },
    gap: { label: "Circle gap", title: "Market price above circle rate", norm: (m) => (m.gap - 0.3) / 0.3, val: (m) => Math.round(m.gap * 100) + "% above circle", ll: ["30%", "45%", "60%"] },
    impact: { label: "Sim impact", title: "Uplift from your simulated projects", norm: (m) => Math.pow(clamp(m.delta / 0.35), 0.6), val: (m) => pct(m.delta), ll: ["0%", "+8%", "+35%"] }
  };
  const TOOLS = [
    { id: "explore", label: "Explore and insights", icon: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5" stroke="currentColor" stroke-width="1.8" fill="none"/>' },
    { id: "draw", label: "Draw an area", icon: '<path d="M5 18l3-11 9 2 2 8z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-dasharray="3 2"/><circle cx="5" cy="18" r="2" fill="currentColor"/><circle cx="8" cy="7" r="2" fill="currentColor"/><circle cx="17" cy="9" r="2" fill="currentColor"/><circle cx="19" cy="17" r="2" fill="currentColor"/>' },
    { id: "simulate", label: "Ripple simulator", icon: '<circle cx="12" cy="12" r="2.5" fill="currentColor"/><circle cx="12" cy="12" r="6" fill="none" stroke="currentColor" stroke-width="1.6" opacity=".7"/><circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" stroke-width="1.4" opacity=".4"/>' },
    { id: "catalysts", label: "Catalyst tracker", icon: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round"/>' },
    { id: "screener", label: "Screener", icon: '<path d="M4 5h16l-6 7.5V19l-4-2v-4.5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>' },
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
    tool: null, sel: null, three: false, sat: false, heat: false, zones: false,
    userCats: [], watch: store.get("bl_watch", []), compare: store.get("bl_compare", []),
    playing: false, draw: null, placing: null, area: null, catFilter: "all", catStage: "all",
    simType: "airport", simStage: 2, simCred: 0.65, hoverId: null, radiusKm: 10, loc: null, real: false, proj: false, tint: true,
    scr: { state: "all", sort: "opp", maxRisk: 100, maxPrice: 0 }
  };
  const opts = () => ({ year: S.year, horizon: S.horizon, scenario: S.scenario });
  const allCats = () => BL.CATALYSTS.concat(S.userCats);
  const catById = (id) => allCats().find((c) => c.id === id);

  const GEO = window.BL_DISTRICTS;
  const STATES_GEO = window.BL_STATES_GEO;
  const OVR = window.BL_OVERRIDES || {};
  if (window.BL_PROJECTS && window.BL_PROJECTS.length) BL.CATALYSTS = window.BL_PROJECTS;
  const VERIFIED = window.BL_VERIFIED || [];
  E.setCalibration(VERIFIED.filter((p) => p.price > 0), BL.CATALYSTS);
  let models = E.prepare(GEO.features, BL.CATALYSTS);
  E.calibrateDistricts(models, GEO.features, BL.CATALYSTS);
  (function realCircleRatio() {
    const r = VERIFIED.filter((p) => p.price > 0 && p.govt_sqyd > 0).map((p) => p.govt_sqyd / p.txn_sqyd).filter((x) => x > 0.08 && x < 1.3).sort((a, b) => a - b);
    if (!r.length) return;
    const byS = {};
    for (const p of VERIFIED) if (p.price > 0 && p.govt_sqyd > 0 && p.txn_sqyd) { const x = p.govt_sqyd / p.txn_sqyd; if (x > 0.08 && x < 1.3) (byS[p.state] = byS[p.state] || []).push(x); }
    const med = r[r.length >> 1];
    for (const m of models) if (m.calibrated) { const a = (byS[m.state] || []).sort((x, y) => x - y); m.st = Object.assign({}, m.st, { cg: a.length >= 3 ? a[a.length >> 1] : med }); }
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
      fs.push({ type: "Feature", properties: { id: c.id, color: T.color, rkm: T.r, op: c.stage >= 4 ? 1 : 0, user: c.user ? 1 : 0 }, geometry: { type: "LineString", coordinates: coords } });
    }
    return { type: "FeatureCollection", features: fs };
  }
  function catPtFC() {
    return { type: "FeatureCollection", features: allCats().filter((c) => c.pt).map((c) => ({ type: "Feature", properties: { id: c.id, color: BL.TYPES[c.t].color, rkm: BL.TYPES[c.t].r }, geometry: { type: "Point", coordinates: c.pt } })) };
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
    map.addSource("sat", { type: "raster", tiles: ["https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2020_3857/default/g/{z}/{y}/{x}.jpg"], tileSize: 256, maxzoom: 15, attribution: "Sentinel-2 cloudless by EOX (Copernicus Sentinel data 2020)" });
    add({ id: "sat", type: "raster", source: "sat", layout: { visibility: "none" }, paint: { "raster-opacity": 0.95 } });
    map.addSource("districts", { type: "geojson", data: GEO });
    map.addSource("grid", { type: "geojson", data: emptyFC() });
    map.addSource("verified", { type: "geojson", data: verifiedFC() });
    map.addSource("states", { type: "geojson", data: STATES_GEO });
    map.addSource("catLines", { type: "geojson", data: catLineFC() });
    map.addSource("catPts", { type: "geojson", data: catPtFC() });
    map.addSource("heat", { type: "geojson", data: emptyFC() });
    map.addSource("cells", { type: "geojson", data: emptyFC() });
    map.addSource("draw", { type: "geojson", data: emptyFC() });

    add({ id: "d-fill", type: "fill", source: "districts", paint: {
      "fill-color": ramp("price"),
      "fill-opacity": ["case", ["boolean", ["feature-state", "hover"], false], 0.94, 0.74],
      "fill-opacity-transition": { duration: 200 }
    } });
    add({ id: "d-ext", type: "fill-extrusion", source: "districts", layout: { visibility: "none" }, paint: {
      "fill-extrusion-color": ramp("price"),
      "fill-extrusion-height": ["*", ["coalesce", ["feature-state", "h"], 0], 140000],
      "fill-extrusion-opacity": 0.88
    } });
    add({ id: "grid-fill", type: "fill", source: "grid", paint: { "fill-color": gridRamp("price"), "fill-opacity": ["interpolate", ["linear"], ["zoom"], 7.2, 0, 8.2, 0.5, 11, 0.4, 13.5, 0.3, 16, 0.24], "fill-outline-color": "rgba(0,0,0,0)" } });
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
    add({ id: "cat-line-op", type: "line", source: "catLines", filter: ["==", ["get", "op"], 1], layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": ["get", "color"], "line-width": ["interpolate", ["linear"], ["zoom"], 4, 1.6, 10, 4] } });
    add({ id: "cat-line-uc", type: "line", source: "catLines", filter: ["==", ["get", "op"], 0], layout: { "line-join": "round" }, paint: { "line-color": ["get", "color"], "line-width": ["interpolate", ["linear"], ["zoom"], 4, 1.6, 10, 4], "line-dasharray": [2, 1.5] } });
    add({ id: "cat-infl", type: "circle", source: "catPts", paint: { "circle-radius": kmPx("rkm"), "circle-color": ["get", "color"], "circle-opacity": 0.07, "circle-stroke-color": ["get", "color"], "circle-stroke-opacity": 0.45, "circle-stroke-width": 1, "circle-pitch-alignment": "map" } });
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
    map.addLayer({ id: "verified", type: "circle", source: "verified", layout: { visibility: "none" }, paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 3, 9, 6.5, 13, 10],
      "circle-color": ["match", ["get", "type"], "govt_auction", "#ffd166", "govt_allotment", "#ffb547", "registered", "#2ee6c5", "reported_deal", "#2ee6c5", "listing", "#c9d3e6", "derived_gv", "#7f8aa3", "#b98cff"],
      "circle-stroke-color": "#0a0f1a", "circle-stroke-width": 2, "circle-opacity": 0.95 } });
    map.addLayer({ id: "d-sel-glow", type: "line", source: "districts", filter: ["==", ["get", "id"], -1], paint: { "line-color": "#ffb547", "line-width": 9, "line-opacity": 0.35, "line-blur": 6 } });

    // Clean first view: projects, zones and evidence dots start hidden; chips turn them on.
    ["cat-glow", "cat-line-op", "cat-line-uc", "cat-infl"].forEach((l) => map.setLayoutProperty(l, "visibility", "none"));
    // Make basemap place names readable over the price colours.
    for (const l of (map.getStyle().layers || [])) if (l.type === "symbol") {
      try { map.setPaintProperty(l.id, "text-color", "#eef2fb"); map.setPaintProperty(l.id, "text-halo-color", "rgba(7,11,20,0.92)"); map.setPaintProperty(l.id, "text-halo-width", 1.6); } catch (e) {}
    }
    recompute();
    paint();
    buildMarkers();
    bindMapEvents();
    map.on("moveend", scheduleGrid);
    readHash();
    loader.classList.add("done");
    setTimeout(() => loader.remove(), 600);
    if (!store.get("bl_intro", false)) $("#intro").classList.remove("hidden");
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
    const base = S.sat ? 0.42 : 0.74;
    const fade = GRID_LENSES.includes(S.layer) ? ["interpolate", ["linear"], ["zoom"], 7.2, base, 8.2, 0.06] : base;
    map.setPaintProperty("d-fill", "fill-opacity", ["case", ["boolean", ["feature-state", "hover"], false], 0.94, fade]);
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
      const okT = S.catFilter === "all" || S.catFilter === c.t;
      const okS = S.catStage === "all" || String(c.stage) === S.catStage;
      mk.getElement().style.display = okT && okS ? "" : "none";
    }
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
      <div class="row sb" style="margin:10px 0 6px">${C.stage(c.stage)}<span class="small muted">${esc(BL.STAGES[c.stage])}</span></div>
      <div class="row sb small"><span class="muted">Completion probability</span><b>${Math.round(p * 100)}%</b></div>
      <div class="row sb small"><span class="muted">${c.stage >= 4 ? "Opened" : "Expected"} (${esc(BL.SCENARIOS[S.scenario].label)})</span><b>${eta}</b></div>
      <div class="row sb small"><span class="muted">Agency credibility</span><b>${Math.round(c.cred * 100)} / 100</b></div>
      ${c.cancelled ? '<div class="small down" style="margin-top:6px"><b>Cancelled / dropped.</b> Any price premium should unwind.</div>' : ""}
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
    if (c.pt) fs.push({ type: "Feature", properties: { k: "zone" }, geometry: { type: "Polygon", coordinates: [E.circleRing(c.pt[0], c.pt[1], T.r * 1.5, 72)] } });
    const g = c.pt ? { type: "Point", coordinates: c.pt } : { type: "LineString", coordinates: c.path || E.circleRing(c.ring.lon, c.ring.lat, c.ring.rdeg * 111, 96) };
    fs.push({ type: "Feature", properties: { k: "geom", color: T.color, rkm: T.r * 1.5 }, geometry: g });
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
    const hit = models.map((m) => { const L = m.links.find((l) => l.c.id === c.id); return L ? { m, d: L.d, up: L.w * (E.eff(c, MY + S.horizon, S.scenario) - E.eff(c, MY, "base")) } : null; }).filter(Boolean).sort((a, b) => b.up - a.up).slice(0, 8);
    const pts = (window.BL_VERIFIED || []).map((p, i) => ({ p, i, d: E.distToCatalyst(c, p.lat, p.lon) })).filter((x) => x.d < T.r * 1.5).sort((a, b) => a.d - b.d).slice(0, 8);
    S.sel = null; S.loc = null;
    document.body.classList.add("detail-open"); $("#detail").classList.remove("hidden");
    $("#detailBody").innerHTML = `<div class="d-hero"><div class="kicker">${esc(T.label)} | ${esc(c.ag || "")}</div><h1 style="font-size:20px">${esc(c.n)}</h1>
      <div class="row" style="flex-wrap:wrap;gap:6px;margin-top:6px"><span class="tag">${esc(BL.STAGES[c.stage])}</span>${c.cancelled ? '<span class="tag down">Cancelled</span>' : `<span class="tag">${Math.round(E.completionP(c, S.scenario) * 100)}% likely by ${E.effEta(c, S.scenario)}</span>`}${c.delays ? `<span class="tag warn">Delayed ${c.delays}x</span>` : ""}<span class="tag">as of ${esc(c.asof || BL.DATA_ASOF)}</span></div>
      <div class="acts"><button class="icon-btn" data-act="clear-focus" title="Close"><svg viewBox="0 0 24 24" width="16" height="16"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button></div></div>
      <div class="d-body">${catPopupHTML(c)}
      <h3>Districts it moves most (next ${S.horizon} yrs)</h3>${hit.length ? hit.map((h, i) => listItem(h.m, i, `<span class="pill ${h.up < 0 ? "r" : ""}">${pct(h.up)}</span>`)).join("") : '<div class="empty">Effect too small at district level. Zoom in on the corridor.</div>'}
      ${pts.length ? `<h3>Verified prices inside its reach</h3>${pts.map((x) => `<div class="list-item" data-act="verified" data-i="${x.i}"><div class="grow"><b>${esc(x.p.loc)}</b> <span class="small muted">${x.d.toFixed(1)} km</span></div><span class="pill s">${x.p.txn_sqyd ? fmtINR(x.p.txn_sqyd / 9) + "/sq ft" : "govt " + fmtINR((x.p.govt_sqyd || x.p.govt_sqyd_agri) / 9)}</span></div>`).join("")}` : ""}
      <p class="small muted" style="margin-top:10px">The highlighted band on the map is the project's modelled reach (about ${Math.round(T.r * 1.5)} km).</p></div>`;
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
    S.area.ring = ring;
    S.area.ms = Math.round(performance.now() - t0);
    map.getSource("cells").setData({ type: "FeatureCollection", features: S.area.cells.map((c) => ({ type: "Feature", properties: { g: c.cagr, p: c.price }, geometry: { type: "Point", coordinates: [c.lon, c.lat] } })) });
    const b = ring.reduce((bb, p) => bb.extend(p), new maplibregl.LngLatBounds(ring[0], ring[0]));
    map.fitBounds(b, { padding: padFor(), duration: 900, maxZoom: 12 });
    openTool("draw", true);
  }
  function clearArea() {
    S.area = null;
    map.getSource("cells").setData(emptyFC());
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
    const etaGap = [8, 6, 5, 3, 0][S.simStage];
    const c = Object.assign({ id: "u" + Date.now().toString(36), n, t: S.simType, stage: S.simStage, ann: MY, eta: MY + etaGap, cred: S.simCred, ag: "Your scenario", note: "A project you simulated. Uplift is modelled from comparable Indian projects of this type.", user: true }, geom);
    S.userCats.push(c);
    cancelPlacement();
    if (nameEl) nameEl.value = "";
    recompute();
    refreshCatalystSources();
    S.layer = "impact"; renderLayerSeg();
    paint();
    ripple(markerPos(c));
    openTool("simulate", true);
    toast(`${c.n} added. The map now shows its modelled impact.`);
  }
  function removeUserCat(id) {
    S.userCats = S.userCats.filter((c) => c.id !== id);
    if (popup) popup.remove();
    recompute(); refreshCatalystSources();
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

  $("#scenario").addEventListener("change", (e) => { S.scenario = e.target.value; recompute(); if (S.heat) map.getSource("heat").setData(heatFC()); paint(); if (S.area) reanalyse(); });
  $("#horizon").addEventListener("change", (e) => { S.horizon = +e.target.value; recompute(); paint(); if (S.area) reanalyse(); });
  function reanalyse() { const ring = S.area.ring; S.area = E.analyseArea(ring, allCats(), models, opts()); S.area.ring = ring; refreshPanel(); }

  $("#btn3d").addEventListener("click", (e) => {
    S.three = !S.three; e.currentTarget.classList.toggle("on", S.three);
    map.setLayoutProperty("d-ext", "visibility", S.three ? "visible" : "none");
    map.setLayoutProperty("d-fill", "visibility", S.three ? "none" : "visible");
    map.easeTo({ pitch: S.three ? 52 : 0, bearing: S.three ? -12 : 0, duration: 1000 });
  });
  $("#btnSat").addEventListener("click", (e) => {
    S.sat = !S.sat; e.currentTarget.classList.toggle("on", S.sat);
    map.setLayoutProperty("sat", "visibility", S.sat ? "visible" : "none");
    paint();
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
    map.setLayoutProperty("verified", "visibility", S.real ? "visible" : "none");
    renderOverlayLegend();
    if (S.real) toast(`${VERIFIED.length} verified points across India (auctions, allotments, deals, listings, official rates). Click one for sources.`);
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
    S.sel = null; S.loc = { lon, lat };
    map.setFilter("d-sel", ["==", ["get", "id"], -1]); map.setFilter("d-sel-glow", ["==", ["get", "id"], -1]);
    if (pinMk) pinMk.remove();
    const wrap = document.createElement("div"); wrap.innerHTML = '<div class="pin"></div>';
    pinMk = new maplibregl.Marker({ element: wrap, anchor: "bottom" }).setLngLat([lon, lat]).addTo(map);
    document.body.classList.add("detail-open");
    $("#detail").classList.remove("hidden");
    renderLocation(); $("#detail").scrollTop = 0;
  }
  function nearVerified(lat, lon, maxKm) {
    return (window.BL_VERIFIED || []).map((p, i) => ({ p, i, d: E.hav(lat, lon, p.lat, p.lon) })).filter((x) => x.d <= maxKm).sort((a, b) => a.d - b.d);
  }
  const TYPE_LABEL = { govt_auction: "Govt auction (actual sale)", registered: "Registered sale", reported_deal: "Reported deal", listing: "Listing (asking, -10%)", govt_allotment: "Govt allotment (actual)", derived_gv: "Derived from govt guideline value" };
  function renderLocation() {
    const { lon, lat } = S.loc;
    const pm = E.pointModel(lat, lon, allCats(), models, opts());
    pm.priceNow = pm.basePrice;
    const ser = E.series(pm, S.scenario), con = E.contributions(pm, S.horizon, S.scenario);
    con.parts.forEach((p) => (p.color = p.c ? BL.TYPES[p.c.t].color : "#8fa3c7"));
    const ev = E.calibrationEvidence(lat, lon), cf = E.calibFactor(lat, lon);
    const near = nearVerified(lat, lon, 12).slice(0, 8);
    const gov = nearVerified(lat, lon, 8).find((x) => x.p.govt_sqyd);
    const dm = models.find((m) => m.name === pm.district);
    const projs = allCats().map((c) => ({ c, d: E.distToCatalyst(c, lat, lon) })).filter((x) => x.d < 60).sort((a, b) => a.d - b.d).slice(0, 8);
    const conf = ev > 1.2 ? ["High", "up"] : ev > 0.35 ? ["Medium", "warn"] : ["Model only", "muted"];
    $("#detailBody").innerHTML = `
      <div class="d-hero">
        <div class="kicker">Plot-level read | ${esc(pm.district || "")}${pm.state ? ", " + esc(pm.state) : ""}</div>
        <h1 style="font-size:20px">${near.length && near[0].d < 6 ? "Near " + esc(near[0].p.loc) : esc(pm.district || "Selected spot")}</h1>
        <div class="small muted">${lat.toFixed(4)}, ${lon.toFixed(4)}${near.length && near[0].d < 6 ? ` | ${near[0].d.toFixed(1)} km from ${esc(near[0].p.loc)}` : ""}</div>
        <div class="row" style="flex-wrap:wrap;gap:6px;margin-top:6px">
          <span class="tag">${pm.nearest ? Math.round(pm.nearestD) + " km from " + esc(pm.nearest.n) : ""}</span>
          <span class="tag ${conf[1]}">Confidence: ${conf[0]}</span>
          ${Math.abs(cf - 1) > 0.05 ? `<span class="tag" style="border-color:#ffd166;color:#ffd166">Real-data adjusted ${pct(cf - 1, 0)}</span>` : ""}
        </div>
        <div class="acts"><button class="icon-btn" data-act="close-detail" title="Close"><svg viewBox="0 0 24 24" width="16" height="16"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button></div>
      </div>
      <div class="d-body">
        <h3>Value at this spot</h3>
        <div class="kpis">
          <div class="kpi"><div class="k">Est. land price</div><div class="v">${fmtINR(pm.basePrice)}<span class="small muted"> /sq ft</span></div><div class="s">${fmtINR(pm.basePrice * 9)} /sq yd | ${fmtINR(pm.basePrice * E.SQFT_PER_ACRE)} /acre</div></div>
          <div class="kpi"><div class="k">${S.horizon}-yr outlook</div><div class="v up">${pm.mult.toFixed(2)}x</div><div class="s">${pct(pm.cagr)} per year, ${esc(BL.SCENARIOS[S.scenario].label.toLowerCase())}</div></div>
          ${gov ? `<div class="kpi wide"><div class="k">Official govt market value nearby (${esc(gov.p.loc)}, ${gov.d.toFixed(1)} km)</div><div class="v">${fmtINR(gov.p.govt_sqyd)}<span class="small muted"> /sq yd</span></div><div class="s">${esc(gov.p.govt_date || "")} | <a href="${esc(gov.p.govt_src)}" target="_blank" rel="noopener">source</a> | market is ${Math.round((1 - gov.p.govt_sqyd / 9 / pm.basePrice) * 100)}% above it</div></div>` : ""}
        </div>
        <h3>How this price was arrived at</h3>
        <div class="card small" style="line-height:1.6">${(() => {
          const cc = E.calibContrib(lat, lon);
          const raw = pm.modelPrice;
          return `<div class="row sb"><span class="muted">1. Base model (state farmland baseline + pull of ${esc(pm.nearest ? pm.nearest.n : "nearest city")})</span><b>${fmtINR(raw)}</b></div>
            <div class="row sb"><span class="muted">2. Real-data adjustment from verified prices nearby</span><b class="${cc.factor < 1 ? "down" : "up"}">x${cc.factor.toFixed(2)}</b></div>
            <div class="row sb" style="border-top:1px solid var(--line);margin-top:4px;padding-top:4px"><span>Estimate today</span><b>${fmtINR(pm.basePrice)}</b></div>
            ${cc.top.length ? `<div class="muted" style="margin-top:6px">Weight of evidence: ${cc.top.map((t) => `${esc(t.loc)} ${Math.round(t.share * 100)}% (${t.d.toFixed(1)} km, real ${fmtINR(t.real)})`).join("; ")}; model prior ${Math.round(cc.priorShare * 100)}%.</div>` : '<div class="muted" style="margin-top:6px">No verified price within ~50 km, so this is model-only.</div>'}
            <div class="muted" style="margin-top:4px">3. Forecast = today's estimate grown by the state drift and each project's priced-in share x completion odds (see drivers below).</div>`;
        })()}</div>
        <h3>Analyse around this point</h3>
        <div class="btn-row">${[2, 5, 10, 15, 25, 50].map((r) => `<button class="btn sm" data-act="loc-radius" data-r="${r}" data-lon="${lon}" data-lat="${lat}">${r} km</button>`).join("")}</div>
        ${near.length ? `<h3>Real prices nearby (${near.length})</h3><div class="card" style="padding:4px 12px">${near.map((x) => `<div class="cat-row" data-act="verified" data-i="${x.i}"><span class="cat-ico" style="background:${x.p.type === "govt_auction" ? "#ffd166" : x.p.price ? "#c9d3e6" : "#b98cff"}">${x.p.price ? "Rs" : "G"}</span><div class="grow"><div class="cn">${esc(x.p.loc)}</div><div class="small muted">${x.p.price ? fmtINR(x.p.txn_sqyd) + "/sq yd | " + esc(TYPE_LABEL[x.p.type] || x.p.type) + " | " + esc(x.p.date || "") : "Govt rate " + fmtINR(x.p.govt_sqyd || x.p.govt_sqyd_agri) + "/sq yd"} | ${x.d.toFixed(1)} km</div></div></div>`).join("")}</div>` : ""}
        <h3>Price path</h3><div class="card">${C.fan(ser, { cursor: S.year !== MY ? S.year : null })}</div>
        <h3>What drives the next ${S.horizon} years</h3><div class="card">${C.bars(con.parts)}</div>
        <h3>Projects within 60 km</h3>
        <div class="card" style="padding:4px 12px">${projs.length ? projs.map((x) => catRow(x.c, `${x.d.toFixed(1)} km away`)).join("") : '<div class="empty">No tracked project within 60 km.</div>'}</div>
        ${dm ? `<div class="btn-row" style="margin-top:12px"><button class="btn sm" data-act="open-d" data-id="${dm.id}">Open ${esc(dm.name)} district card</button></div>` : ""}
        <p class="small muted" style="margin-top:12px">Confidence reflects how much verified price evidence sits within about 10 km. "Model only" means no real transactions nearby yet.</p>
      </div>`;
  }
  function verifiedPopup(i) {
    const p = (window.BL_VERIFIED || [])[i]; if (!p) return;
    if (popup) popup.remove();
    popup = new maplibregl.Popup({ offset: 10, maxWidth: "320px" }).setLngLat([p.lon, p.lat]).setHTML(`<div style="min-width:230px">
      <b>${esc(p.loc)}</b><div class="small muted">${esc(p.district)}${p.taluk ? ", " + esc(p.taluk) : ""}, ${esc(p.state || "")} | verified data point</div>
      ${p.price ? `<div class="row sb small" style="margin-top:8px"><span class="muted">${esc(TYPE_LABEL[p.type] || p.type)}</span><b>${fmtINR(p.txn_sqyd)}/sq yd</b></div><div class="small muted">${esc(p.date || "")} | ${fmtINR(p.price)}/sq ft used in model</div>${p.note ? `<p class="small" style="margin:6px 0 0;line-height:1.45">${esc(p.note)}</p>` : ""}<div class="small"><a href="${esc(p.src)}" target="_blank" rel="noopener">Price source</a></div>` : ""}
      ${p.govt_sqyd || p.govt_sqyd_agri ? `<div class="row sb small" style="margin-top:8px"><span class="muted">Official market value${p.govt_sqyd ? "" : " (agri)"}</span><b>${fmtINR(p.govt_sqyd || p.govt_sqyd_agri)}/sq yd</b></div><div class="small"><span class="muted">${esc(p.govt_date || "")}</span> | <a href="${esc(p.govt_src)}" target="_blank" rel="noopener">Rate source</a></div>` : ""}
      <button class="btn sm" style="margin-top:8px" data-act="open-loc" data-lon="${p.lon}" data-lat="${p.lat}">Plot-level read here</button></div>`).addTo(map);
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
          ${m.calibrated ? `<span class="tag" style="border-color:#ffd166;color:#ffd166">Calibrated with real data</span>` : ""}
        </div>
        <div class="acts">
          <button class="icon-btn ${starred ? "on" : ""}" data-act="star" data-id="${m.id}" title="${starred ? "Remove from" : "Add to"} watchlist"><svg viewBox="0 0 24 24" width="17" height="17"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z" fill="${starred ? "currentColor" : "none"}" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg></button>
          <button class="icon-btn ${cmp ? "on" : ""}" data-act="cmp" data-id="${m.id}" title="Compare"><svg viewBox="0 0 24 24" width="17" height="17"><path d="M4 6h7v13H4zM13 10h7v9h-7z" fill="${cmp ? "currentColor" : "none"}" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg></button>
          <button class="icon-btn" data-act="report" data-id="${m.id}" title="Download report"><svg viewBox="0 0 24 24" width="17" height="17"><path d="M12 4v11M7 10l5 5 5-5M5 20h14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
          <button class="icon-btn" data-act="close-detail" title="Close"><svg viewBox="0 0 24 24" width="16" height="16"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
        </div>
        <div class="score-row">
          <div class="score">${C.gauge(m.opp, { color: "#2ee6c5" })}<div><div class="lab">Opportunity</div><div class="txt">${m.opp >= 75 ? "Strong" : m.opp >= 60 ? "Above average" : m.opp >= 40 ? "Average" : "Below average"}</div></div></div>
          <div class="score">${C.gauge(R.total, { color: "#ff5c7a" })}<div><div class="lab">Risk</div><div class="txt">${R.total < 38 ? "Contained" : R.total < 50 ? "Moderate" : "Elevated"}</div></div></div>
          <div class="score">${C.gauge(m.liq, { color: "#5ad1ff" })}<div><div class="lab">Liquidity</div><div class="txt">${m.liq > 65 ? "Easy exit" : m.liq > 40 ? "Fair" : "Thin market"}</div></div></div>
        </div>
      </div>
      <div class="d-body">
        <h3>Value today</h3>
        <div class="kpis">
          <div class="kpi"><div class="k">Market price</div><div class="v">${fmtINR(m.priceNow)}<span class="small muted"> /sq ft</span></div><div class="s">${fmtINR(m.priceNow * E.SQFT_PER_ACRE)} per acre</div></div>
          <div class="kpi"><div class="k">Circle rate</div><div class="v">${fmtINR(m.circle)}<span class="small muted"> /sq ft</span></div><div class="s warn">Market is ${Math.round(m.gap * 100)}% above it</div></div>
          <div class="kpi"><div class="k">${S.horizon}-yr value multiple</div><div class="v">${m.mult.toFixed(2)}x</div><div class="s">Range ${m.lo.toFixed(2)}x to ${m.hi.toFixed(2)}x</div></div>
          <div class="kpi"><div class="k">Growth per year</div><div class="v ${m.cagr > 0.09 ? "up" : ""}">${pct(m.cagr)}</div><div class="s">${esc(BL.SCENARIOS[S.scenario].label)} case</div></div>
          ${yrPrice}
        </div>
        <h3>Price path, 2015 to 2036</h3>
        <div class="card">${C.fan(ser, { marks, cursor: S.year !== MY ? S.year : null })}
          <div class="row small muted" style="gap:14px;margin-top:4px"><span><span style="display:inline-block;width:14px;height:2px;background:#8fa3c7;vertical-align:middle"></span> modelled history</span><span><span style="display:inline-block;width:14px;height:2px;background:#ffb547;vertical-align:middle"></span> forecast with 80% band</span><span>dots = project dates</span></div>
        </div>
        <h3>What drives the next ${S.horizon} years</h3>
        <div class="card">${C.bars(con.parts)}<div class="row sb small" style="margin-top:9px;border-top:1px solid var(--line);padding-top:8px"><span class="muted">Total expected change</span><b class="up">${pct(con.total)}</b></div></div>
        <h3>Looks like</h3>
        <div class="analogue">
          <div class="small muted">Closest historical match (${Math.round(an.similarity * 100)}% similar)</div>
          <b>${esc(an.a.n)} in ${an.a.y}</b>
          <p class="small" style="margin:6px 0 0;line-height:1.5;color:var(--tx-2)">${esc(an.a.why)} Over the next decade, land there moved roughly <b style="color:var(--tx)">${an.a.mult}x</b>. This is an illustrative pattern match, not a promise.</p>
        </div>
        <h3>Risk profile</h3>
        <div class="card"><div class="row" style="align-items:center">
          <div style="width:52%">${C.radar([{ label: "Flood", v: R.flood }, { label: "Heat", v: R.heat }, { label: "Water", v: R.water }, { label: "Title", v: R.title }, { label: "Rules", v: R.reg }])}</div>
          <div class="grow small">
            ${[["Flood", R.flood], ["Heat", R.heat], ["Water stress", R.water], ["Title and records", R.title], ["Buyer restrictions", R.reg]].map(([k, v]) => `<div class="row sb" style="padding:3px 0"><span class="muted">${k}</span><span class="${v >= 0.6 ? "down" : v >= 0.33 ? "warn" : "up"}">${riskWord(v)}</span></div>`).join("")}
          </div></div>
          ${R.reg > 0.6 ? `<p class="small warn" style="margin:8px 0 0">${esc(m.state)} restricts who can buy agricultural land. Check eligibility before you transact.</p>` : ""}
        </div>
        <h3>Projects in range (${m.links.length})</h3>
        <div class="card" style="padding:4px 12px">${m.links.length ? m.links.slice(0, 8).map((L) => catRow(L.c, `${Math.round(L.d)} km away`)).join("") : '<div class="empty">No major tracked catalyst is close enough to move prices here. Growth comes from general land inflation.</div>'}</div>
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
    return `<div class="cat-row" data-act="fly-cat" data-id="${esc(c.id)}"><span class="cat-ico" style="background:${T.color}">${esc(T.icon)}</span><div class="grow"><div class="cn ellipsis">${esc(c.n)}</div><div class="row small muted" style="gap:8px;margin-top:3px">${C.stage(c.stage)}<span>${esc(BL.STAGES[c.stage])}</span><span>| ${c.stage >= 4 ? "open" : "ETA " + E.effEta(c, S.scenario)}</span></div>${sub ? `<div class="small muted" style="margin-top:2px">${esc(sub)}</div>` : ""}${c.cancelled ? '<div class="small down">Cancelled: premium unwinding</div>' : c.delays ? `<div class="small warn">Delayed ${c.delays}x | as of ${esc(c.asof || "")}</div>` : c.asof ? `<div class="small muted">as of ${esc(c.asof)}</div>` : ""}</div><span class="pill ${E.completionP(c, S.scenario) < 0.5 ? "r" : ""}">${Math.round(E.completionP(c, S.scenario) * 100)}%</span></div>`;
  }

  /* ------------------------------------------------------------------ */
  /* Tool panels                                                          */
  /* ------------------------------------------------------------------ */
  const PANEL_TITLES = { explore: "Explore", draw: "Area analysis", simulate: "Ripple simulator", catalysts: "Catalyst tracker", screener: "Screener", watchlist: "Watchlist and signals", compare: "Compare", method: "How the model works" };
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

  function refreshPanel() {
    if (!S.tool) return;
    const body = $("#panelBody");
    const fn = { explore: pExplore, draw: pDraw, simulate: pSimulate, catalysts: pCatalysts, screener: pScreener, watchlist: pWatch, compare: pCompare, method: pMethod }[S.tool];
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
    return `<p class="lead">Every district in India priced, forecast and scored. Switch lenses at the top, scrub the time machine below, or click any district.</p>
      <div class="kpis">
        <div class="kpi"><div class="k">Districts modelled</div><div class="v">${models.length}</div><div class="s">${Object.keys(BL.STATES).length} states and UTs</div></div>
        <div class="kpi"><div class="k">Projects tracked</div><div class="v">${allCats().length}</div><div class="s">${allCats().filter((c) => c.stage < 4).length} still in the pipeline</div></div>
        <div class="kpi wide"><div class="k">National average growth (${S.horizon} yrs)</div><div class="v">${pct(nat)} <span class="small muted">per year, ${esc(BL.SCENARIOS[S.scenario].label.toLowerCase())} case</span></div></div>
      </div>
      <h3>Best risk-adjusted opportunities</h3>${top.map((m, i) => listItem(m, i, `<span class="pill">${m.opp}</span>`)).join("")}
      <h3>Emerging: cheap land with a pipeline</h3>${emerging.map((m, i) => listItem(m, i, `<span class="pill s">${pct(m.cagr)}</span>`)).join("")}
      <h3>Widest circle-rate gaps (revision risk)</h3>${gaps.map((m, i) => listItem(m, i, `<span class="pill r">${Math.round(m.gap * 100)}%</span>`)).join("")}
      <h3>Most expensive land</h3>${priced.map((m, i) => listItem(m, i, `<span class="pill s">${fmtINR(m.priceNow)}</span>`)).join("")}`;
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
    const lo = budget * Math.max(0.4, A.multMean * 0.82), hi = budget * A.multMean * 1.2, mid = budget * A.multMean;
    return `${tools}
      <div class="kpis">
        <div class="kpi"><div class="k">Area</div><div class="v">${A.areaKm2 >= 100 ? Math.round(A.areaKm2).toLocaleString("en-IN") : A.areaKm2.toFixed(1)} km\u00B2</div><div class="s">${Math.round(A.acres).toLocaleString("en-IN")} acres | ${A.n} grid cells</div></div>
        <div class="kpi"><div class="k">Median price</div><div class="v">${fmtINR(A.p50)}<span class="small muted">/sq ft</span></div><div class="s">${fmtINR(A.p50 * E.SQFT_PER_ACRE)} per acre</div></div>
        <div class="kpi"><div class="k">Price spread (P10 to P90)</div><div class="v" style="font-size:15px">${fmtINR(A.p10)} to ${fmtINR(A.p90)}</div><div class="s">per sq ft</div></div>
        <div class="kpi"><div class="k">${A.horizon}-yr outlook</div><div class="v up">${A.multMean.toFixed(2)}x</div><div class="s">${pct(A.cagrMean)} per year on average</div></div>
      </div>
      <h3>Price distribution</h3><div class="card">${C.histogram(A.cells.map((c) => c.price))}</div>
      <h3>Invest here</h3>
      <div class="card">
        <div class="field"><label><span>Budget (INR)</span><span>${fmtINR(budget)}</span></label><input type="number" id="budget" value="${budget}" min="100000" step="100000"/></div>
        <div class="small muted">That buys about <b style="color:var(--tx)">${acres >= 1 ? acres.toFixed(1) + " acres" : Math.round(acres * E.SQFT_PER_ACRE).toLocaleString("en-IN") + " sq ft"}</b> at the median price. Value in ${A.horizon} years:</div>
        <div class="calc-out"><div><span class="small muted">Downside</span><b class="down">${fmtINR(lo)}</b></div><div><span class="small muted">Base</span><b>${fmtINR(mid)}</b></div><div><span class="small muted">Upside</span><b class="up">${fmtINR(hi)}</b></div></div>
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
      <p class="small muted">Computed in ${A.ms || 0} ms on a ${(A.step * 111).toFixed(1)} km grid.</p>`;
  }

  function pSimulate() {
    const types = Object.entries(BL.TYPES);
    const imp = S.userCats.length ? [...models].sort((a, b) => b.delta - a.delta).slice(0, 8).filter((m) => m.delta > 0.002) : [];
    const created = imp.length ? models.reduce((s, m) => s + m.priceNow * m.delta * m.area * 10.7639e6 * 0.02, 0) : 0;
    return `<p class="lead">What if a new airport, metro or expressway came here? Place a project and the model re-prices every district, weighted by the chance it actually gets built.</p>
      <div class="type-grid">${types.map(([k, T]) => `<button class="${S.simType === k ? "on" : ""}" style="--c:${T.color}" data-act="sim-type" data-t="${k}"><i>${esc(T.icon)}</i>${esc(T.label)}</button>`).join("")}</div>
      <div class="field"><label><span>Project name (optional)</span></label><input type="text" id="simName" placeholder="e.g. Third Mumbai airport"/></div>
      <div class="field"><label><span>Stage</span><span>${esc(BL.STAGES[S.simStage])}</span></label><input type="range" id="simStage" min="0" max="4" step="1" value="${S.simStage}"/></div>
      <div class="field"><label><span>Agency credibility</span><span>${Math.round(S.simCred * 100)} / 100</span></label><input type="range" id="simCred" min="0.2" max="1" step="0.05" value="${S.simCred}"/></div>
      <div class="small muted" style="margin:-2px 0 10px">Completion probability: <b style="color:var(--tx)">${Math.round(E.completionP({ stage: S.simStage, cred: S.simCred }, S.scenario) * 100)}%</b> | Reach about ${BL.TYPES[S.simType].r} km | Max uplift ${Math.round(BL.TYPES[S.simType].U * 100)}%</div>
      <div class="btn-row">${S.placing ? `<button class="btn primary" data-act="place-cancel">Cancel placing</button>${S.placing.path ? '<button class="btn" data-act="sim-finish">Finish route</button>' : ""}` : `<button class="btn primary" data-act="sim-place">Place on map</button>`}</div>
      ${S.userCats.length ? `
        <h3>Your simulated projects</h3>
        ${S.userCats.map((c) => `<div class="card row"><span class="cat-ico" style="background:${BL.TYPES[c.t].color}">${esc(BL.TYPES[c.t].icon)}</span><div class="grow"><div style="font-weight:600" class="ellipsis">${esc(c.n)}</div><div class="small muted">${esc(BL.STAGES[c.stage])} | P ${Math.round(E.completionP(c, S.scenario) * 100)}%</div></div><button class="btn sm ghost" data-act="fly-cat" data-id="${esc(c.id)}">View</button><button class="btn sm danger" data-act="sim-remove" data-id="${esc(c.id)}">Remove</button></div>`).join("")}
        <h3>Most affected districts (${S.horizon}-yr uplift)</h3>
        ${imp.length ? imp.map((m, i) => listItem(m, i, `<span class="pill">${pct(m.delta)}</span>`)).join("") : '<div class="empty">No district is materially affected. Try a bigger catalyst or a later stage.</div>'}
        ${created > 0 ? `<div class="card" style="margin-top:10px"><div class="k small muted">Indicative land value created</div><div style="font-family:var(--display);font-size:20px;font-weight:700" class="up">${fmtINR(created)}</div><div class="small muted">Assumes 2% of land in affected districts is developable. Useful for value-capture and betterment-levy planning.</div></div>` : ""}
        <div class="btn-row" style="margin-top:10px"><button class="btn sm danger" data-act="sim-clear">Clear all simulations</button></div>` : ""}`;
  }

  function pCatalysts() {
    const bb = S.inView && map.getBounds ? map.getBounds() : null;
    const inB = (c) => !bb || (c.pt ? [c.pt] : c.path || [[c.ring.lon, c.ring.lat]]).some((p) => p[0] >= bb.getWest() && p[0] <= bb.getEast() && p[1] >= bb.getSouth() && p[1] <= bb.getNorth());
    const list = allCats().filter((c) => (S.catFilter === "all" || c.t === S.catFilter) && (S.catStage === "all" || String(c.stage) === S.catStage) && inB(c))
      .sort((a, b) => E.effEta(a, S.scenario) - E.effEta(b, S.scenario));
    const types = ["all", ...Object.keys(BL.TYPES)];
    const delayed = allCats().filter((c) => c.stage < 4 && E.effEta(c, "bear") - c.eta >= 3).length;
    return `<p class="lead">Every major project from announcement to opening. Prices tend to jump on announcement, stall during delays and re-rate on opening. Credibility scores show which agencies deliver on time.</p>
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
    return `<p class="lead">Filter India down to the districts that fit your thesis.</p>
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
      if (L.c.stage < 4 && eta <= MY + 3) out.push({ k: "up", t: `${L.c.n} expected by ${eta} (${Math.round(E.completionP(L.c, S.scenario) * 100)}% likely)` });
      if (L.c.stage <= 1 && L.c.cred < 0.55) out.push({ k: "warn", t: `${L.c.n} is early-stage with low delivery credibility` });
    }
    if (m.opp >= 75) out.push({ k: "up", t: "Strong opportunity score" });
    if (m.risk.total >= 55) out.push({ k: "down", t: "Elevated composite risk. Check title and flood exposure." });
    if (m.gap >= 0.5) out.push({ k: "warn", t: "Wide circle-rate gap. A rate revision would raise stamp duty." });
    if (m.liq < 35) out.push({ k: "warn", t: "Thin market. Exits may take time." });
    return out.slice(0, 4);
  }
  function pWatch() {
    if (!S.watch.length) return `<div class="empty">Star districts from their detail card to track them here.<br/>You will see live signals: upcoming project openings, risk flags and circle-rate revision exposure.</div>`;
    return S.watch.map((id) => byId.get(id)).filter(Boolean).map((m) => `<div class="card click" data-act="open-d" data-id="${m.id}">
      <div class="row sb"><div><b style="font-family:var(--display);font-size:14px">${esc(m.name)}</b> <span class="small muted">${esc(m.state)}</span></div><span class="pill">${m.opp}</span></div>
      <div class="row small muted" style="gap:12px;margin:5px 0 7px"><span>${fmtINR(m.priceNow)}/sq ft</span><span class="up">${pct(m.cagr)}/yr</span><span>risk ${Math.round(m.risk.total)}</span></div>
      ${signalsFor(m).map((s) => `<div class="small ${s.k}" style="padding:2px 0">- ${esc(s.t)}</div>`).join("") || '<div class="small muted">No active signals.</div>'}
    </div>`).join("");
  }

  const CMP_COLORS = ["#ffb547", "#2ee6c5", "#b98cff"];
  function pCompare() {
    const ms = S.compare.map((id) => byId.get(id)).filter(Boolean);
    if (!ms.length) return `<div class="empty">Add up to three districts from their detail card to compare them side by side.</div>`;
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
    return `${table}<h3>Price index (today = 100)</h3><div class="card">${chart}</div>
      <div class="btn-row">${ms.map((m) => `<button class="btn sm" data-act="cmp" data-id="${m.id}">Remove ${esc(m.name)}</button>`).join("")}</div>`;
  }

  function pMethod() {
    const BT = window.BL_BACKTEST, VS = window.BL_VERIFIED_SUMMARY;
    const btHtml = BT ? `<h3>Back-test: did the model match reality?</h3>
      <p>Each row compares the documented price change around a past project (in excess of the wider city market) with what the old and the re-calibrated model predicted. Average log error fell from ${BT.oldLoss} to ${BT.newLoss}.</p>
      <table class="cmp"><tr><th>Place</th><th>Years</th><th>Actual</th><th>Old</th><th>New</th></tr>${BT.rows.map((r) => `<tr><td title="${esc(r.project)}"><a href="${esc(r.src)}" target="_blank" rel="noopener">${esc(r.loc.slice(0, 30))}</a></td><td>${r.y0}-${String(r.y1).slice(2)}</td><td>${r.obs.toFixed(2)}x</td><td class="${Math.abs(Math.log(r.old / r.obs)) < 0.15 ? "best" : ""}">${r.old.toFixed(2)}x</td><td class="${Math.abs(Math.log(r.now / r.obs)) < 0.15 ? "best" : ""}">${r.now.toFixed(2)}x</td></tr>`).join("")}</table>
      <p style="margin-top:8px">What changed (24 Oct 2026 re-fit): airport max uplift 0.85 to 1.8, expressway 0.42 to 1.1, ring road 0.5 to 1.5, metro and rapid rail restored to 0.35 (the earlier cut to 0.2 under-predicted Namo Bharat), and cheap rural land gets up to 2.3x the percentage boost of built-up land. About 85% of the effect is priced in by opening. Average log error is now ${BT.newLoss} versus ${BT.oldLoss} for the original model. Still under-predicted: speculative peaks like Yamuna Expressway plots (actual 1.9x vs model 1.16x) and the Hyderabad ORR belt, where the IT corridor also drove prices.</p>` : "";
    const vsHtml = VS ? `<h3>Real-data calibration across India</h3>
      <p>${VS.total} verified localities: ${VS.pricePoints} real land prices and ${VS.govtPoints} official government rates. Before calibration the model's typical error was ${Math.round(VS.errBefore * 100)}%. With real data the typical error, tested by hiding each point and predicting it from the rest, is ${Math.round(VS.errLOO * 100)}%. Areas far from any verified point stay model-only and are labelled that way.</p>
      <table class="cmp"><tr><th>State</th><th>Points</th><th>Error before</th><th>After</th></tr>${(VS.stateStats || []).map((x) => `<tr><td>${esc(x.s)}</td><td>${x.n}</td><td>${Math.round(x.before * 100)}%</td><td class="${x.after < x.before ? "best" : ""}">${Math.round(x.after * 100)}%</td></tr>`).join("")}</table>
      <p style="margin-top:8px"><b>Biggest district corrections</b></p>
      <table class="cmp"><tr><th>District</th><th>Old est.</th><th>Now</th><th>Change</th></tr>${VS.districts.map((d) => `<tr><td>${esc(d.n)}</td><td>${fmtINR(d.old)}</td><td>${fmtINR(d.now)}</td><td class="${d.now < d.old ? "down" : "up"}">${pct(d.now / d.old - 1, 0)}</td></tr>`).join("")}</table>
      <p style="margin-top:8px"><b>Sources</b></p>${VS.sources.map((x) => `<p>- <b>${esc(x[0])}</b>: ${esc(x[1])}. Reliability: ${esc(x[2])}.</p>`).join("")}<p class="warn">${esc(VS.gaps)}</p>` : "";
    return `<div class="note">
      <p><b>Data as of ${esc(BL.DATA_ASOF)}.</b> Project statuses were verified in ${esc(BL.DATA_ASOF)} for ${BL.CATALYSTS.length} projects, each with a source link (click a project marker). Prices are calibrated to verified local evidence where it exists; elsewhere they are modelled and marked "Model only".</p>
      ${vsHtml}${btHtml}
      <p><b>What this is.</b> Bhoomi Lens is a modelled land-intelligence map. It turns public reference points into an estimate of what land is worth today, where it is heading and what could go wrong. It is not a record of registered transactions.</p>
      <h3>Where every number comes from</h3>
      <p>No price in the app is invented, but they are not all the same kind of evidence. Each verified point is tagged with its type, date and source link (click any dot with Real data on):</p>
      <p>- <b>Govt auction / allotment</b> (gold): an actual sale or allotment price by a government authority.<br/>- <b>Registered / reported deal</b> (teal): reported registrations or land deals.<br/>- <b>Listing</b> (light grey): portal asking prices, cut by 10% to approximate sale prices.<br/>- <b>Official govt rate</b> (shown inside each point): guideline, circle, ready reckoner or jantri value.<br/>- <b>Derived village value</b> (dark grey, Tamil Nadu only): the official guideline median x ${VS ? VS.tnMult : 2}x, the median market-to-guideline ratio across ${VS ? VS.tnPairs : 0} Tamil Nadu localities with both numbers. Used at a third of the weight of a real price.</p>
      <p>Individual registered sale deeds are not included: state registration portals require captchas and document-by-document searches. Everywhere else the price is the model, adjusted by the nearest verified evidence. Each plot-level card shows exactly how its price was built: base model, the real-data adjustment, and which verified points pulled it and by how much.</p>
      <h3>1. Price today</h3>
      <p>Each district's price combines a rural baseline (typical agricultural land per acre in that state) with urban gravity: the pull of ${BL.ANCHORS.length} city anchors, each decaying with distance. Circle rates are modelled from state-level guidance-to-market ratios.</p>
      <h3>2. Catalyst uplift</h3>
      <p>Each of the ${BL.CATALYSTS.length} tracked projects has a type-specific maximum uplift and reach (an airport moves land 25-30 km away; a metro station moves land within about 4 km). Impact = uplift x distance decay x completion probability x how much is already priced in.</p>
      <p><b>Completion probability</b> comes from the project's stage (announced to operational) and the implementing agency's delivery credibility. <b>Realisation</b> follows the Indian pattern: about 30% is priced on announcement, about 65% by completion, and the rest over the following years.</p>
      <h3>3. Forecast band</h3>
      <p>Uncertainty widens with time and with the share of value that depends on unfinished projects. The bear case cuts completion odds and adds delays based on agency credibility. The bull case does the opposite.</p>
      <h3>4. Risk, liquidity, opportunity</h3>
      <p>Risk blends flood, heat, groundwater stress, title and records quality, and limits on who may buy agricultural land. The opportunity score is a percentile rank of risk-adjusted growth, adjusted for circle-rate gap, liquidity, pipeline momentum and how expensive land already is.</p>
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
    if (t.id === "simStage") { S.simStage = +t.value; keepName(refreshPanel); }
    else if (t.id === "simCred") { S.simCred = +t.value; keepName(refreshPanel); }
    else if (t.id === "scrRisk") { S.scr.maxRisk = +t.value; refreshPanelKeepScroll(); }
    else if (t.id === "radiusKm") { S.radiusKm = +t.value; const lab = t.parentElement.querySelector("label span:last-child"); if (lab) lab.textContent = S.radiusKm + " km"; }
  });
  $("#panelBody").addEventListener("change", (e) => {
    const t = e.target;
    if (t.id === "catType") { S.catFilter = t.value; setMarkerVisibility(); refreshPanel(); }
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
      case "sim-clear": S.userCats = []; recompute(); refreshCatalystSources(); if (S.layer === "impact") S.layer = "growth"; renderLayerSeg(); paint(); break;
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
  const csvCell = (v) => { const s = String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  function allCSV() {
    const head = ["district", "state", "lat", "lon", "price_inr_sqft", "price_inr_acre", "circle_rate_sqft", "gap_pct", `mult_${S.horizon}y`, "low", "high", "cagr_pct", "opportunity", "risk", "liquidity", "top_catalyst", "analogue"];
    const rows = models.map((m) => [m.name, m.state, m.lat, m.lon, Math.round(m.priceNow), Math.round(m.priceNow * E.SQFT_PER_ACRE), Math.round(m.circle), Math.round(m.gap * 100), m.mult.toFixed(3), m.lo.toFixed(3), m.hi.toFixed(3), (m.cagr * 100).toFixed(2), m.opp, Math.round(m.risk.total), Math.round(m.liq), m.links[0] ? m.links[0].c.n : "", E.analogueFor(m.vec).a.n]);
    download(`bhoomi-lens-districts-${S.scenario}-${S.horizon}y.csv`, [head, ...rows].map((r) => r.map(csvCell).join(",")).join("\n"));
  }
  function areaCSV() {
    if (!S.area) return;
    const rows = [["lat", "lon", "district", "state", "price_inr_sqft", "mult", "cagr_pct", "top_catalyst"], ...S.area.cells.map((c) => [c.lat.toFixed(4), c.lon.toFixed(4), c.district, c.state, Math.round(c.price), c.mult.toFixed(3), (c.cagr * 100).toFixed(2), c.top || ""])];
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
        <div>Market price<b>${fmtINR(m.priceNow)}/sq ft</b><span class="muted">${fmtINR(m.priceNow * E.SQFT_PER_ACRE)}/acre</span></div>
        <div>Circle rate<b>${fmtINR(m.circle)}/sq ft</b><span class="muted">gap ${Math.round(m.gap * 100)}%</span></div>
        <div>${S.horizon}-yr multiple<b>${m.mult.toFixed(2)}x</b><span class="muted">${m.lo.toFixed(2)}x to ${m.hi.toFixed(2)}x</span></div>
        <div>Scores<b>${m.opp} | ${Math.round(m.risk.total)} | ${Math.round(m.liq)}</b><span class="muted">opportunity | risk | liquidity</span></div></div>
      <h2>Price path</h2>${C.fan(ser, { w: 740, h: 230 })}
      <h2>Drivers of the forecast</h2>${C.bars(con.parts)}
      <h2>Projects in range</h2><table>${m.links.slice(0, 10).map((L) => `<tr><td><b>${esc(L.c.n)}</b><br><span class="muted">${esc(BL.TYPES[L.c.t].label)} | ${esc(L.c.ag)}</span></td><td>${esc(BL.STAGES[L.c.stage])}</td><td>ETA ${E.effEta(L.c, S.scenario)}</td><td>${Math.round(E.completionP(L.c, S.scenario) * 100)}% likely</td><td>${Math.round(L.d)} km</td></tr>`).join("") || "<tr><td>None tracked nearby</td></tr>"}</table>
      <h2>Risk</h2><table>${[["Flood", m.risk.flood], ["Heat", m.risk.heat], ["Water stress", m.risk.water], ["Title and records", m.risk.title], ["Buyer restrictions", m.risk.reg]].map(([k, v]) => `<tr><td>${k}</td><td>${riskWord(v)}</td><td>${Math.round(v * 100)}/100</td></tr>`).join("")}</table>
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
    ...[...new Set(models.map((m) => m.state))].map((s) => ({ k: "State", t: s, s: "State or UT", go: () => fitState(s) }))
  ];
  function fitState(s) {
    const b = new maplibregl.LngLatBounds();
    for (const m of models) if (m.state === s) b.extend([m.lon, m.lat]);
    if (!b.isEmpty()) map.fitBounds(b, { padding: 120, duration: 1200, maxZoom: 8 });
    S.scr.state = s; openTool("screener", true);
  }
  function openPalette() { pal.classList.remove("hidden"); pin.value = ""; renderPalette(); setTimeout(() => pin.focus(), 20); }
  function closePalette() { pal.classList.add("hidden"); }
  function renderPalette() {
    const q = pin.value.trim().toLowerCase();
    if (!q) pItems = [...INDEX.filter((x) => x.k === "City").slice(0, 6), ...INDEX.filter((x) => x.k === "Project").slice(0, 6)];
    else pItems = INDEX.map((x) => { const t = x.t.toLowerCase(); const sc = t.startsWith(q) ? 3 : t.includes(q) ? 2 : x.s.toLowerCase().includes(q) ? 1 : 0; return { x, sc }; }).filter((o) => o.sc).sort((a, b) => b.sc - a.sc || a.x.t.length - b.x.t.length).slice(0, 40).map((o) => o.x);
    pIdx = 0; drawPalette(); geocode(q);
  }
  let geoT = null, geoQ = "";
  function geocode(q) {
    clearTimeout(geoT);
    if (q.length < 3 || !window.fetch) return;
    geoT = setTimeout(() => {
      geoQ = q;
      fetch("https://nominatim.openstreetmap.org/search?format=json&countrycodes=in&limit=6&q=" + encodeURIComponent(q), { headers: { "Accept-Language": "en" } })
        .then((r) => r.json()).then((res) => {
          if (geoQ !== pin.value.trim().toLowerCase() || pal.classList.contains("hidden")) return;
          const extra = (res || []).map((g) => ({ k: "Place", t: g.display_name.split(",").slice(0, 2).join(","), s: g.display_name.split(",").slice(2, 4).join(",").trim(), go: () => { map.flyTo({ center: [+g.lon, +g.lat], zoom: 12, duration: 1400 }); openLocation(+g.lon, +g.lat); } }));
          pItems = pItems.filter((x) => x.k !== "Place").concat(extra); drawPalette();
        }).catch(() => {});
    }, 380);
  }
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
      else if (S.sel != null) closeDetail();
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
    if (p.get("d") && byId.has(+p.get("d"))) openDetail(+p.get("d"));
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
  window.BhoomiLens = { S, models, map, recompute, paint };
})();
