/* Find recorded Tamil Nadu guideline histories without interpolating missing years. */
(function (root) {
  const BL = (root.BL = root.BL || {});
  const validCoordinate = (n, limit) => Number.isFinite(n) && Math.abs(n) <= limit;
  function distance(lat1, lon1, lat2, lon2) {
    const rad = Math.PI / 180;
    const x = Math.sin((lat2 - lat1) * rad / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin((lon2 - lon1) * rad / 2) ** 2;
    return 12742 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, x))));
  }
  function nearest(data, lat, lon, maxKm = 5, limit = 3) {
    if (!validCoordinate(lat, 90) || !validCoordinate(lon, 180) || !Number.isFinite(maxKm) || maxKm < 0 || !Number.isInteger(limit) || limit < 1) return [];
    return ((data && data.rows) || []).filter((r) => Array.isArray(r) && validCoordinate(r[4], 90) && validCoordinate(r[5], 180))
      .map((row) => ({ row, distance: distance(lat, lon, row[4], row[5]) }))
      .filter((x) => x.distance <= maxKm)
      .sort((a, b) => a.distance - b.distance || String(a.row[0]).localeCompare(String(b.row[0])))
      .slice(0, limit);
  }
  function observations(data, row) {
    return ((data && data.rev) || []).map((revision, i) => {
      const value = row && row[6 + i];
      return { revision: String(revision), value: Number.isFinite(value) && value > 0 ? value : null };
    });
  }
  BL.Guideline = { nearest, observations };
})(typeof window !== "undefined" ? window : globalThis);
