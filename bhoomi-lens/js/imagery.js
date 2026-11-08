/* Dated satellite scenes through the public Planetary Computer STAC API.
 * Each scene is one observation, not a cloud-free mosaic or a parcel survey. */
(function (root) {
  const BL = (root.BL = root.BL || {});
  const SEARCH = "https://planetarycomputer.microsoft.com/api/stac/v1/search";
  const PROVIDER = "https://planetarycomputer.microsoft.com";

  function requestContext(lon, lat, options) {
    if (!Number.isFinite(lon) || !Number.isFinite(lat) || Math.abs(lon) > 180 || Math.abs(lat) > 90) throw new Error("Invalid map location");
    const now = options.now ? new Date(options.now) : new Date();
    if (!Number.isFinite(now.getTime())) throw new Error("Invalid search date");
    const get = options.fetch || (root.fetch && root.fetch.bind(root));
    if (!get) throw new Error("Image search is unavailable in this browser");
    return { now, get };
  }

  async function findScene(lon, lat, collection, start, end, options, get) {
    const params = new URLSearchParams({
      collections: collection,
      intersects: JSON.stringify({ type: "Point", coordinates: [lon, lat] }),
      datetime: `${start.toISOString()}/${end.toISOString()}`,
      sortby: "-datetime", limit: "1",
      query: JSON.stringify({ "eo:cloud_cover": { lt: 30 } })
    });
    const result = await get(`${SEARCH}?${params}`, { signal: options.signal });
    if (!result.ok) throw new Error(`Image search unavailable (${result.status})`);
    const data = await result.json(), scene = (data.features || [])[0];
    if (!scene) return null;
    const acquired = scene.properties && scene.properties.datetime;
    const date = new Date(acquired);
    const cloud = scene.properties && scene.properties["eo:cloud_cover"];
    const tilejsonUrl = scene.assets && scene.assets.tilejson && scene.assets.tilejson.href;
    if (!Number.isFinite(date.getTime()) || date > end || date < start || !Number.isFinite(cloud) || cloud < 0 || cloud >= 30 || !scene.geometry || !["Polygon", "MultiPolygon"].includes(scene.geometry.type) || !Array.isArray(scene.geometry.coordinates) || !Array.isArray(scene.bbox) || scene.bbox.length !== 4 || !scene.bbox.every(Number.isFinite) || !tilejsonUrl) throw new Error("Image metadata is incomplete or outside the search criteria");
    if (!contains(scene, lon, lat)) throw new Error("The returned scene does not cover the map center");
    if (new URL(tilejsonUrl).origin !== PROVIDER) throw new Error("Image metadata provider is not recognised");
    const response = await get(tilejsonUrl, { signal: options.signal });
    if (!response.ok) throw new Error(`Image tiles unavailable (${response.status})`);
    const tilejson = await response.json();
    if (!Array.isArray(tilejson.tiles) || !tilejson.tiles.length || tilejson.tiles.some((url) => new URL(url).origin !== PROVIDER)) throw new Error("Image tile metadata is incomplete");
    const platform = String((scene.properties && scene.properties.platform) || "");
    return {
      id: String(scene.id || ""), collection, date: date.toISOString(), cloud, platform,
      resolution: collection === "landsat-c2-l2" ? 30 : 10,
      scanGaps: collection === "landsat-c2-l2" && (/landsat-7/i.test(platform) || /^LE07_/.test(String(scene.id || ""))) && date >= new Date("2003-05-31T00:00:00Z"),
      bounds: scene.bbox, geometry: scene.geometry, tiles: tilejson.tiles,
      maxzoom: Math.min(16, Number.isFinite(tilejson.maxzoom) ? tilejson.maxzoom : 16)
    };
  }

  async function recentScene(lon, lat, options = {}) {
    const { now, get } = requestContext(lon, lat, options);
    const start = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
    const scene = await findScene(lon, lat, "sentinel-2-l2a", start, now, options, get);
    if (!scene) throw new Error("No scene with under 30% scene-wide cloud cover was found in the past year");
    return scene;
  }

  async function yearScene(lon, lat, year, options = {}) {
    const { now, get } = requestContext(lon, lat, options);
    if (!Number.isInteger(year) || year < 1984 || year > now.getUTCFullYear()) throw new Error("Choose an image year from 1984 through the current year");
    const start = new Date(Date.UTC(year, 0, 1));
    const last = new Date(Date.UTC(year + 1, 0, 1) - 1);
    const end = last < now ? last : now;
    let scene = null;
    if (year >= 2017) scene = await findScene(lon, lat, "sentinel-2-l2a", start, end, options, get);
    if (!scene) scene = await findScene(lon, lat, "landsat-c2-l2", start, end, options, get);
    if (!scene) throw new Error(`No scene with under 30% scene-wide cloud cover was found for ${year}`);
    return scene;
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
  BL.Imagery = { recentScene, yearScene, contains };
})(typeof window !== "undefined" ? window : globalThis);
