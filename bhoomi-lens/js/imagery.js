/* Recent Sentinel-2 scene discovery through the public Planetary Computer STAC API.
 * The scene is an observation, not a cloud-free annual mosaic or a parcel survey. */
(function (root) {
  const BL = (root.BL = root.BL || {});
  const SEARCH = "https://planetarycomputer.microsoft.com/api/stac/v1/search";
  const PROVIDER = "https://planetarycomputer.microsoft.com";

  async function recentScene(lon, lat, options = {}) {
    if (!Number.isFinite(lon) || !Number.isFinite(lat) || Math.abs(lon) > 180 || Math.abs(lat) > 90) throw new Error("Invalid map location");
    const now = options.now ? new Date(options.now) : new Date();
    if (!Number.isFinite(now.getTime())) throw new Error("Invalid search date");
    const start = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
    const params = new URLSearchParams({
      collections: "sentinel-2-l2a",
      intersects: JSON.stringify({ type: "Point", coordinates: [lon, lat] }),
      datetime: `${start.toISOString()}/${now.toISOString()}`,
      sortby: "-datetime", limit: "1",
      query: JSON.stringify({ "eo:cloud_cover": { lt: 30 } })
    });
    const get = options.fetch || (root.fetch && root.fetch.bind(root));
    if (!get) throw new Error("Image search is unavailable in this browser");
    const result = await get(`${SEARCH}?${params}`, { signal: options.signal });
    if (!result.ok) throw new Error(`Image search unavailable (${result.status})`);
    const data = await result.json(), scene = (data.features || [])[0];
    if (!scene) throw new Error("No scene with under 30% scene-wide cloud cover was found in the past year");
    const acquired = scene.properties && scene.properties.datetime;
    const date = new Date(acquired);
    const cloud = scene.properties && scene.properties["eo:cloud_cover"];
    const tilejsonUrl = scene.assets && scene.assets.tilejson && scene.assets.tilejson.href;
    if (!Number.isFinite(date.getTime()) || date > now || date < start || !Number.isFinite(cloud) || cloud < 0 || cloud >= 30 || !scene.geometry || !["Polygon", "MultiPolygon"].includes(scene.geometry.type) || !Array.isArray(scene.geometry.coordinates) || !Array.isArray(scene.bbox) || scene.bbox.length !== 4 || !scene.bbox.every(Number.isFinite) || !tilejsonUrl) throw new Error("Image metadata is incomplete or outside the search criteria");
    if (!contains(scene, lon, lat)) throw new Error("The returned scene does not cover the map center");
    if (new URL(tilejsonUrl).origin !== PROVIDER) throw new Error("Image metadata provider is not recognised");
    const response = await get(tilejsonUrl, { signal: options.signal });
    if (!response.ok) throw new Error(`Image tiles unavailable (${response.status})`);
    const tilejson = await response.json();
    if (!Array.isArray(tilejson.tiles) || !tilejson.tiles.length || tilejson.tiles.some((url) => new URL(url).origin !== PROVIDER)) throw new Error("Image tile metadata is incomplete");
    return {
      id: String(scene.id || ""), date: date.toISOString(),
      cloud,
      bounds: scene.bbox, geometry: scene.geometry, tiles: tilejson.tiles,
      maxzoom: Math.min(16, Number.isFinite(tilejson.maxzoom) ? tilejson.maxzoom : 16)
    };
  }

  function pointInRing(lon, lat, ring) {
    if (!Array.isArray(ring) || ring.length < 4 || !ring.every((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]))) return false;
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j];
      if ((yi > lat) !== (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  function contains(scene, lon, lat, testRing = pointInRing) {
    if (!scene || !scene.geometry) return false;
    const g = scene.geometry;
    const polys = g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : [];
    return Array.isArray(polys) && polys.some((p) => Array.isArray(p) && p[0] && testRing(lon, lat, p[0]) && !p.slice(1).some((ring) => testRing(lon, lat, ring)));
  }
  BL.Imagery = { recentScene, contains };
})(typeof window !== "undefined" ? window : globalThis);
