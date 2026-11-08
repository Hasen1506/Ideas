/* Browser regression checks. From bhoomi-lens/: npm ci, npx playwright install
 * chromium, then npm run test:browser. Set CHROMIUM_PATH to use system Chromium. */
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const types = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json" };
const server = http.createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    const file = path.resolve(root, "." + (pathname === "/" ? "/index.html" : pathname));
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    const body = await fs.readFile(file);
    res.writeHead(200, { "Content-Type": types[path.extname(file)] || "application/octet-stream" }).end(body);
  } catch (_) { res.writeHead(404).end(); }
});

(async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
    args: ["--no-sandbox", "--enable-webgl", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"]
  });
  const errors = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.on("pageerror", (error) => errors.push(error.message));
    const cors = { "access-control-allow-origin": "*" };
    let onlineRequests = 0;
    await page.route("**/photon.komoot.io/api/**", (route) => { onlineRequests++; return route.fulfill({ headers: cors, json: { features: [{ type: "Feature", geometry: { type: "Point", coordinates: [80.26, 13.08] }, properties: { name: "Unit Test Place", city: "Chennai", state: "Tamil Nadu", country: "India", countrycode: "IN" } }] } }); });
    const observed = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const observedLabel = observed.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
    await page.route("**/api/stac/v1/search?**", (route) => route.fulfill({ headers: cors, json: { features: [{ id: "test-scene", bbox: [80, 12, 81, 14], geometry: { type: "Polygon", coordinates: [[[80, 12], [81, 12], [81, 14], [80, 14], [80, 12]]] }, properties: { datetime: observed.toISOString(), "eo:cloud_cover": 19.7 }, assets: { tilejson: { href: "https://planetarycomputer.microsoft.com/api/data/v1/item/tilejson.json?item=test" } } }] } }));
    await page.route("**/api/data/v1/item/tilejson.json?**", (route) => route.fulfill({ headers: cors, json: { tiles: ["https://planetarycomputer.microsoft.com/api/data/v1/item/tiles/{z}/{x}/{y}?item=test"], maxzoom: 16 } }));
    await page.route("**/api/data/v1/item/tiles/**", (route) => route.fulfill({ headers: cors, contentType: "image/png", body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/aX0AAAAASUVORK5CYII=", "base64") }));
    await page.goto(url + "#pt=13.0800,80.2600", { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.locator("#fpcAsk").waitFor({ state: "visible", timeout: 60000 });
    const detail = await page.locator("#detailBody").innerText();
    assert.match(detail, /CHENNAI, TAMIL NADU/i);
    assert.match(detail, /market references? \| \d+ guideline proxies/i);
    assert.match(detail, /no validated plot-level error range/i);
    assert.doesNotMatch(detail, /fair range|overpriced|80% band/i);

    await page.evaluate(() => BhoomiLens.map.jumpTo({ center: [80.26, 13.08], zoom: 9 }));
    await page.locator("#btnRecent").click();
    await page.waitForFunction((label) => document.querySelector("#imageryStatus").textContent.includes("Recent scene at map center: " + label), observedLabel, { timeout: 20000 });
    const imagery = await page.evaluate(() => ({
      recent: !!BhoomiLens.map.getSource("sat-recent"),
      mosaic: BhoomiLens.map.getSource("sat").tiles[0],
      water: BhoomiLens.map.getSource("ix-water").tiles[0]
    }));
    assert.ok(imagery.recent);
    assert.match(imagery.mosaic, /s2cloudless-2025/);
    assert.match(imagery.water, /water-world\/tiles2024\/occurrence/);
    await page.locator("#btnSat").click();
    assert.equal(await page.locator("#btnRecent").getAttribute("aria-pressed"), "false");
    assert.equal(await page.evaluate(() => !!BhoomiLens.map.getSource("sat-recent")), false);

    await page.locator("#searchBtn").click();
    await page.locator("#paletteInput").fill("Unit Test Place");
    await page.waitForTimeout(600);
    assert.equal(onlineRequests, 0, "typing must not send a query to an external geocoder");
    await page.locator("#onlineSearch").click();
    await page.getByText("Unit Test Place", { exact: true }).waitFor({ timeout: 10000 });
    assert.equal(onlineRequests, 1);
    await page.keyboard.press("Escape");

    await page.locator("#fpcAsk").fill("1000");
    await page.locator('[data-ins="check"]').click();
    const comparison = await page.locator("#fpcOut").innerText();
    assert.match(comparison, /(?:above|below|matches) the model estimate/i);
    assert.match(comparison, /not a verdict/i);
    await page.selectOption("#scenario", "bear");
    await page.waitForTimeout(400);
    assert.match(decodeURIComponent(new URL(page.url()).hash), /pt=13\.0800,80\.2600/);

    await page.locator("#gapPrice").fill("1000");
    await page.locator("#gapArea").fill("1000");
    await page.locator("#gapDuty").fill("7");
    await page.locator('[data-ins="gap"]').click();
    const duty = await page.locator("#gapOut").innerText();
    assert.match(duty, /Illustration/);
    assert.doesNotMatch(duty, /no 50C|no .* difference arises/i);

    const popupPromise = page.waitForEvent("popup");
    await page.locator('[data-ins="report"]').click();
    const report = await popupPromise;
    await report.waitForLoadState("domcontentloaded");
    const reportText = await report.locator("body").innerText();
    assert.match(reportText, /not a validated prediction interval/i);
    assert.doesNotMatch(reportText, /fair range|bear \/ base \/ bull band/i);
    await report.close();

    await page.locator('[data-ins="watch"]').click();
    await page.locator("#btnAcct").click();
    const downloadPromise = page.waitForEvent("download");
    await page.locator("#accExport").click();
    const backupFile = await downloadPromise;
    const backup = await fs.readFile(await backupFile.path());
    assert.equal(JSON.parse(backup).format, "bhoomi-lens-backup");
    await page.evaluate(() => localStorage.removeItem("bl_spots"));
    await page.locator("#accImport").setInputFiles({ name: "backup.json", mimeType: "application/json", buffer: backup });
    await page.getByText("Saved places and settings merged on this device.").waitFor();
    assert.ok(await page.evaluate(() => JSON.parse(localStorage.getItem("bl_spots")).length > 0));
    await page.locator("#accImport").setInputFiles({ name: "bad.json", mimeType: "application/json", buffer: Buffer.from("not json") });
    await page.getByText("The file is not valid JSON.").waitFor();
    assert.ok(await page.evaluate(() => JSON.parse(localStorage.getItem("bl_spots")).length > 0));
    await page.locator("#btnAcct").click();
    await page.evaluate(() => {
      const saved = JSON.parse(localStorage.getItem("bl_spots")).at(-1);
      const snapshot = saved.projects[0];
      if (!snapshot) throw new Error("No nearby project to test alerts");
      const project = BL.CATALYSTS.find((c) => c.id === snapshot.id);
      project.delays = snapshot.delays + 1;
    });
    await page.locator('#rail [data-tool="alerts"]').click();
    assert.match(await page.locator("#panelBody").innerText(), /new delay recorded/i);

    await page.locator('[data-act="close-detail"]').click();
    await page.locator('#rail [data-tool="data"]').click();
    assert.match(await page.locator("#panelBody").innerText(), /Market-related references/i);
    assert.match(await page.locator("#panelBody").innerText(), /not independent completed sales/i);
    await page.locator('#rail [data-tool="draw"]').click();
    await page.locator('[data-act="quick-area"]').first().click();
    await page.getByText(/sampled cells inside mapped districts/).waitFor({ timeout: 30000 });
    const area = await page.evaluate(() => ({ n: BhoomiLens.S.area.n, sampled: BhoomiLens.S.area.sampled }));
    assert.ok(area.n > 0 && area.n <= area.sampled);
    assert.deepEqual(errors, [], "uncaught browser errors");
    await page.close();

    const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
    mobile.on("pageerror", (error) => errors.push(error.message));
    await mobile.goto(url + "#pt=13.0800,80.2600", { waitUntil: "domcontentloaded", timeout: 90000 });
    await mobile.locator("#fpcAsk").waitFor({ state: "visible", timeout: 60000 });
    const boxes = await mobile.evaluate(() => {
      const box = (selector) => { const r = document.querySelector(selector).getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, height: r.height }; };
      return { top: box(".topbar"), rail: box(".rail"), detail: box(".detail"), dock: box(".dock"), width: innerWidth };
    });
    assert.ok(boxes.rail.left >= 0 && boxes.rail.right <= boxes.width && boxes.rail.height <= 55, "mobile rail must fit the viewport");
    assert.ok(boxes.top.bottom < boxes.detail.top && boxes.detail.bottom < boxes.rail.top && boxes.rail.bottom < boxes.dock.top, "mobile controls and detail must not overlap");
    await mobile.locator("#btnInfra").scrollIntoViewIfNeeded();
    await mobile.locator("#btnInfra").click();
    await mobile.locator("#infraMenu").waitFor({ state: "visible" });
    const menu = await mobile.locator("#infraMenu").boundingBox();
    assert.ok(menu.x >= 0 && menu.x + menu.width <= 390, "mobile layers menu must remain on screen");
    assert.deepEqual(errors, [], "uncaught browser errors");
    await mobile.close();
    console.log("Browser checks passed: recent imagery, local and online search, shared location, evidence, comparison, backup, report, alerts, area analysis and mobile layout.");
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => server.close());
