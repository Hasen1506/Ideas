# Experimental registered-sale model

This is infrastructure for a Tamil Nadu residential-plot research pilot. It is **not trained on a real transaction panel**, is not connected to the app, does not calculate an undisclosed cash component and is not a production land valuation or a causal project-impact model. The current repository has no Tamil Nadu rows classified as registered sales in the price-reference inventory. It would be misleading to train on listings, auction reserves or guideline-derived estimates while calling them closed land sales.

## Data contract

Keep the input and model artifacts in access-controlled storage **outside this public repository**. Use one UTF-8 CSV with exactly these columns:

`event_id_hash,parcel_group_hash,event_date,state,district,land_class,latitude,longitude,location_precision,area_sqft,consideration_inr,source_url,rights_status,source_check`

- IDs are 64-character lowercase hex HMAC-SHA256 identifiers, produced using a secret salt stored separately. `event_id_hash` identifies a deed and must be unique. `parcel_group_hash` links repeat observations of the same parcel so they cannot leak into training from a test split. Raw names, document numbers, contact details and other additional columns are rejected.
- `event_date` is the actual registered-sale date, not the download date; `state` is `Tamil Nadu`; `district` uses an accepted district name; `land_class` is `residential_plot`; location precision is `survey` or `village`. A bounding box and allowed names are basic checks, not proof that a coordinate or district is correct.
- `consideration_inr` is what the registered document records, `area_sqft` is the relevant land area, and both must be positive. The label is registered consideration per square foot, which can differ from the total amount paid. No universal cash adjustment is inferred.
- `source_url` is a public, credential-free reference without query parameters. `rights_status` must be `verified` and `source_check` must be `verified_registered_sale` after appropriate human review. These are assertions in the supplied file; the code cannot prove them. Document access rights, location matching, land class and checks separately in the restricted data store.

## Evaluation

Run only on records that have the necessary rights and checks:

```sh
python -m pip install -r bhoomi-lens/scripts/requirements-market.txt
python bhoomi-lens/scripts/market_model.py /private/path/sales.csv --report /private/path/evaluation.json --model-out /private/path/model.joblib
python bhoomi-lens/scripts/market_predict.py /private/path/model.joblib --latitude 13.08 --longitude 80.26 --area-sqft 2400 --date 2026-11-08
```

The optional serialized artifact is restricted to a path outside the repository; trained models can themselves reveal information about their training data. Only load trusted model files: joblib files can execute code during loading. The separate prediction command reports whether the location, area or date falls outside the observed training bounds and always marks the result experimental. The script rejects extra columns and stops if it does not have at least 1,000 training rows across at least three years and two districts, plus minimum future, geographic and combined holdouts. These are engineering gates, not proof that a dataset is sufficiently representative.

Before training, it deterministically holds out one district and the latest year. It removes training records for any parcel group found in a test set. The baseline uses past district medians, with a state-median fallback for an unseen district. A gradient-boosted model predicts log registered consideration per square foot using location, area and date; it gives repeated parcel groups equal total training weight. The report gives sample and parcel-group counts, median and 90th-percentile absolute percentage error and the percentage within 25%, separately for a later period, an unseen district and both together. It publishes no individual transaction or prediction.

Economic series are not joined automatically: the current API snapshots do not provide historical publication vintages, so using their revised values for earlier forecasts could leak future information. Even a good holdout result would not establish title, total actual consideration, the effect of an investment, valid uncertainty bands or performance in all land classes. External validation, a representative licensed sample, source and location audits, privacy review, calibrated uncertainty and a defined deployment gate are still required before any use in the app. The result always reports `production_ready: false`.

`.github/workflows/market-model.yml` checks the implementation using synthetic records; it does not ingest private sale data or train a model on real transactions. CI capacity does not create missing observations or grant access to a paid feed.
