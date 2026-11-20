# Tamil Nadu Residential Plot Pilot — Architecture, Epistemic Audit & Validation Plan

**Status:** Active research pilot (`version: 2026-11-pilot-v1`)  
**Scope:** Residential plots in three Greater Chennai growth-corridor districts — **Chengalpattu**, **Kancheepuram**, and **Tiruvallur**.  
**Core User Decision:** *"I have a broker or listing quote for a residential plot in a Tamil Nadu growth corridor. How does this asking price sit against the official street-level statutory guideline floor, separated nearby public clearing/asking evidence, multi-year revision activity, and nearby infrastructure — and where does verifiable evidence stop?"*

---

## 1. Core-Intent & Epistemic Audit of `bhoomi-lens`

Before adding modeling complexity, every existing surface, score, and pipeline in `bhoomi-lens` is classified into three strict epistemic tiers:

| Feature / Output | Source Module | Epistemic Tier | False-Precision Risk Today | Action Taken / Required |
| --- | --- | --- | --- | --- |
| Raw street-level TN guideline registers (2002–2025) | `data/tn_gv/*.json`, `js/pilot_engine.js`, `/api/pilot/streets` | **Tier 1 · Observed Primary** | Previously collapsed into fuzzy village midpoints or multiplied by a flat proxy ratio (`2.3x`) | Expose directly: exact residential street lookup (`31,124` residential `ft2`/`m2` streets across pilot districts), village P10/Median/P90 spread, and mid-cycle 2025 updates (`954` rows). |
| Public auctions, govt allotments & nearby asking references | `js/comparables.js`, `js/pilot_engine.js` | **Tier 1 · Observed Primary** | Shared URLs and mixed evidence types can look like independent sales; `Thiruvallur`/`Tiruvallur` and `Kanchipuram`/`Kancheepuram` spelling splits fragmented district counts | Normalize district aliases, deduplicate by `(kind, source_url, rounded_price)` and `(kind, loc, rounded_price)`, and display raw un-discounted asking figures strictly separated from auctions/allotments and reported deals. |
| Official land-record links, airport zones, acquisition notices, dated Sentinel-2/Landsat & JRC water | `js/imagery.js`, `js/infra.js` | **Tier 1 · Observed Primary** | Visual tiles can be misread as survey boundaries or flood clearance | Retain with explicit resolution and official portal links (`tnreginet.gov.in`, `tngis.tn.gov.in`). |
| Anchor-relative quote corridor (`GV × local empirical ratio` + split-conformal bounds) | `js/pilot_engine.js`, `scripts/build_tn_pilot.js` | **Tier 2 · Benchmarked Estimate** | Extrapolating into sparse villages creates false certainty | Enforce strict **Abstention Gate**: emit a Tier 2 corridor *only* when `≥3` deduplicated non-proxy observations from `≥2` distinct source domains exist within `8 km` AND a matched official guideline anchor exists within `5 km`; otherwise explicitly **ABSTAIN**. |
| Registered-sale GBDT (`lat, lon, log_area, date`) | `scripts/market_model.py` | **Tier 2 · No-Go Today** | Zero TN rows in repo are verified registered sales; 4-feature coordinate GBDT ignores road width, DTCP/CMDA approval, patta/title, and cash wedge | Keep disconnected from UI. When licensed/permitted deeds arrive, change target from raw `log(price)` to residual `log(price / GV_street)`. |
| 820-district continuous price surface & 2015–2036 fan chart | `js/engine.js` | **Tier 3 · Heuristic Scenario** | Heuristic gravity formula + 2,379 guideline-derived proxies can be mistaken for measured valuations; P90 tail error on pilot non-proxy points is **286.3%** | Tag explicitly as `Tier 3 · Heuristic` in UI; exclude from pilot quote verdicts. |
| Opportunity, Risk & Liquidity gauges (`hash01` local variation) | `js/engine.js` | **Tier 3 · Heuristic Scenario** | Synthetic deterministic noise (`hash01`) visually resembles measured site risk or liquidity | Label explicitly as Tier 3 heuristic scores; never present as site-level flood, title, or transaction-volume proof. |
| Ripple simulator & infrastructure catalyst uplift | `js/engine.js`, `js/app.js` | **Tier 3 · Assumption Sandbox** | Assumed `U * exp(-d/r)` curves are not causal estimates | Keep strictly user-parameterized sensitivity sandbox until pre-trend + matched-control Difference-in-Differences data exists. |

