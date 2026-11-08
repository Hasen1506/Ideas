// MapLibre 6 is an ES module; expose its namespace to the existing app scripts.
import * as maplibregl from "../vendor/maplibre/maplibre-gl.mjs";
window.maplibregl = maplibregl;
await import("./app.js");
