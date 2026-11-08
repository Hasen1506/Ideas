# Bhoomi Lens

**Land intelligence for India.** Explore indicative land-price estimates, infrastructure scenarios and public reference data.

Bhoomi Lens is a client-side prototype with no build step or required API keys. Serve the folder over HTTP; the map and basemaps depend on external services and an internet connection. Accounts and cross-device sync require a separately configured backend; without one, saved items stay on the device.

The price surface, project effects, risk and liquidity scores are heuristic estimates. The displayed forecast bands are illustrative assumptions, not validated 80% intervals. Market references include listings and reported deals; Tamil Nadu guideline-derived proxies are not observed sale prices. These estimates do not value a particular plot. See [the source audit](docs/SOURCE_AUDIT.md) and [forecasting roadmap](docs/FORECASTING_ROADMAP.md) for provenance, rights, and the evidence needed before treating forecasts as reliable.

## Run it

- **Locally:** run `python3 -m http.server 8000 --directory bhoomi-lens` from the repo root, then open `http://localhost:8000/`.
- **Online:** in the repo, open **Settings > Pages**, set **Source** to **Deploy from a branch**, and choose `main` and `/ (root)`. The app is then live at `https://hasen1506.github.io/Ideas/bhoomi-lens/`.

## What it does

| Feature | What you get |
|---|---|
| **Seven lenses** | Price, Growth, Opportunity, Risk, Liquidity, Circle-rate gap and Simulation impact, across 820 districts |
| **District intelligence card** | Estimated price per sq ft and per acre, modelled circle rate and gap, forecast multiple with an illustrative unvalidated band, a 2015 to 2036 modelled price path, drivers, heuristic risk scores and nearby projects |
| **Draw an area** | Lasso, radius or box tool. Samples the area on a fine grid and runs the model on every cell: price distribution, hottest cells, best value for growth, catalysts inside and nearby, districts covered, an investment calculator and CSV export |
| **Ripple simulator** | Add a hypothetical airport, metro, expressway, port, industrial node, new city or ring road and compare modelled district effects, weighted by an assumed completion probability |
| **Catalyst tracker** | 40+ real projects with stage, completion probability, scenario-adjusted delivery date and agency credibility. Influence zones are drawn on the map |
| **Time machine** | Scrub or play from 2015 to 2036 and watch growth spread along corridors |
| **Scenarios** | Bear, base and bull cases with 3, 5 and 10-year horizons. The bear case adds delays based on each agency's track record |
| **Screener** | Filter by state, risk and price. Rank by opportunity, growth, price, risk, circle gap or liquidity. Export all districts to CSV |
| **Watchlist and signals** | Star districts to get signals for upcoming openings, credibility flags, circle-rate revision exposure and thin markets |
| **Compare** | Up to three districts side by side, plus a price-index chart |
| **Reports** | A one-click printable PDF report for any district |
| **Hotspots, satellite, 3D** | A heat layer of modelled infrastructure upside; a 2025 Sentinel-2 cloudless mosaic with an optional recent dated Sentinel-2 scene at the map center; and modelled 3D price terrain |
| **Shareable state** | The URL hash records the lens, year, scenario, horizon and selected district or location |
| **Saved data** | Save watchlists and spots in the browser, and export or import a private JSON backup. Cross-device account sync requires a separately configured backend. |

### Keyboard shortcuts

| Key | Action |
|---|---|
| `Ctrl K` or `/` | Search |
| `1` to `7` | Switch lens |
| `D` | Draw an area |
| `S` | Open the simulator |
| `C` | Open the catalyst tracker |
| `Space` | Play the time machine |
| `Enter` | Finish a lasso or route |
| `Backspace` | Undo the last lasso point |
| `Esc` | Close or cancel |

## The model (`js/engine.js`)

1. **Price today.** A rural agricultural baseline for each state, plus the urban pull of 48 city anchors. Each anchor's pull decays with distance and is diluted for large districts.
2. **Catalyst uplift.** For each project: assumed maximum uplift x distance decay x assumed completion probability x share already priced in. The current formula assumes 35% at announcement and 85% by completion. These are model assumptions, not causal estimates.
3. **Completion probability.** A heuristic based on project stage and agency credibility; it is not probability-calibrated.
4. **Forecast band.** An illustrative formula that widens with time and unfinished projects; its coverage has not been validated.
5. **Risk.** Heuristic indicators combine state assumptions, location and synthetic local variation. They are not plot-level flood, title, water or regulatory checks.
6. **Opportunity score.** A percentile rank of risk-adjusted growth, adjusted for circle-rate gap, liquidity, pipeline momentum and how expensive land already is.
7. **Looks like.** The nearest match among 14 historical Indian growth stories, such as Whitefield in 2003, Gachibowli in 2005, Devanahalli in 2008 and Nava Raipur in 2010.

## Plug in real data

Put registered transaction values (for example from state IGR portals) in `bhoomi-lens/data/overrides.js`:

```js
window.BL_OVERRIDES = {
  "Pune|Maharashtra": { price: 9800, circle: 5200 }
};
```

The forecast, risk and scoring engine then runs on your numbers, and the district is tagged "Your data".

## Project structure

```
bhoomi-lens/
  index.html         App shell
  css/app.css        Design system: dark glass UI, saffron-to-teal accents
  js/data.js         City anchors, state parameters, catalyst types, 40+ projects, analogues
  js/engine.js       Valuation, forecast, risk, opportunity, area and hotspot engine (pure JS, also runs in Node)
  js/charts.js       Dependency-free SVG charts: fan, lines, radar, gauge, bars, histogram
  js/app.js          Map, lenses, tools and panels
  data/districts.js  820 district boundaries, simplified
  data/states.js     State boundaries
  data/overrides.js  Your real data goes here
```

Built with MapLibre GL JS, OpenFreeMap, the [EOX Sentinel-2 cloudless 2025 mosaic](https://maps.eox.at/), [Microsoft Planetary Computer Sentinel-2 scenes](https://planetarycomputer.microsoft.com/dataset/sentinel-2-l2a), [Global Surface Water 1984–2024](https://global-surface-water.appspot.com/download) and district boundaries from datta07/INDIAN-SHAPEFILES. Recent imagery is a single scene selected for the map center with less than 30% cloud across the scene, not necessarily cloud-free at the selected plot. It is shown over the 2025 mosaic outside its footprint. Satellite imagery is 10 m resolution and is not suitable for identifying survey boundaries; the time slider changes the model, not the imagery. Availability depends on third-party services.

## Checks

From the repo root, run `node bhoomi-lens/tests/run.js` and `python3 bhoomi-lens/tests/test_tn_gv_history.py`. The latter checks published 2024 farm rates against the collected source records and tests acre/hectare conversions.

For browser checks, run `npm ci`, `npx playwright install chromium`, and `npm run test:browser` inside `bhoomi-lens/`. MapLibre is bundled locally; the browser checks still need internet access for the map. Set `CHROMIUM_PATH` to an existing Chromium executable if preferred. The GitHub Actions workflow runs the same checks for application changes.

## Disclaimer

All figures are modelled, indicative estimates built from public reference points. They are not registered transaction data and are not investment, legal or valuation advice. Project statuses are a snapshot. Verify title, zoning, encumbrances and project status independently before transacting.