---

## 2. Go / No-Go Decision: Supervised ML vs. Anchor-Relative Evidence Triangulation

### Decision: **NO-GO** on supervised ML over raw sales today; **GO** on Anchor-Relative Evidence Triangulation + Explicit Abstention.

**Why supervised ML is the wrong immediate build:**
1. **Zero lawful, bulk, point-level registered-sale panel exists in the repo (`0` TN rows labelled registered sale).** Paid aggregators (LandLens, India Property Register) restrict model training/public redistribution without separate commercial licensing, and scraping listing portals violates terms of service.
2. **Registered consideration ≠ market value** due to unrecorded cash components and selection bias, and vacant-land pricing varies **2.5×–3.5× within the same revenue village** based on street frontage, road width, and DTCP/CMDA approval (e.g., Sittalapakkam alone has `548` residential streets in the 2024 register spanning `₹1,320` at P10 to `₹3,850/sq ft` at P90).
3. **Empirically measured spatially blocked CV (`scripts/build_tn_pilot.js`) proves the anchor-relative baseline already beats both naive medians and the complex heuristic on tail risk:**

Tested on `57` deduplicated non-proxy residential-plot observations across `39` spatial clusters (`~3 km` grid blocks) in Chengalpattu (`25`), Tiruvallur (`26`), and Kancheepuram (`6`), evaluated with **leave-one-locality-cluster-out cross-validation**:

| Estimator | MdAPE (↓) | P90 Tail Error (↓) | Within ±25% (↑) | Notes |
| --- | ---: | ---: | ---: | --- |
| Naive district-median price | 45.8% | 164.4% | 19.3% | Ignores micro-location completely |
| Existing `engine.js` heuristic surface | 40.5% | **286.3%** | 33.3% | Severe tail blowups despite complex gravity + calibration kernel |
| **Anchor-relative baseline (`GV_local × OOF median ratio`)** | **40.6%** | **121.3%** | **33.3%** | **Cuts P90 tail error by 58% vs `engine.js`** with zero extra ML parameters |

- **Split-Conformal 80% Interval (strictly out-of-fold):** Empirical coverage = **78.9%** (nominal 80%), median width = **211.8%** of actual price (`conformalLogRadius = 0.937`). That wide conformal band is a feature, not a bug: it quantitatively proves how wide uncertainty truly is before street-level matching, plot-approval attributes, and verified clearing prices are added.
- **District Market-to-GV Ratio Quartiles (Observed Non-Proxy / Local GV):**
  - Chengalpattu (`n=25`): median `2.89×` (IQR `1.82×–4.77×`)
  - Tiruvallur (`n=26`): median `3.25×` (IQR `2.15×–3.88×`)
  - Kancheepuram (`n=6`): median `4.22×` (IQR `2.79×–7.00×`)
- **Abstention Gate Coverage (`778` matched geocoded pilot villages, `31,124` raw 2024 residential streets, `954` mid-cycle 2025 updates):**
  - **180 villages (23.1%)** pass the gate (`≥3` deduplicated non-proxy obs, `≥2` distinct source domains within `8 km`, official GV anchor within `5 km`) and receive a Tier 2 corridor.
  - **598 villages (76.9%)** explicitly **ABSTAIN** on Tier 2 and display Tier 1 statutory street guidelines + explicit missing-evidence disclosures.

---

## 3. Pilot Raw-to-Serving Architecture & Data Contract

