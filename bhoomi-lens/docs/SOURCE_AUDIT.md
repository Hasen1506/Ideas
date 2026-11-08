# Source and validation audit — 8 November 2026

## What a professional release needs

The underlying task is to help someone evaluate a place using evidence with known dates, geography, land use and uncertainty. A map, a model and a scraper cannot establish title, a parcel's value or a project's causal effect. The product should distinguish observed facts, reference rates, estimates and scenarios, and decline to imply precision where no independent test exists.

Start from the least-processed materials available: original, lawfully obtained sale records or licensed transaction feeds; dated listings with explicit permission and source identifiers; original state guideline-rate registers; project announcements, changes and route geometries; and dated satellite scenes. Keep source rights, observation date, collection date, land class, units, coordinates and geographic precision with every record. Do not replace missing information with certainty.

Use auditable normalization, source and property deduplication, geographically and temporally separated holdouts, simple baselines, error and interval-coverage reporting, and independently reviewed sample joins. A proper project-effect study additionally needs pre-project trends, comparable controls, sufficient independent projects and a check for spillovers. A model explanation describes the model, not causation. The app's current heuristic outputs do not pass a professional valuation or forecast release gate.

## Satellite and water

- The earlier basemap was EOX's **2024** Sentinel-2 cloudless mosaic. [EOX's current public catalog](https://maps.eox.at/) includes a 2025 mosaic; its imagery is a composite, not a single observation on one date.
- The new recent-scene option queries [Microsoft Planetary Computer's Sentinel-2 Level-2A catalog](https://planetarycomputer.microsoft.com/dataset/sentinel-2-l2a) at the map center. It selects the newest scene from the last year with reported scene-wide cloud cover below 30%, shows the actual acquisition date and lets the user inspect its metadata. A scene can still be cloudy over the chosen spot. The 2025 mosaic remains underneath outside its footprint; failures fall back to it. The public service is a third-party dependency, not an uptime guarantee.
- The past-scene option searches the selected year for a Sentinel-2 image from 2017 onward or a [Landsat Collection 2 Level-2](https://planetarycomputer.microsoft.com/dataset/landsat-c2-l2) image from 1984 onward. It reports the scene date, sensor, scene-wide cloud and 10 m or 30 m resolution. Grey areas have no image and are not filled with a later mosaic. Landsat 7 scenes from May 2003 can have [scan-line gaps](https://www.usgs.gov/landsat-missions/landsat-7-maneuvers). Differences in season, clouds and sensor do not by themselves establish land-use change or its cause.
- Sentinel-2's 10 m pixels do not establish plot boundaries or title. The model's time slider does not change satellite imagery. For consistent seasonal change analysis rather than visual browsing, assess [Copernicus quarterly cloudless mosaics](https://dataspace.copernicus.eu/news/2026-3-16-clear-skies-zero-clouds-weve-processed-full-sentinel-archive-seamless-monthly-s1-and); access and processing need an appropriate service account and operational setup.
- The old water layer claimed coverage through 2024 while loading the 2021 tiles. It now loads [Global Surface Water v1.5, 1984–2024](https://global-surface-water.appspot.com/download), with its required EC JRC/Google attribution. Its 30 m record can miss small or short-lived water and does not prove flood safety or current conditions.
- Search uses the app's local index as the user types. An explicit online search can query [Photon's OpenStreetMap-based demo service](https://github.com/komoot/photon); it is cached per session and has no availability guarantee. The prior implementation sent autocomplete requests to the public Nominatim API, which [prohibits that use](https://operations.osmfoundation.org/policies/nominatim/). A production service at scale needs a suitable hosted or self-managed geocoder.

## Market references

In the current expanded reference data, 837 priced rows are market-related references and 2,379 are guideline-derived proxies. A quick source inventory found 302 market-reference rows with at least one Magicbricks URL and 85 supported only by Magicbricks URLs. Across market-reference rows, 153 exact source URLs appear in more than one row; shared URLs and syndicated advertisements mean source count alone does not prove independent evidence. These figures are a snapshot, not a deduplicated transaction census.

Listings are asking prices, not completed sale prices; repeat advertisements and differences in land type, plot size, access, location accuracy and condition can distort a median. The present 10% asking-to-sale adjustment is an assumption, not an independently estimated discount. Government allotment prices, acquisition compensation, reserve prices, guideline values and closed sales must also remain separate.

[Magicbricks' published terms](https://www.magicbricks.com/mbutility/terms.html) restrict use and reuse of other users' data and listings without the necessary authorization. Whether a particular existing dataset is licensed cannot be established from the repository. Obtain permission or a suitable licensed feed before further collection or redistribution; robots.txt alone is not a license. Do not add an automated scraper for this source as a substitute for rights or access.

The strongest next source is a properly permitted, dated and de-identified transaction panel for a small pilot area, supplemented by independently sourced market observations and official rates as separate inputs. Even registered values can have reporting and selection bias; validate units, land class and comparability. RERA registrations and project documents may help identify activity but should not be treated as confirmed sale prices unless they actually report them. See [FORECASTING_ROADMAP.md](FORECASTING_ROADMAP.md) for the collection and release gates.

## Tamil Nadu collection integrity

The historical guideline collector previously used public proxies with HTTPS certificate verification disabled. That means the existing records were not protected against modification by an intermediary in transit; their integrity cannot be established solely from the collector. Independently check a sample against the official portal before relying on them. The collector now verifies TLS certificates and rejects responses when verification fails; access through some proxies may consequently stop working.

The historical backfill has five village-and-revision entries parked after repeated failures. They remain incomplete, not collected: the progress report distinguishes fully collected data from work where automatic retries have stopped. The current app history is a separately built, fuzzy-matched snapshot; it does not update automatically as the raw backfill changes.

## Project updates

The weekly re-check finds news leads and page changes for human review; it does not verify a project status or change the model automatically. New runs record the number of successful news and source-page requests. If every news request fails, the job fails and retains the previous snapshot rather than presenting an unsuccessful check as a fresh one. A successful request or absence of a headline does not establish that there has been no project change.

The 71 selected historical project/price cases include repeated cases for the same project and a mixture of raw changes, stated benchmarks and cases with no benchmark recorded. They cannot be pooled as independent, city-relative premiums. Some informed model adjustments, and a subset has no model result recorded; use the source and benchmark on each case when reviewing it.

## Independent checks

Automated model invariants, source-unit checks and browser tests catch software errors; they do not prove forecasts are correct. Before presenting a validated market forecast, hold out later periods and whole geographic blocks, group duplicate or related sources, compare with simple local baselines, and report error and interval coverage by area and land class. Independently review a sample of source transcriptions and village matches. Make stale, sparse and unmatched cases visible rather than extrapolating silently.

On 8 November 2026, the internal leave-one-out diagnostic on a subset of 431 non-derived market-reference rows reported a median multiplicative error factor of about 1.55 before removing artificial coordinate-label variation, and 1.53 afterwards. This is a fit check against reference points, not a future-period or geographically independent test; correlated listings can make it optimistic, and it does not establish the error for an individual plot.
