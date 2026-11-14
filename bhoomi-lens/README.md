# Bhoomi Lens

**Land intelligence for India.** Explore indicative land-price estimates, infrastructure scenarios and public reference data.

Bhoomi Lens is a client-side prototype with no build step or required API keys. Serve the folder over HTTP; the map and basemaps depend on external services and an internet connection. Accounts and cross-device sync require a separately configured backend; without one, saved items stay on the device.

The price surface, project effects, risk and liquidity scores are heuristic estimates. The displayed forecast bands are illustrative assumptions, not validated 80% intervals. Market references include listings and reported deals; Tamil Nadu guideline-derived proxies are not observed sale prices. These estimates do not value a particular plot. See [the source audit](docs/SOURCE_AUDIT.md), [Tamil Nadu data operations](docs/TAMIL_NADU_DATA_OPERATIONS.md), and [experimental market-model notes](docs/MARKET_MODEL.md) for provenance, rights, and the evidence needed before treating forecasts as reliable.

## Run it

- **Locally:** run `python3 -m http.server 8000 --directory bhoomi-lens` from the repo root, then open `http://localhost:8000/`.
- **Online:** `https://hasen1506.github.io/Ideas/bhoomi-lens/`. The Pages workflow deploys `main` and republishes after the relevant app-data workflows.

## What it does

| Feature | What you get |
|---|---|
| **Seven lenses** | Price, Growth, Opportunity, Risk, Liquidity, Circle-rate gap and Simulation impact, across 820 districts |
| **District intelligence card** | Estimated price per sq ft and per acre, modelled circle rate and gap, forecast multiple with an illustrative unvalidated band, a 2015 to 2036 modelled price path, drivers, heuristic risk scores and nearby projects |
| **Draw an area** | Lasso, radius or box tool. Reports approximate area and samples the unvalidated model at a bounded number of locations; small or narrow shapes may have only one interior sample. Crossed boundaries are rejected. Model-output distributions and rankings are hidden below 20 mapped samples, and are not transaction distributions or plot valuations. CSV export and nearby project context are available. |
| **Tamil Nadu land records** | Location cards and search link to the state's official survey/patta viewer and land-record services. Parcel matching and government account access happen on those sites; drawn areas here are not cadastral boundaries. |
| **Ripple simulator** | Add a hypothetical airport, metro, expressway, port, industrial node, new city or ring road and compare modelled district effects, weighted by an assumed completion probability |
| **Catalyst tracker** | 40+ real projects with stage, completion probability, scenario-adjusted delivery date and agency credibility. Influence zones are drawn on the map |
| **Time machine** | Scrub or play from 2015 to 2036 and watch growth spread along corridors |
| **Housing index sources** | Links to the National Housing Bank's official housing indices. The prior copied archive has been withdrawn while publication-specific reuse terms are clarified. Housing indices are not vacant-land prices. |
| **Official project timelines** | Selected source-linked Press Information Bureau project reports in Tamil Nadu and Maharashtra; event dates and publication dates are shown separately. A manually collected snapshot also surfaces unreviewed headline leads. Neither is live project status or evidence of causal price effects. |
| **Scenarios** | Bear, base and bull cases with 3, 5 and 10-year horizons. The bear case adds delays based on each agency's track record |
| **Screener** | Filter by state, risk and price. Rank by opportunity, growth, price, risk, circle gap or liquidity. Export all districts to CSV |
| **Watchlist and signals** | Star districts to get signals for upcoming openings, credibility flags, circle-rate revision exposure and thin markets |
| **Compare** | Up to three districts side by side, plus a price-index chart |
| **Reports** | A one-click printable PDF report for any district |
| **Hotspots, satellite, 3D** | A heat layer of modelled infrastructure upside; a 2025 cloudless mosaic and dated past/recent satellite scenes at the map center; and modelled 3D price terrain |
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

## Working with real data

The experimental registered-sale model accepts an independently checked, de-identified, rights-cleared CSV from a private path outside this public repository. It evaluates future and held-out district errors against a baseline before any possible app integration. See [the input contract and limits](docs/MARKET_MODEL.md). No real Tamil Nadu sales model has yet been trained from this repository.

The [housing-index source note](docs/NHB_HOUSING_INDEX.md) explains the publication-specific reuse issue. No copied NHB historical series is used to train or calibrate land prices.

`data/overrides.js` can demonstrate public, non-sensitive district-level inputs; its values feed the existing heuristic model and are not automatically validated. Do not put private sale documents, party names, credentials or restricted records in the public app or repository.

District and drawn-area CSV exports label calculated fields with `model_` and include the scenario, horizon, model base year and `unvalidated heuristic` status. The renamed headers distinguish these outputs from observed sales or official circle rates; existing scripts that consumed the old export headers need updating.

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

Built with MapLibre GL JS, OpenFreeMap, the [EOX Sentinel-2 cloudless 2025 mosaic](https://maps.eox.at/), [Sentinel-2](https://planetarycomputer.microsoft.com/dataset/sentinel-2-l2a) and [Landsat](https://planetarycomputer.microsoft.com/dataset/landsat-c2-l2) scenes from Microsoft Planetary Computer, [Global Surface Water 1984–2024](https://global-surface-water.appspot.com/download) and district boundaries from datta07/INDIAN-SHAPEFILES. Select **Past scene** and a year, then switch to **Recent scene** to compare. A past scene uses Sentinel-2 where available from 2017, falling back to Landsat, and Landsat for earlier years back to 1984. Each is one dated observation selected for the map center with less than 30% scene-wide cloud, not necessarily cloud-free at the selected plot. Past-scene gaps are grey, never filled with a newer image; Landsat 7 scenes from 2003 onward can have stripe gaps. Recent imagery is shown over the 2025 mosaic outside its footprint. Resolution is 10 m for Sentinel-2 and 30 m for Landsat; neither establishes survey boundaries. Season, cloud, resolution and sensor changes can affect visual comparisons. The model's time slider does not change imagery, and availability depends on third-party services.

## Checks

From `bhoomi-lens/`, run `npm ci` and `npm test`. This checks model invariants, CSV safety, imagery selection, farm-rate units, collector integrity and weekly update failures.

For browser checks, run `npm ci`, `npx playwright install chromium`, and `npm run test:browser` inside `bhoomi-lens/`. MapLibre is bundled locally; the browser checks still need internet access for the map. Set `CHROMIUM_PATH` to an existing Chromium executable if preferred. The GitHub Actions workflow runs the same checks for application changes.

## Disclaimer

Price estimates and scenario figures are modelled from public reference points; they are not registered transaction data or investment, legal or valuation advice. NHB housing indices are not land prices. Project statuses are a snapshot. Verify title, zoning, encumbrances and project status independently before transacting.