### Raw Immutable Primitives (Layer 0)
1. **Official TNREGINET street registers (`bhoomi-lens/data/tn_gv/{2002..2024}/{District}.json`)**: Preserves SRO ID, SRO name, Tamil village name, street name, numeric rate, original unit (`ft2`, `m2`, `ac`, `ha`), land classification index, and mid-cycle effective date (`YYYY-MM-DD`). Residential pilot strictly filters to `ft2`/`m2` + residential class (`/குடியிருப்பு|Residential/i`).
2. **Public institutional clearing records (next lawful ingestion wave)**: TNHB, CMDA, SIPCOT, TIDCO, and IBAPI/SARFAESI bank e-auction notices & clearing bids (plot extent, survey/village, reserve price, winning bid if published, auction date, public URL).
3. **Permitted market references (`data/verified.js`, `data/evidence.js`)**: Retained in separate strata (`reported`, `auction`, `asking`, `compensation`, `official`, `proxy`) with raw un-discounted asking figures, URL deduplication, and explicit rights/date metadata.
4. **Statutory & physical-change context**: TNRERA layout registrations, OSM road-network travel times, and Microsoft Planetary Computer STAC Sentinel-2 NDBI/built-up deltas + JRC surface water.

### Reproducible Build & Serving Layer
- `node bhoomi-lens/scripts/build_tn_pilot.js` compiles Layer 0 → `bhoomi-lens/data/tn_pilot.js` (compact village residential distributions, coverage flags, and CV metrics) + `bhoomi-lens/data/tn_pilot_report.json`.
- `GET /api/pilot/streets?district=<D>&q=<query>&village=<V>` serves exact street-level official rates directly from the raw `data/tn_gv/<District>.json` files without bloating the browser bundle.

### Baseline Contract for Future ML Promotion
Any future model (hierarchical spatial mixed-effects or quantile GBDT on `log(P / GV_street)`) is **blocked from production** unless it:
1. Trains only on de-identified, rights-cleared observations with documented provenance and zero parcel/cluster leakage across folds;
2. Beats the simple **anchor-relative baseline (`GV_street × local median ratio`)** on **both** held-out future periods and held-out villages across MdAPE and P90 APE;
3. Achieves calibrated empirical coverage (`75%–85%` for nominal `80%`) with narrower median interval width than the baseline.

---

## 4. External Proof Criteria & Runnable Validation Harnesses

1. **Blind E-Auction & Allotment Clearing Test (`n ≥ 20` unseen plots):**
   - Template: `bhoomi-lens/data/tn_pilot_blind_auctions_template.csv` (also downloadable at `GET /api/pilot/blind-template.csv`).
   - Run: `node bhoomi-lens/scripts/pilot_blind_auction_eval.js <blind_auctions.csv>`.
   - Strictly validates TN bounds, public URL hygiene, residential class, and zero URL overlap against training strata; scores blind empirical coverage, abstention rate, MdAPE, P90 APE, and beat vs. naive district median.
2. **50-Record Manual Portal Provenance Audit:**
   - Deterministic stratified sample: `bhoomi-lens/data/tn_pilot_audit_50.csv` & `.json` (downloadable at `GET /api/pilot/audit-sample.csv`), spanning all 3 pilot districts, 2024 + mid-cycle 2025 updates, `ft2`/`m2` units, and both gate states.
   - Regenerate: `node bhoomi-lens/scripts/pilot_audit_sample.js`.
   - Score completed audit: `node bhoomi-lens/scripts/pilot_audit_sample.js --score <completed.csv>` (requires `≥50` verified rows and `≤4%` rejection rate).
3. **10-Quote Corridor Decision Brief Suite (Automated CI Gate):**
   - Run: `node bhoomi-lens/scripts/pilot_quote_briefs_check.js` (also served at `GET /api/pilot/10quote-check`).
   - Verified **10/10 PASS** across all 3 districts (within-corridor, below-floor Section 47A, above-corridor, street-locked floor, cent/ground unit conversions, and sparse ABSTAIN villages).
4. **Automated CI Contract & ML Promotion Gates (`npm test`):**
   - `tests/pilot_engine.test.js`, `tests/calibration.test.js`, `tests/comparables.test.js`, `scripts/pilot_quote_briefs_check.js`, and `tests/test_market_model.py` (`anchor_relative_baseline_metrics` + `check_promotion_gate`) run automatically in CI and block any model that leaks across parcels/URLs, fails to abstain, or fails to beat the anchor-relative baseline with calibrated 75%–85% coverage.

