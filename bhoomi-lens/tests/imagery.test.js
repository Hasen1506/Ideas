const test = require("node:test");
const assert = require("node:assert/strict");
require("../js/imagery.js");
const { recentScene, contains } = globalThis.BL.Imagery;

const polygon = { type: "Polygon", coordinates: [[[80, 12], [81, 12], [81, 14], [80, 14], [80, 12]]] };
const scene = { id: "scene-1", bbox: [80, 12, 81, 14], geometry: polygon, properties: { datetime: "2026-11-05T04:59:59Z", "eo:cloud_cover": 19.7 }, assets: { tilejson: { href: "https://planetarycomputer.microsoft.com/api/data/v1/item/tilejson.json?item=1" } } };
const tiles = { tiles: ["https://planetarycomputer.microsoft.com/api/data/v1/item/tiles/{z}/{x}/{y}?item=1"], maxzoom: 24 };
const ok = (body) => ({ ok: true, json: async () => body });
const inside = (x, y, ring) => { let hit = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) if ((ring[i][1] > y) !== (ring[j][1] > y) && x < (ring[j][0] - ring[i][0]) * (y - ring[i][1]) / (ring[j][1] - ring[i][1]) + ring[i][0]) hit = !hit; return hit; };

test("searches at the requested point and exposes the actual acquisition date", async () => {
  const calls = [];
  const fetch = async (url) => { calls.push(url); return calls.length === 1 ? ok({ features: [scene] }) : ok(tiles); };
  const result = await recentScene(80.26, 13.08, { fetch, now: "2026-11-08T00:00:00Z" });
  const query = new URL(calls[0]).searchParams;
  assert.deepEqual(JSON.parse(query.get("intersects")).coordinates, [80.26, 13.08]);
  assert.equal(query.get("sortby"), "-datetime");
  assert.equal(JSON.parse(query.get("query"))["eo:cloud_cover"].lt, 30);
  assert.equal(result.date, "2026-11-05T04:59:59.000Z");
  assert.equal(result.cloud, 19.7);
  assert.equal(result.maxzoom, 16);
  assert.ok(contains(result, 80.26, 13.08, inside));
  assert.ok(!contains(result, 77, 13, inside));
});

test("reports no recent scene without fabricating a date", async () => {
  await assert.rejects(recentScene(80, 13, { fetch: async () => ok({ features: [] }), now: "2026-11-08" }), /No scene/);
});

test("rejects unexpected tile providers and future scene dates", async () => {
  const bad = structuredClone(scene); bad.assets.tilejson.href = "https://example.org/tiles.json";
  await assert.rejects(recentScene(80, 13, { fetch: async () => ok({ features: [bad] }), now: "2026-11-08" }), /provider/);
  const future = structuredClone(scene); future.properties.datetime = "2026-12-01T00:00:00Z";
  await assert.rejects(recentScene(80, 13, { fetch: async () => ok({ features: [future] }), now: "2026-11-08" }), /incomplete/);
});

test("rejects a scene that does not cover the requested location", async () => {
  await assert.rejects(recentScene(77, 13, { fetch: async () => ok({ features: [scene] }), now: "2026-11-08" }), /does not cover/);
});

test("does not treat holes as part of a scene footprint", () => {
  const withHole = { geometry: { type: "Polygon", coordinates: [polygon.coordinates[0], [[80.2, 13], [80.4, 13], [80.4, 13.2], [80.2, 13.2], [80.2, 13]]] } };
  assert.equal(contains(withHole, 80.3, 13.1, inside), false);
});
