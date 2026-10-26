/* Bhoomi Lens: infrastructure layers, site checks and track record.
   Every layer here is OFF by default and switched on from the "Infra" menu.
   Sources: OpenStreetMap (ODbL), official acquisition notices, EC JRC/Google Global Surface Water, GSR 751(E) 2015. */
(function () {
  const BL = (window.BL = window.BL || {});
  const D = window.BL_INFRA || { exits: [], airports: [], airportBounds: {}, acq: [], acqUnplaced: [], routes: [], src: {} };
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const hav = (a, b, c, d) => { const r = Math.PI / 180, x = Math.sin(((c - a) * r) / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin(((d - b) * r) / 2) ** 2; return 12742 * Math.asin(Math.sqrt(x)); };
  const projById = () => { const m = {}; (window.BL_PROJECTS || window.PROJECTS || []).forEach((p) => (m[p.id] = p)); return m; };

  /* ---------- GeoJSON builders ---------- */
  function exitsFC() { return { type: "FeatureCollection", features: D.exits.map((e, i) => ({ type: "Feature", id: i, properties: { n: e[2] || "Exit" }, geometry: { type: "Point", coordinates: [e[0], e[1]] } })) }; }
  function boundsFC() {
    const P = projById();
    return { type: "FeatureCollection", features: Object.entries(D.airportBounds).map(([id, b]) => {
      const p = P[id] || {}; const ring = b.ring.slice(); if (ring.length && (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1])) ring.push(ring[0]);
      return { type: "Feature", properties: { id, n: p.n || b.name, osm: b.name, cancelled: p.cancelled ? 1 : 0 }, geometry: { type: "Polygon", coordinates: [ring] } };
    }) };
  }
  // Weekly Gazette notices (scripts/gazette_job.py -> data/gazette.js): villages placed on Census 2011 points join the notified-villages layer.
  (() => { const G = window.BL_GAZETTE || (window.BL_UPDATES || {}).gazette; if (!G || !G.villages) return; const seen = new Set(D.acq.map((a) => (a.v + "|" + a.s).toLowerCase()));
    G.villages.forEach((g) => { const k = (g.v + "|" + g.s).toLowerCase(); if (!g.ll || seen.has(k)) return; seen.add(k);
      D.acq.push({ g: 1, p: g.p || "National highway land acquisition", v: g.v, tk: g.tk, d: g.d, s: g.s, sv: g.sv, nt: g.nt, dt: g.dt, au: (g.so || "") + (g.km ? ", Km " + g.km : ""), u: g.u, ll: g.ll, geo: "Census 2011 village point (approximate)" }); }); })();
  function acqFC() {
    const P = projById();
    return { type: "FeatureCollection", features: D.acq.map((a, i) => ({ type: "Feature", id: i, properties: { i, dropped: a.pid && P[a.pid] && P[a.pid].cancelled ? 1 : 0 }, geometry: { type: "Point", coordinates: a.ll } })) };
  }

  /* ---------- Layers (all hidden until toggled) ---------- */
  const LAYERS = {
    water: { label: "Water history", desc: "Where surface water has stood at any time 1984-2024 (satellite, EC JRC/Google). Useful for spotting filled-in tanks and lake beds.", ids: ["ix-water"] },
    bounds: { label: "Airport boundaries", desc: "Mapped airport land from OpenStreetMap, plus the 20 km height-rule ring around operational airports.", ids: ["ix-air-fill", "ix-air-line", "ix-aai"] },
    exits: { label: "Expressway exits", desc: "Existing interchanges from OpenStreetMap. Proposed exits are only shown where officially mapped.", ids: ["ix-exits"] },
    acq: { label: "Notified villages", desc: "Villages named in official land-acquisition notices. Dot = village centre (approximate), not the acquired parcel.", ids: ["ix-acq", "ix-acq-ring"] },
    rera: { label: "New real-estate projects (TN RERA)", desc: "Building projects registered with TNRERA 2024-2026, at the coordinates the builder filed. A cluster of new registrations is an early sign of demand.", ids: ["ix-rera"] },
    inv: { label: "Big company investments", desc: "71 sourced factories, data centres and parks (Rs crore, jobs, status) in 5 southern states. Pin = park or town centre, not the exact plot.", ids: ["ix-inv", "ix-inv-ring"] },
    routes: { label: "Expressway routes (live)", desc: "Motorways under construction or proposed, loaded from OpenStreetMap for the area on screen (zoom in to 8+).", ids: ["ix-routes"] },
  };
  const on = {};
  function aaiFC() {
    const f = D.airports.map((a) => { const c = [], R = 20, n = 48; for (let k = 0; k <= n; k++) { const t = (k / n) * 2 * Math.PI; c.push([a[0] + (R / (111.32 * Math.cos((a[1] * Math.PI) / 180))) * Math.cos(t), a[1] + (R / 110.57) * Math.sin(t)]); } return { type: "Feature", properties: { n: a[2] }, geometry: { type: "LineString", coordinates: c } }; });
    return { type: "FeatureCollection", features: f };
  }
  function addLayers(map, before) {
    const none = { visibility: "none" };
    map.addSource("ix-water", { type: "raster", tiles: ["https://storage.googleapis.com/global-surface-water/tiles2021/occurrence/{z}/{x}/{y}.png"], tileSize: 256, maxzoom: 13, attribution: "Surface water: EC JRC/Google" });
    map.addLayer({ id: "ix-water", type: "raster", source: "ix-water", layout: none, paint: { "raster-opacity": 0.95, "raster-contrast": 0.3 } }, before);
    map.addSource("ix-air", { type: "geojson", data: boundsFC() });
    map.addLayer({ id: "ix-air-fill", type: "fill", source: "ix-air", layout: none, paint: { "fill-color": ["case", ["==", ["get", "cancelled"], 1], "#7f8aa3", "#7cc4ff"], "fill-opacity": 0.22 } });
    map.addLayer({ id: "ix-air-line", type: "line", source: "ix-air", layout: none, paint: { "line-color": ["case", ["==", ["get", "cancelled"], 1], "#c9d3e6", "#7cc4ff"], "line-width": 1.6 } });
    map.addSource("ix-aai", { type: "geojson", data: aaiFC() });
    map.addLayer({ id: "ix-aai", type: "line", source: "ix-aai", layout: none, minzoom: 7, paint: { "line-color": "#7cc4ff", "line-width": 1, "line-dasharray": [2, 3], "line-opacity": 0.5 } });
    map.addSource("ix-exits", { type: "geojson", data: exitsFC() });
    map.addLayer({ id: "ix-exits", type: "circle", source: "ix-exits", layout: none, minzoom: 7, paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 7, 2.5, 12, 5], "circle-color": "#ffd166", "circle-stroke-color": "#0b1020", "circle-stroke-width": 1 } });
    map.addSource("ix-acq", { type: "geojson", data: acqFC() });
    map.addLayer({ id: "ix-acq-ring", type: "circle", source: "ix-acq", layout: none, paint: { "circle-radius": ["interpolate", ["exponential", 2], ["zoom"], 8, 3, 14, 140], "circle-color": "#ff6b6b", "circle-opacity": 0.06, "circle-stroke-color": "#ff6b6b", "circle-stroke-opacity": 0.35, "circle-stroke-width": 1 } });
    map.addLayer({ id: "ix-acq", type: "circle", source: "ix-acq", layout: none, paint: { "circle-radius": 5, "circle-color": ["case", ["==", ["get", "dropped"], 1], "#7f8aa3", "#ff6b6b"], "circle-stroke-color": "#fff", "circle-stroke-width": 1.2 } });
    const PV = window.BL_PRIVATE || { rera: [], inv: [] };
    map.addSource("ix-rera", { type: "geojson", data: { type: "FeatureCollection", features: PV.rera.map((r, i) => ({ type: "Feature", properties: { i }, geometry: { type: "Point", coordinates: [r[0], r[1]] } })) } });
    map.addLayer({ id: "ix-rera", type: "circle", source: "ix-rera", minzoom: 8, layout: none, paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, 2.5, 13, 6], "circle-color": "#ff9de2", "circle-stroke-color": "#0b1020", "circle-stroke-width": 1 } });
    map.addSource("ix-inv", { type: "geojson", data: { type: "FeatureCollection", features: PV.inv.map((x, i) => ({ type: "Feature", properties: { i, cr: x.cr || 0, bad: /cancel|stall/i.test(x.s || "") ? 1 : 0 }, geometry: { type: "Point", coordinates: x.ll } })) } });
    map.addLayer({ id: "ix-inv-ring", type: "circle", source: "ix-inv", layout: none, paint: { "circle-radius": ["interpolate", ["linear"], ["get", "cr"], 0, 8, 5000, 16, 30000, 26], "circle-color": "#ffd166", "circle-opacity": 0.12, "circle-stroke-color": "#ffd166", "circle-stroke-opacity": 0.5, "circle-stroke-width": 1 } });
    map.addLayer({ id: "ix-inv", type: "circle", source: "ix-inv", layout: none, paint: { "circle-radius": 5, "circle-color": ["case", ["==", ["get", "bad"], 1], "#7f8aa3", "#ffd166"], "circle-stroke-color": "#0b1020", "circle-stroke-width": 1.5 } });
    map.on("click", "ix-rera", (e) => { const r = PV.rera[e.features[0].properties.i]; BL.Infra.onPick && BL.Infra.onPick(`<b>${esc(r[2])}</b><div class="muted">${esc(r[3])}</div><div class="small">${esc(r[5])}${r[5] ? ", " : ""}${esc(r[4])} | ${esc(r[8])}</div><div class="small muted">RERA ${esc(r[6])}, registered ${esc(r[7])}${r[9] ? ", completion due " + esc(r[9]) : ""}. Location as filed by the builder (${esc(r[10])}).</div><a href="${esc(r[11])}" target="_blank" rel="noopener">TNRERA register</a>`, e.lngLat); });
    map.on("click", "ix-inv", (e) => { const x = PV.inv[e.features[0].properties.i]; BL.Infra.onPick && BL.Infra.onPick(`<b>${esc(x.co)}</b><div>${esc(x.p)}</div><div class="small">${esc(x.loc || "")}, ${esc(x.d || "")}, ${esc(x.st || "")}</div><div class="small">${x.cr ? "Rs " + Number(x.cr).toLocaleString("en-IN") + " crore" : ""}${x.jobs ? " | " + Number(x.jobs).toLocaleString("en-IN") + " jobs" : ""} | <b>${esc(x.s || "")}</b> ${esc(x.sd || "")}</div><div class="small muted">Pin at ${esc(x.cb || "town centre")}, not the plot.</div>${(x.src || []).map((z) => `<a href="${esc(z.u)}" target="_blank" rel="noopener">${esc(z.p || "source")} ${esc(z.d || "")}</a>`).join(" | ")}`, e.lngLat); });
    ["ix-rera", "ix-inv"].forEach((id) => { map.on("mouseenter", id, () => (map.getCanvas().style.cursor = "pointer")); map.on("mouseleave", id, () => (map.getCanvas().style.cursor = "")); });
    map.addSource("ix-routes", { type: "geojson", data: { type: "FeatureCollection", features: routeFeatures() } });
    map.addLayer({ id: "ix-routes", type: "line", source: "ix-routes", layout: { visibility: "none", "line-cap": "round" }, paint: { "line-color": ["match", ["get", "st"], "construction", "#ffb547", "proposed", "#b98cff", "#2ee6c5"], "line-width": ["interpolate", ["linear"], ["zoom"], 6, 1.5, 12, 4], "line-dasharray": [2, 1.2] } });
    map.on("click", "ix-acq", (e) => { const i = e.features[0].properties.i; BL.Infra.onPick && BL.Infra.onPick(acqHtml(D.acq[i]), e.lngLat); });
    map.on("click", "ix-air-fill", (e) => { const p = e.features[0].properties; BL.Infra.onPick && BL.Infra.onPick(`<b>${esc(p.n)}</b><div class="muted">Boundary: OpenStreetMap ("${esc(p.osm)}").${p.cancelled ? " Project dropped; land was earmarked for it." : ""}</div>`, e.lngLat); });
    ["ix-acq", "ix-air-fill", "ix-exits"].forEach((id) => { map.on("mouseenter", id, () => (map.getCanvas().style.cursor = "pointer")); map.on("mouseleave", id, () => (map.getCanvas().style.cursor = "")); });
    map.on("click", "ix-exits", (e) => { BL.Infra.onPick && BL.Infra.onPick(`<b>${esc(e.features[0].properties.n)}</b><div class="muted">Expressway exit (OpenStreetMap)</div>`, e.lngLat); });
    map.on("moveend", () => { if (on.routes) loadRoutes(map); });
  }
  function setLayer(map, k, v) {
    on[k] = v; LAYERS[k].ids.forEach((id) => { try { map.setLayoutProperty(id, "visibility", v ? "visible" : "none"); } catch (e) {} });
    if (k === "routes" && v) loadRoutes(map);
  }

  /* ---------- Live OSM routes (browser fetch, cached per tile) ---------- */
  const RKEY = "bl_routes_v1"; let rcache = {}; try { rcache = JSON.parse(localStorage.getItem(RKEY) || "{}"); } catch (e) {}
  function routeFeatures() { const out = (D.routes || []).slice(); Object.values(rcache).forEach((arr) => arr.forEach((f) => out.push(f))); return out; }
  const OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter", "https://maps.mail.ru/osm/tools/overpass/api/interpreter"];
  let busy = false; BL.Infra_routeStatus = "";
  async function loadRoutes(map) {
    if (busy) return; const z = map.getZoom(); if (z < 8) { status("Zoom in to level 8 or closer to load routes for this area."); return; }
    const c = map.getCenter(), key = Math.floor(c.lat) + "," + Math.floor(c.lng); if (rcache[key]) return;
    const bb = [Math.floor(c.lat) - 0.5, Math.floor(c.lng) - 0.5, Math.floor(c.lat) + 1.5, Math.floor(c.lng) + 1.5].join(",");
    const q = `[out:json][timeout:25];(way["highway"="construction"]["construction"~"motorway|trunk"](${bb});way["highway"="proposed"]["proposed"~"motorway|trunk"](${bb});way["highway"="motorway"](${bb}););out geom;`;
    busy = true; status("Loading routes from OpenStreetMap...");
    for (const u of OVERPASS) {
      try {
        const r = await fetch(u, { method: "POST", body: "data=" + encodeURIComponent(q), headers: { "Content-Type": "application/x-www-form-urlencoded" } });
        if (!r.ok) continue; const j = await r.json();
        rcache[key] = (j.elements || []).filter((e) => e.geometry).map((e) => ({ type: "Feature", properties: { st: e.tags.highway, n: e.tags.name || e.tags.ref || "" }, geometry: { type: "LineString", coordinates: e.geometry.map((p) => [+p.lon.toFixed(5), +p.lat.toFixed(5)]) } }));
        try { localStorage.setItem(RKEY, JSON.stringify(rcache)); } catch (e) {}
        map.getSource("ix-routes").setData({ type: "FeatureCollection", features: routeFeatures() });
        status(`${rcache[key].length} road segments loaded for this area (OpenStreetMap). Orange = under construction, purple = proposed, teal = open.`); busy = false; return;
      } catch (e) {}
    }
    busy = false; status("OpenStreetMap route servers are busy right now. Nothing is drawn rather than a guessed line; try again in a few minutes.");
  }
  function status(t) { BL.Infra_routeStatus = t; BL.Infra.onStatus && BL.Infra.onStatus(t); }

  /* ---------- Spot checks ---------- */
  function nearestExit(lat, lon) { let b = null; for (const e of D.exits) { if (Math.abs(e[1] - lat) > 1 || Math.abs(e[0] - lon) > 1) continue; const d = hav(lat, lon, e[1], e[0]); if (!b || d < b.d) b = { d, n: e[2] }; } return b; }
  function nearestAirport(lat, lon) { let b = null; for (const a of D.airports) { const d = hav(lat, lon, a[1], a[0]); if (!b || d < b.d) b = { d, n: a[2], iata: a[3] }; } return b; }
  function nearAcq(lat, lon, km) { return D.acq.map((a) => ({ a, d: hav(lat, lon, a.ll[1], a.ll[0]) })).filter((x) => x.d <= km).sort((x, y) => x.d - y.d); }
  function band(d) { return d <= 2 ? "0-2 km" : d <= 5 ? "2-5 km" : d <= 10 ? "5-10 km" : "over 10 km"; }
  function checks(lat, lon) {
    const ex = nearestExit(lat, lon), ap = nearestAirport(lat, lon), aq = nearAcq(lat, lon, 3), P = projById();
    const row = (k, t, cls) => `<div class="cat-row"><div class="grow"><b>${k}</b><div class="muted" style="font-size:12px">${t}</div></div>${cls ? `<span class="pill ${cls}">${cls === "r" ? "check" : cls === "s" ? "ok" : "info"}</span>` : ""}</div>`;
    const out = [];
    out.push(row("Nearest expressway exit", ex ? `${ex.d.toFixed(1)} km (${band(ex.d)}) - ${esc(ex.n || "unnamed")}. Straight-line distance; existing exits only (OpenStreetMap).` : "No mapped expressway exit within about 100 km.", ex && ex.d <= 5 ? "s" : ""));
    if (aq.length) { const a = aq[0].a, dropped = a.pid && P[a.pid] && P[a.pid].cancelled; out.push(row("Land-acquisition notice nearby", `${esc(a.v)} village centre is ${aq[0].d.toFixed(1)} km away: ${esc(a.p)}${a.dt ? ", notified " + esc(a.dt) : ""}${dropped ? " (project since dropped)" : ""}. Village centre is approximate; check the survey numbers in the <a href="${esc(a.u)}" target="_blank" rel="noopener">notice</a>.`, "r")); }
    else out.push(row("Land-acquisition notice nearby", `None of the ${D.acq.length} mapped notified villages is within 3 km. ${D.acqUnplaced.length} notified villages could not be placed on the map, so this is not a clearance.`, ""));
    out.push(row("Airport height rule", ap && ap.d <= 20 ? `${ap.d.toFixed(1)} km from ${esc(ap.n)} (${esc(ap.iata)}). Inside the 20 km zone, so a height NOC from AAI may be needed. Check the actual limit on <a href="https://nocas2.aai.aero/nocas/" target="_blank" rel="noopener">AAI NOCAS</a>.` : ap ? `Nearest operational airport ${esc(ap.n)} is ${ap.d.toFixed(0)} km away, outside the 20 km height-rule zone.` : "No airport data.", ap && ap.d <= 20 ? "r" : "s"));
    const cd = coastKm(lat, lon);
    if (cd != null && cd <= 3) out.push(row("Coastal zone (CRZ)", `About ${cd < 0.5 ? "under 0.5" : cd.toFixed(1)} km from the coastline (approximate map, 200-500 m error). Coastal Regulation Zone rules may restrict building up to 500 m from the high-tide line, and along tidal creeks. The legal map is per survey number: <a href="${lat < 13.6 && lat > 8 && lon > 76.2 ? "https://tnsczma.tn.gov.in/approvedczmpmaps.php" : "https://czmp.ncscm.res.in/"}" target="_blank" rel="noopener">official CZMP maps</a>.`, "r"));
    const pr = premiumFor(lat, lon); if (pr) out.push(row("What past projects did at this distance", pr, ""));
    out.push(row("Water history", on.water ? `Water history is on: blue shading at this spot means satellites saw surface water here at some point since 1984 (darker = more often). No shading means no water was seen at 30 m resolution; small tanks can still be missed. Confirm with the revenue record (A-register / adangal).` : `Turn on <a href="#" data-ix="water">Water history</a> to see whether this spot has held water at any time since 1984 (satellite record). A filled-in tank or lake bed is a legal and flood risk; confirm with the revenue record (A-register / adangal).`, ""));
    return `<h3>Site checks</h3><div class="card" style="padding:4px 12px">${out.join("")}<div class="muted" style="font-size:11px;padding:6px 0">Checks use public data only and are not legal clearance. The coastal line above is a screening prompt from an approximate coastline, not the legal CRZ boundary; the legal CRZ and master-plan zoning maps exist only as PDFs, so they are linked, not drawn.</div></div>`;
  }
  function acqHtml(a) { return `<b>${esc(a.v)}</b> <span class="muted">${esc(a.tk || "")}${a.tk ? ", " : ""}${esc(a.d || "")}, ${esc(a.s)}</span><div style="margin-top:4px">${esc(a.p)}</div><div class="muted" style="font-size:12px">${esc(a.nt || "Notice")}${a.dt ? ", " + esc(a.dt) : ""}${a.au ? " - " + esc(a.au) : ""}${a.sv ? "<br>Survey nos: " + esc(Array.isArray(a.sv) ? a.sv.join(", ") : a.sv) : ""}${a.c ? "<br>" + esc(a.c) : ""}<br>Dot = village centre from ${esc(a.geo || "OpenStreetMap")}, approximate.</div>${a.u ? `<a href="${esc(a.u)}" target="_blank" rel="noopener">Open the notice</a>` : ""}`; }


  /* ---------- Coast distance (Natural Earth 10m; prompt only) ---------- */
  function coastKm(lat, lon) {
    const L = window.BL_COAST; if (!L) return null; let b = Infinity;
    for (const ln of L) for (let i = 1; i < ln.length; i++) {
      const a = ln[i - 1], c = ln[i]; if (Math.abs(a[1] - lat) > 0.3 && Math.abs(c[1] - lat) > 0.3) continue; if (Math.abs(a[0] - lon) > 0.3 && Math.abs(c[0] - lon) > 0.3) continue;
      const kx = 111.32 * Math.cos((lat * Math.PI) / 180), ky = 110.57, ax = (a[0] - lon) * kx, ay = (a[1] - lat) * ky, cx = (c[0] - lon) * kx, cy = (c[1] - lat) * ky;
      const dx = cx - ax, dy = cy - ay, t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy || 1)));
      b = Math.min(b, Math.hypot(ax + t * dx, ay + t * dy));
    }
    return b === Infinity ? null : b;
  }
  /* ---------- Historical premium by project type and distance band (Track record cases) ---------- */
  const kindOf = (name) => /airport|KIA|aerodrome/i.test(name) ? "airport" : /metro/i.test(name) ? "metro" : /ORR|ring road|expressway|highway|NH/i.test(name) ? "road" : "other";
  function premiumTable() {
    const B = (window.BL_BACKTEST || { rows: [] }).rows, T = {};
    B.forEach((r) => { const k = kindOf(r.project) + "|" + band(r.dist); (T[k] = T[k] || []).push(r); });
    return T;
  }
  function premiumFor(lat, lon) {
    const ex = nearestExit(lat, lon), ap = nearestAirport(lat, lon), T = premiumTable(), parts = [];
    const say = (kind, d, label) => { const rows = T[kind + "|" + band(d)] || []; if (rows.length >= 5) { const v = rows.map((r) => r.obs).sort((a, b) => a - b), med = v[Math.floor(v.length / 2)]; parts.push(`${label} ${band(d)}: past cases rose a median ${med.toFixed(2)}x more than their city (n=${rows.length}).`); } else parts.push(`${label} ${band(d)}: not enough history yet (${rows.length} case${rows.length === 1 ? "" : "s"}), so no premium is claimed.`); };
    if (ex && ex.d <= 10) say("road", ex.d, "Road corridor,");
    if (ap && ap.d <= 10) say("airport", ap.d, "Airport,");
    return parts.length ? parts.join("<br>") + ` <span class="muted">Source: Track record panel.</span>` : "";
  }
  /* ---------- Track record panel ---------- */
  function trackPanel() {
    const B = window.BL_BACKTEST || { rows: [] };
    const rows = B.rows.slice().sort((a, b) => b.obs - a.obs);
    const x = (v) => (v == null ? "-" : v.toFixed(2) + "x");
    return `<div class="muted" style="font-size:12px;margin-bottom:8px">${rows.length} past projects where a land price before and after was documented. "Seen" is the price multiple over the city's general market change; "Model" is what Bhoomi Lens predicts today for the same spot and years. Each row links to its source.</div>
      <div class="card" style="padding:4px 12px">${rows.map((r) => `<div class="cat-row"><div class="grow"><b>${esc(r.project)}</b><div class="muted" style="font-size:12px">${esc(r.loc)} | ${r.dist} km | ${r.y0}-${r.y1} | <a href="${esc(r.src)}" target="_blank" rel="noopener">source</a></div></div><div style="text-align:right;font-size:12px;white-space:nowrap">Seen <b>${x(r.obs)}</b><br><span class="muted">Model ${x(r.now)}</span></div></div>`).join("")}</div>
      <div class="muted" style="font-size:12px;margin-top:8px">Average error (log scale): ${B.oldLoss != null ? B.oldLoss.toFixed(3) : "-"} before recalibration, ${B.newLoss != null ? B.newLoss.toFixed(3) : "-"} now. Small sample; read as direction, not guarantee.</div>`;
  }
  function unplacedHtml() { return D.acqUnplaced.length ? `<details style="margin-top:8px"><summary class="muted">${D.acqUnplaced.length} notified villages not on the map (name not found)</summary><div class="muted" style="font-size:12px">${D.acqUnplaced.map((a) => `${esc(a.v)} (${esc(a.p.split("(")[0].trim())})${a.u ? ` <a href="${esc(a.u)}" target="_blank" rel="noopener">notice</a>` : ""}`).join("; ")}</div></details>` : ""; }
  function menuHtml() { return Object.entries(LAYERS).map(([k, L]) => `<label class="ix-item"><input type="checkbox" data-ix-toggle="${k}" ${on[k] ? "checked" : ""}><span><b>${L.label}</b><small>${L.desc}</small></span></label>`).join("") + `<div class="ix-status muted">${esc(BL.Infra_routeStatus)}</div>${unplacedHtml()}`; }

  BL.Infra = { coastKm, premiumFor, data: D, addLayers, setLayer, checks, trackPanel, menuHtml, nearestExit, nearestAirport, nearAcq, band, isOn: (k) => !!on[k], LAYERS, onPick: null, onStatus: null };
})();
