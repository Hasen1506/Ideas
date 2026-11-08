# Forecasting roadmap

## Product boundary today

Bhoomi Lens is useful as an exploratory map and a source-discovery tool. Its price surface, infrastructure effects, risk and liquidity scores are heuristic, and its current bands have no measured coverage. A nearby listing, a government guideline rate, a guideline-derived market proxy and a registered sale are different kinds of evidence. Show their type, date, location precision and source separately. Do not present an inferred project effect as causal or a location estimate as a plot valuation.

The 8 November 2026 project report is a useful negative result: on Tamil Nadu official-rate growth, LightGBM's reported median error was 9.9% versus 1.2% for a district-median baseline. The official rates were frequently changed by common government revisions. That experiment does not validate or invalidate market-price effects. Keep the official history for reference and audit; do not train a market-uplift model on it as if it were sales data.

An inventory of the checked-out app data on 8 November found 837 priced market-related reference rows and 2,379 priced guideline-derived proxies. The former include 330 listing/quoted-price rows and 265 cross-checked listing aggregates, as well as auctions, allotments and reported deals; they are not 837 independent sales. Of those 837 rows, 569 have a 2026 date, 188 a 2025 date and 40 no parseable year. Only 23 exact state-and-location names appear with more than one dated year. These dates can be collection dates rather than transaction dates, and repeated names do not establish comparable parcels. This simple inventory uses the app's expanded reference rows and is not a deduplicated longitudinal dataset; it explains why the next task is obtaining and matching market histories, not just fitting a more complex model. Re-run it from `bhoomi-lens/` with `npm run audit:evidence` as data changes.

The existing research also includes 2,127 Tamil Nadu RERA project rows, 71 reported investment rows and 71 selected historical project/price cases covering 41 project names. It is useful source material, but the cases include 22 raw changes, 26 without a recorded benchmark and 23 with a stated benchmark; repeated projects and sources are not independent observations. Re-run this inventory with `npm run audit:projects`. See [Tamil Nadu data operations](TAMIL_NADU_DATA_OPERATIONS.md) for the current source checks and collection sequence, and [the Maharashtra pilot](MAHARASHTRA_PILOT.md) for the next-state source check.

## First milestone: a trustworthy pilot

1. Choose a small number of pilot districts and one land class, such as residential plots. Specify the unit, valuation date and forecast horizon before collecting data. Do not mix agricultural, commercial and residential rates as if they were interchangeable.
2. Assemble a dated market-side panel from lawfully available registered transactions, credible reported transactions, and repeated listings where permitted. Record whether each observation is a completed sale, asking price or other proxy, plus source URL, collection date, transaction or listing date, geography and precision, plot size, land class and data rights. Keep the raw input and every transformation versioned. Do not call a discounted listing a sale.
3. Join to administrative geography using stable codes where available, then match within the correct district and taluk. Queue ambiguous Tamil/English names, duplicate points, changed boundaries and outliers for review. Measure match quality on a manually checked sample, including rejected matches. Avoid silently treating a fuzzy match as a surveyed location.
4. Build dated features using only information available at each forecast origin. Keep the project announcement, stage, route, cancellation and data publication histories as snapshots. Satellite data and official rates can be features, with their observation dates and coverage recorded. A single current market-to-guideline ratio cannot by itself establish historical market growth.

## Second milestone: validate before replacing the formula

1. Compare the existing formula with simple last-observation and district/land-class growth baselines. Use rolling time holdouts and held-out geographic blocks, including a final untouched test period. Prevent nearby duplicates and repeated listings from appearing on both sides of a split.
2. Report sample size, median and tail error, direction relative to a local baseline, and errors by district, land class and evidence density. Measure interval coverage **and width** on held-out future data, including sparse areas. Publish the evaluation period and known gaps; abstain or mark estimates as insufficient evidence where the model is unsupported.
3. Only try a more complex model when a simple baseline is hard to beat. If it wins consistently, calibrate prediction intervals on held-out data and monitor whether coverage persists. Feature attribution can explain a model's behavior; it does not prove a project caused a price change.
4. For project effects, define treated and comparison areas and the announcement or opening date in advance. Check pre-project trends, overlapping projects, spillovers, changes in property mix and the number of independent projects. Report uncertainty clustered at an appropriate project or geographic level. Where comparisons are too thin or assumptions fail, show the evidence and refrain from a causal uplift number.

## Delivery and operations

- Add automated checks for source freshness, units, duplicates, coordinate bounds, match rates and failed collection jobs. Review source changes and project status leads before treating them as facts.
- Version data, assumptions, model and evaluation results together. Display the relevant dates in the app. Retrain only when new suitable data and a reproducible evaluation justify it; a weekly collector does not make the model weekly validated.
- Keep deployment reproducible, run browser checks in CI, and verify the public URL after each release. GitHub Actions republishes after successful automated data workflows because commits made with the default automation token do not trigger a branch-based Pages build. The Tamil Nadu collector saves raw records; its fuzzy-matched history output is a separate, reviewable build and is not regenerated automatically.
- If accounts are enabled, configure the backend and verify per-user access controls and recovery. Until then, clearly describe saved items as device-only.

## Release gate for a market forecast

Ship a numerical forecast as an empirically supported product only after independent time and region tests beat the baselines for the intended land class, the prediction range has measured held-out coverage with adequate sample sizes, data provenance and geography pass review, and failure or low-coverage cases are visible to users. Set numerical thresholds with the product owner before selecting a model, and publish the results alongside the forecast.
