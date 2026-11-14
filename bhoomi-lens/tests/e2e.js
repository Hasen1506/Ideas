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
    page.on("pageerror", (error) => errors.push(error.stack || error.message));
    const cors = { "access-control-allow-origin": "*" };
    let onlineRequests = 0;
    await page.route("**/photon.komoot.io/api/**", (route) => { onlineRequests++; return route.fulfill({ headers: cors, json: { features: [{ type: "Feature", geometry: { type: "Point", coordinates: [80.26, 13.08] }, properties: { name: "Unit Test Place", city: "Chennai", state: "Tamil Nadu", country: "India", countrycode: "IN" } }] } }); });
    const observed = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const observedLabel = observed.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
    await page.route("**/api/stac/v1/search?**", (route) => {
      const params = new URL(route.request().url()).searchParams;
      if ((params.get("datetime") || "").startsWith("2011-")) return route.fulfill({ headers: cors, json: { features: [] } });
      const historical = params.get("collections") === "landsat-c2-l2";
      return route.fulfill({ headers: cors, json: { features: [{ id: historical ? "LE07_test-scene" : "test-scene", bbox: [80, 12, 81, 14], geometry: { type: "Polygon", coordinates: [[[80, 12], [81, 12], [81, 14], [80, 14], [80, 12]]] }, properties: { datetime: historical ? "2012-11-14T04:54:26Z" : observed.toISOString(), platform: historical ? "landsat-7" : "sentinel-2b", "eo:cloud_cover": 19.7 }, assets: { tilejson: { href: "https://planetarycomputer.microsoft.com/api/data/v1/item/tilejson.json?item=test" } } }] } });
    });
    await page.route("**/api/data/v1/item/tilejson.json?**", (route) => route.fulfill({ headers: cors, json: { tiles: ["https://planetarycomputer.microsoft.com/api/data/v1/item/tiles/{z}/{x}/{y}?item=test"], maxzoom: 16 } }));
    await page.route("**/api/data/v1/item/tiles/**", (route) => route.fulfill({ headers: cors, contentType: "image/png", body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/aX0AAAAASUVORK5CYII=", "base64") }));
    await page.goto(url + "#pt=13.0800,80.2600", { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.locator("#fpcAsk").waitFor({ state: "visible", timeout: 60000 });
    for (const width of [1440, 1024]) {
      await page.setViewportSize({ width, height: 900 });
      const layout = await page.evaluate(() => ({ top: document.querySelector(".topbar").getBoundingClientRect().bottom, detail: document.querySelector(".detail").getBoundingClientRect().top }));
      assert.ok(layout.top < layout.detail, `the toolbar must not cover detail controls at ${width}px`);
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    const detail = await page.locator("#detailBody").innerText();
    assert.match(detail, /CHENNAI, TAMIL NADU/i);
    assert.match(detail, /Official Tamil Nadu land records/i);
    assert.match(detail, /does not send the selected location or match it to a survey number/i);
    assert.equal(await page.locator('#detailBody a[href="https://tngis.tn.gov.in/apps/gi_viewer/"]').count(), 1);
    assert.equal(await page.locator('#detailBody a[href="https://eservices.tn.gov.in/eservicesnew/index.html"]').count(), 1);
    assert.match(detail, /market references? \| \d+ guideline proxies/i);
    assert.match(detail, /no validated plot-level error range/i);
    assert.doesNotMatch(detail, /fair range|overpriced|80% band/i);
    assert.match(detail, /Nearby price evidence/i);
    assert.match(await page.locator('[data-evidence-group="asking"]').innerText(), /asking/i);
    assert.match(await page.locator('[data-evidence-group="official"]').innerText(), /official rates/i);
    assert.ok(await page.locator('[data-evidence-group="asking"] a[href^="http"]').count() > 0, "asking references expose their sources");

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
    await page.locator("#btnPast").click();
    await page.waitForFunction(() => /Past scene: 14 Nov 2012/.test(document.querySelector("#imageryStatus").textContent), null, { timeout: 20000 });
    assert.match(await page.locator("#imageryStatus").innerText(), /Landsat 7; stripe gaps possible.*30 m/i);
    assert.equal(await page.evaluate(() => BhoomiLens.map.getLayoutProperty("sat", "visibility")), "none", "a 2025 mosaic must not appear behind the 2012 image");
    assert.equal(await page.evaluate(() => !!BhoomiLens.map.getLayer("sat-empty")), true, "past-image gaps should be neutral");
    await page.selectOption("#imageYear", "2011");
    await page.waitForFunction(() => /No scene.*2011.*Grey means no past image/i.test(document.querySelector("#imageryStatus").textContent), null, { timeout: 20000 });
    assert.equal(await page.evaluate(() => !!BhoomiLens.map.getSource("sat-recent")), false, "a missing past scene must not show another image");
    assert.equal(await page.evaluate(() => BhoomiLens.map.getLayoutProperty("sat", "visibility")), "none");
    await page.locator("#btnRecent").click();
    await page.waitForFunction((label) => document.querySelector("#imageryStatus").textContent.includes("Recent scene at map center: " + label), observedLabel, { timeout: 20000 });
    assert.equal(await page.evaluate(() => !!BhoomiLens.map.getLayer("sat-empty")), false);
    assert.equal(await page.evaluate(() => BhoomiLens.map.getLayoutProperty("sat", "visibility")), "visible");
    await page.locator("#btnSat").click();
    assert.equal(await page.locator("#btnRecent").getAttribute("aria-pressed"), "false");
    assert.equal(await page.evaluate(() => !!BhoomiLens.map.getSource("sat-recent")), false);

    await page.locator("#searchBtn").click();
    assert.match(await page.locator('#palette').innerText(), /Survey-number matches here are limited to recorded acquisition notices/i);
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
    assert.match(await page.locator("#gapOut").innerText(), /this plot's guideline rate/i);
    await page.locator("#gapGuideline").fill("1200");
    await page.locator('[data-ins="gap"]').click();
    const duty = await page.locator("#gapOut").innerText();
    assert.match(duty, /Illustration using the higher of the two rates you entered/i);
    assert.match(duty, /84,000/);
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
    await page.evaluate(() => { window.BL_UPDATES.coverage = { news_ok: 8, news_attempted: 10, sources_ok: 3, sources_attempted: 5 }; });
    await page.locator('#rail [data-tool="data"]').click();
    assert.match(await page.locator("#panelBody").innerText(), /Market-related references/i);
    assert.match(await page.locator("#panelBody").innerText(), /not independent completed sales/i);
    assert.match(await page.locator("#panelBody").innerText(), /Acquisition-compensation references/i);
    assert.match(await page.locator("#panelBody").innerText(), /excluded from direct price calibration/i);
    assert.match(await page.locator("#panelBody").innerText(), /without HTTPS certificate verification/i);
    assert.match(await page.locator("#panelBody").innerText(), /8 of 10 news searches and 3 of 5 source pages succeeded/i);
    assert.match(await page.locator("#panelBody").innerText(), /Consumer price index/i);
    assert.match(await page.locator("#panelBody").innerText(), /Consumer inflation is not a land-price trend/i);
    assert.match(await page.locator("#panelBody").innerText(), /Tamil Nadu.*2026-/i);
    await page.selectOption('#tnCpiArea', 'Chennai');
    assert.match(await page.locator('#tnDistrictCpiCurrent').innerText(), /2026-05.*127\.4/s);
    assert.match(await page.locator('#panelBody').innerText(), /household prices, not land prices/i);
    assert.equal(await page.locator('#tnCpiArea option[value="Chengalpattu"]').count(), 0, 'unpublished district boundaries must not be guessed');
    await page.locator('#rail [data-tool="housing"]').click();
    assert.match(await page.locator('#panelBody').innerText(), /not vacant-land sale prices/i);
    assert.match(await page.locator('#panelBody').innerText(), /withdrawn while NHB's publication-specific reuse terms are clarified/i);
    assert.equal(await page.locator('#panelBody a[href="https://residex.nhbonline.org.in/"]').count(), 1);
    await page.evaluate(() => { window.BL_PIB_LEADS = { last_change: '2026-11-13', leads: [{ title: 'Pune Metro project approved', published: '2026-11-03', url: 'https://www.pib.gov.in/PressReleseDetail.aspx?PRID=10' }] }; });
    await page.locator('#rail [data-tool="catalysts"]').click();
    await page.getByText(/Recently discovered PIB leads/).click();
    assert.match(await page.locator('#panelBody').innerText(), /Unreviewed keyword matches/i);
    assert.match(await page.locator('#panelBody').innerText(), /Pune Metro project approved/i);
    await page.getByText(/Official project timelines/).click();
    await page.getByText('Chennai Port–Maduravoyal corridor · Tamil Nadu').click();
    assert.match(await page.locator('#panelBody').innerText(), /Published 2015-03-09 · event 2012-03-29/);
    assert.match(await page.locator('#panelBody').innerText(), /not complete project histories or live status/i);
    await page.locator('#rail [data-tool="draw"]').click();
    assert.match(await page.locator('#panelBody').innerText(), /not official survey boundaries or proof of ownership/i);
    await page.locator('[data-act="quick-area"]').first().click();
    await page.getByText(/sampled cells inside mapped districts/).waitFor({ timeout: 30000 });
    const area = await page.evaluate(() => ({ n: BhoomiLens.S.area.n, sampled: BhoomiLens.S.area.sampled }));
    assert.ok(area.n > 0 && area.n <= area.sampled);
    const areaBeforeSimulation = await page.evaluate(() => BhoomiLens.S.area.cells.map((c) => c.mult));
    const areaDownloadPromise = page.waitForEvent('download');
    await page.locator('[data-act="area-csv"]').click();
    const areaDownload = await areaDownloadPromise;
    const areaCSV = (await fs.readFile(await areaDownload.path())).toString();
    assert.match(areaCSV.split('\n')[0], /model_price_inr_sqft.*validation_status/);
    assert.match(areaCSV, /unvalidated heuristic/);
    await page.locator('#rail [data-tool="simulate"]').click();
    await page.locator("#simEffect").evaluate((el) => { el.value = "-30"; el.dispatchEvent(new Event("input", { bubbles: true })); });
    await page.locator("#simProbability").evaluate((el) => { el.value = "75"; el.dispatchEvent(new Event("input", { bubbles: true })); });
    await page.locator('[data-act="sim-place"]').click();
    await page.mouse.click(720, 450);
    await page.waitForFunction(() => BhoomiLens.S.userCats.length === 1, null, { timeout: 15000 });
    const simulation = await page.evaluate(() => ({ cat: BhoomiLens.S.userCats[0], hasDecrease: BhoomiLens.models.some((m) => m.delta < -0.002) }));
    assert.equal(simulation.cat.assumedEffect, -0.3);
    assert.equal(simulation.cat.assumedProbability, 0.75);
    assert.equal(simulation.hasDecrease, true);
    const areaAfterSimulation = await page.evaluate(() => ({
      multipliers: BhoomiLens.S.area.cells.map((c) => c.mult),
      cellGrowth: BhoomiLens.S.area.cells[0].cagr,
      mappedGrowth: BhoomiLens.map.getSource('cells').serialize().data.features[0].properties.g
    }));
    assert.ok(areaAfterSimulation.multipliers.some((v, i) => Math.abs(v - areaBeforeSimulation[i]) > 1e-9), 'area results refresh after a simulated project is added');
    assert.equal(areaAfterSimulation.cellGrowth, areaAfterSimulation.mappedGrowth, 'map cells match refreshed area results');
    assert.equal(await page.evaluate(() => BhoomiLens.map.getPaintProperty("d-fill", "fill-opacity")[0]), "interpolate", "opacity stays a zoom-and-feature expression when switching lenses");
    assert.match(await page.locator("#panelBody").innerText(), /not measured project effects or validated probabilities/i);
    await page.locator('#panelBody [data-act="sim-remove"]').first().click();
    let restoredArea = await page.evaluate(() => BhoomiLens.S.area.cells.map((c) => c.mult));
    assert.ok(restoredArea.every((v, i) => Math.abs(v - areaBeforeSimulation[i]) < 1e-9), 'area results refresh when a simulation is removed');
    await page.locator('[data-act="sim-place"]').click();
    await page.mouse.click(720, 450);
    await page.waitForFunction(() => BhoomiLens.S.userCats.length === 1, null, { timeout: 15000 });
    await page.locator('[data-act="sim-clear"]').click();
    restoredArea = await page.evaluate(() => BhoomiLens.S.area.cells.map((c) => c.mult));
    assert.ok(restoredArea.every((v, i) => Math.abs(v - areaBeforeSimulation[i]) < 1e-9), 'area results refresh when simulations are cleared');
    await page.locator('#rail [data-tool="screener"]').click();
    const districtDownloadPromise = page.waitForEvent('download');
    await page.locator('[data-act="csv"]').click();
    const districtDownload = await districtDownloadPromise;
    const districtCSV = (await fs.readFile(await districtDownload.path())).toString();
    assert.match(districtCSV.split('\n')[0], /model_price_inr_sqft.*model_circle_rate_inr_sqft.*validation_status/);
    assert.match(districtCSV, /unvalidated heuristic/);
    await page.locator('#rail [data-tool="explore"]').click();
    await page.locator('#panelBody [data-act="open-d"]').first().click();
    const districtDetail = await page.locator('#detailBody').innerText();
    assert.match(districtDetail, /Modelled market price/i);
    assert.match(districtDetail, /Modelled circle-rate input/i);
    assert.match(districtDetail, /not a verified difference between actual rates/i);
    assert.doesNotMatch(districtDetail, /Circle rate is \d+% below market/i);
    await page.goto(url + '?case=compensation#pt=12.9500,79.7900', { waitUntil: 'domcontentloaded', timeout: 90000 });
    const compensation = page.locator('#detailBody [data-evidence-group="compensation"]');
    await compensation.waitFor({ state: 'attached', timeout: 60000 });
    await compensation.locator('summary').click();
    await compensation.locator('button[data-act="verified"]').first().click();
    const compensationPopup = await page.locator('.maplibregl-popup-content').last().innerText();
    assert.match(compensationPopup, /acquisition compensation/i);
    assert.match(compensationPopup, /excluded from direct calibration/i);
    const compensationReportPromise = page.waitForEvent('popup');
    await page.locator('[data-ins="report"]').click();
    const compensationReport = await compensationReportPromise;
    await compensationReport.waitForLoadState('domcontentloaded');
    const modelInputs = await compensationReport.getByRole('heading', { name: /Nearby model inputs/ }).locator('xpath=following-sibling::table[1]').innerText();
    const contextInputs = await compensationReport.getByRole('heading', { name: /Nearby context excluded/ }).locator('xpath=following-sibling::table[1]').innerText();
    assert.doesNotMatch(modelInputs, /compensation/i);
    assert.match(contextInputs, /compensation/i);
    await compensationReport.close();
    await page.goto(url + '?case=tn-history#pt=10.84047,79.55297', { waitUntil: 'domcontentloaded', timeout: 90000 });
    const history = page.locator('#detailBody [data-tn-history]').first();
    await history.waitFor({ state: 'visible', timeout: 60000 });
    const historyText = await history.innerText();
    assert.match(historyText, /Semmangudi/i);
    assert.match(historyText, /2017\s+₹17/);
    assert.match(historyText, /2012\s+₹25/);
    assert.match(historyText, /2002\s+Not recorded/i);
    assert.match(await page.locator('#detailBody').innerText(), /not market sales or estimates for the selected plot/i);
    await page.locator('#searchBtn').click();
    await page.locator('#paletteInput').fill('Semmangudi');
    await page.locator('#paletteList .p-item').filter({ hasText: 'TN rate' }).filter({ hasText: 'Semmangudi' }).first().click();
    assert.match(await page.locator('#detailBody [data-tn-history]').first().innerText(), /Semmangudi/i);
    await page.evaluate(() => localStorage.removeItem('bl_intro'));
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.locator('#introGo').waitFor({ state: 'visible', timeout: 60000 });
    const firstVisit = await page.locator('#intro').innerText();
    assert.match(firstVisit, /past values are not recorded sale histories/i);
    assert.doesNotMatch(firstVisit, /full investment read-out/i);
    await page.locator('#introGo').click();
    assert.equal(await page.locator('#intro').isVisible(), false);
    assert.deepEqual(errors, [], "uncaught browser errors");
    await page.close();

    const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
    mobile.on("pageerror", (error) => errors.push(error.stack || error.message));
    await mobile.route("**/api/stac/v1/search?**", (route) => route.fulfill({ headers: cors, json: { features: [{ id: "LE07_mobile", bbox: [80, 12, 81, 14], geometry: { type: "Polygon", coordinates: [[[80, 12], [81, 12], [81, 14], [80, 14], [80, 12]]] }, properties: { datetime: "2012-11-14T04:54:26Z", platform: "landsat-7", "eo:cloud_cover": 13 }, assets: { tilejson: { href: "https://planetarycomputer.microsoft.com/api/data/v1/item/tilejson.json?item=test" } } }] } }));
    await mobile.route("**/api/data/v1/item/tilejson.json?**", (route) => route.fulfill({ headers: cors, json: { tiles: ["https://planetarycomputer.microsoft.com/api/data/v1/item/tiles/{z}/{x}/{y}?item=test"], maxzoom: 16 } }));
    await mobile.route("**/api/data/v1/item/tiles/**", (route) => route.fulfill({ headers: cors, contentType: "image/png", body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/aX0AAAAASUVORK5CYII=", "base64") }));
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
    await mobile.locator("#btnInfra").click();
    await mobile.evaluate(() => BhoomiLens.map.jumpTo({ center: [80.26, 13.08], zoom: 9 }));
    await mobile.locator("#btnPast").scrollIntoViewIfNeeded();
    await mobile.locator("#btnPast").click();
    await mobile.waitForFunction(() => /Past scene: 14 Nov 2012/.test(document.querySelector("#imageryStatus").textContent), null, { timeout: 20000 });
    assert.equal(await mobile.locator("#btnPast").getAttribute("aria-pressed"), "true");
    assert.deepEqual(errors, [], "uncaught browser errors");
    await mobile.close();
    console.log("Browser checks passed: past and recent imagery, local and online search, shared location, evidence, comparison, backup, report, alerts, area analysis and mobile layout.");
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => server.close());
