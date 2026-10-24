# Bhoomi Lens

**Land intelligence for India.** See what land is worth, what will move it, and what could go wrong, for every district in the country.

Bhoomi Lens is a fully client-side web app. It needs no build step, no API keys and no backend. Open `index.html` and it runs.

## Run it

- **Locally:** double-click `bhoomi-lens/index.html`, or serve the folder with `npx serve bhoomi-lens` or `python3 -m http.server -d bhoomi-lens`.
- **Online:** in the repo, open **Settings > Pages**, set **Source** to **Deploy from a branch**, and choose `main` and `/ (root)`. The app is then live at `https://hasen1506.github.io/Ideas/bhoomi-lens/`.

## What it does

| Feature | What you get |
|---|---|
| **Seven lenses** | Price, Growth, Opportunity, Risk, Liquidity, Circle-rate gap and Simulation impact, across 820 districts |
| **District intelligence card** | Market price per sq ft and per acre, circle rate and gap, forecast multiple with an 80% band, a 2015 to 2036 price path, forecast drivers, a risk radar, a historical "looks like" match and projects in range |
| **Draw an area** | Lasso, radius or box tool. Samples the area on a fine grid and runs the model on every cell: price distribution, hottest cells, best value for growth, catalysts inside and nearby, districts covered, an investment calculator and CSV export |
| **Ripple simulator** | Drop a hypothetical airport, metro, expressway, port, industrial node, new city or ring road. Every district is re-priced, weighted by the chance the project actually gets built. Shows the most affected districts and an indicative land value created |
| **Catalyst tracker** | 40+ real projects with stage, completion probability, scenario-adjusted delivery date and agency credibility. Influence zones are drawn on the map |
| **Time machine** | Scrub or play from 2015 to 2036 and watch growth spread along corridors |
| **Scenarios** | Bear, base and bull cases with 3, 5 and 10-year horizons. The bear case adds delays based on each agency's track record |
| **Screener** | Filter by state, risk and price. Rank by opportunity, growth, price, risk, circle gap or liquidity. Export all districts to CSV |
| **Watchlist and signals** | Star districts to get signals for upcoming openings, credibility flags, circle-rate revision exposure and thin markets |
| **Compare** | Up to three districts side by side, plus a price-index chart |
| **Reports** | A one-click printable PDF report for any district |
| **Hotspots, satellite, 3D** | A heat layer of unrealised infrastructure upside, Esri satellite imagery, and 3D price terrain |
| **Shareable state** | The URL hash records the lens, year, scenario, horizon and selected district |

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
2. **Catalyst uplift.** For each project: maximum uplift for its type x distance decay x completion probability x share already priced in. About 30% is priced on announcement, about 65% by completion, and the rest over the following years.
3. **Completion probability.** Based on the project's stage (announced, approved, land acquisition, under construction, operational) and the agency's delivery credibility.
4. **Forecast band.** Widens with time and with the share of value that depends on unfinished projects.
5. **Risk.** Flood, heat, groundwater stress, title and records quality, and limits on who can buy agricultural land.
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

Built with MapLibre GL JS, CARTO dark basemaps, Esri World Imagery and district boundaries from datta07/INDIAN-SHAPEFILES.

## Disclaimer

All figures are modelled, indicative estimates built from public reference points. They are not registered transaction data and are not investment, legal or valuation advice. Project statuses are a snapshot. Verify title, zoning, encumbrances and project status independently before transacting.
