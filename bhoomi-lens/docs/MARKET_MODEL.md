# Experimental registered-sale model

This is infrastructure for a Tamil Nadu residential-plot research pilot. It is **not trained on a real transaction panel**, is not connected to the app, does not calculate an undisclosed cash component and is not a production land valuation or a causal project-impact model. The current repository has no Tamil Nadu rows classified as registered sales in the price-reference inventory. It would be misleading to train on listings, auction reserves or guideline-derived estimates while calling them closed land sales.

## Data contract

Keep the input and model artifacts in access-controlled storage **outside this public repository**. Use one UTF-8 CSV with exactly these columns:

`event_id_hash,parcel_group_hash,event_date,state,district,land_class,latitude,longitude,location_precision,area_sqft,consideration_inr,source_url,rights_status,source_check`

- IDs are 64-character lowercase hex HMAC-SHA256 identifiers, produced using a secret salt stored separately. `event_id_hash` identifies a deed and must be unique. `parcel_group_hash` links repeat observations of the same parcel so they cannot leak into training from a test split. Raw names, document numbers, contact details and other additional columns are rejected.
- `event_date` is the actual registered-sale date, not the download date; `state` is `Tamil Nadu`; `district` uses an accepted district name; `land_class` is `residential_plot`; location precision is `survey` or `village`. A bounding box and allowed names are basic checks, not proof that a coordinate or district is correct.
- `consideration_inr` is what the registered document records, `area_sqft` is the relevant land area, and both must be positive. The label is registered consideration per square foot, which can differ from the total amount paid. No universal cash adjustment is inferred.
- `source_url` is a public, credential-free reference without query parameters. `rights_status` must be `verified` and `source_check` must be `verified_registered_sale` after appropriate human review. These are assertions in the supplied file; the code cannot prove them. Document access rights, location matching, land class and checks separately in the restricted data store.

## Staging saved LandLens reports

`scripts/landlens_stage.py` can privately stage either already-downloaded saved-report JSON files or one existing LandLens Price Map report through the provider's [saved-report API](https://verified.realestate/landlens/docs/price-map-transactions-api). It never creates a new Price Map. The provider documents the saved-report read as free, but prices and account terms can change; the response must report zero credits charged before the script stages it. Creating the underlying report is a separate, paid action. Authentication and the saved-report endpoint have been reached with a real account, but this importer has not yet been verified against a real saved report.

The provider's [published terms](https://verified.realestate/landlens/terms) limit report use and restrict public display and derivative works without written consent. Confirm rights for this app, including model training and evaluation, before staging or publishing provider data for that purpose. API access alone is not a licence to build a public dataset.

Set `LANDLENS_KEY` and a securely stored, randomly generated 32-byte key encoded as 64 hexadecimal characters in `BHOOMI_SALES_HASH_KEY` in the private execution environment. Use the same protected hashing key across imports to detect repeat candidates; never put either key in the repository, logs or chat. With access rights confirmed and an existing report ID:

```sh
python bhoomi-lens/scripts/landlens_stage.py --saved-report-id 123 --output /private/path/candidates.json
# Alternatively, read private JSON already downloaded from the saved-report API:
python bhoomi-lens/scripts/landlens_stage.py --input-json /private/path/report.json --output /private/path/candidates-from-file.json
```

Inputs and outputs must be outside this repository; the output is created with owner-only permissions and cannot overwrite an existing file. The importer discards names, addresses and raw identifiers, uses keyed fingerprints to flag repeat documents, quarantines conflicting duplicates, and records when the provider reports more land deeds than its 250-row response contains. The stage still contains exact dates, amounts and areas and must remain private. The same source deed can appear in multiple reports, and document fingerprints are provisional until independently checked. Review each candidate's underlying authorized source, deed identity, land class, precise location and parcel grouping; a Price Map's search parcel is not every deed's location. The staged JSON deliberately cannot be fed directly to `market_model.py`, and no report is labelled training-ready. Do not assume truncated, newest-first reports represent a complete history.

## Checking a LandLens connection

For a manual authentication check, add a restricted LandLens API key as the GitHub Actions repository secret `LANDLENS_KEY`. The manually dispatched `.github/workflows/landlens-connection.yml` performs the provider's documented free `GET /me` call. It does not use a repository checkout, print account data, create or download reports, or schedule collection. The public run log records only success or a general failure. This check does not verify tool permissions, data rights or whether saved Price Maps exist.

The key remains accessible to workflows that are authorized to use the repository secret, so limit who can modify and run those workflows. Do not put the key in the public repository, app, issue, workflow log or chat. This connection check is separate from the private staging and model-training process above; a successful check does not supply a transaction dataset.

## Evaluation

Run only on records that have the necessary rights and checks:

```sh
python -m pip install -r bhoomi-lens/scripts/requirements-market.txt
python bhoomi-lens/scripts/market_model.py /private/path/sales.csv --report /private/path/evaluation.json --model-out /private/path/model.joblib
python bhoomi-lens/scripts/market_predict.py /private/path/model.joblib --latitude 13.08 --longitude 80.26 --area-sqft 2400 --date 2026-11-08
```

The optional serialized artifact is restricted to a path outside the repository; trained models can themselves reveal information about their training data. Only load trusted model files: joblib files can execute code during loading. The separate prediction command reports whether the location, area or date falls outside the observed training bounds and always marks the result experimental. The script rejects extra columns and stops if it does not have at least 1,000 training rows across at least three years and two districts, at least 100 calibration rows, plus minimum future, geographic and combined holdouts. These are engineering gates, not proof that a dataset is sufficiently representative.

Before training, it deterministically holds out one district and the latest year, and reserves the most recent remaining year for calibration. It removes training and calibration records when their parcel groups appear in test sets, and removes calibration groups from training. The baseline uses past district medians, with a state-median fallback for an unseen district. A gradient-boosted model predicts log registered consideration per square foot using location, area and date; it gives repeated parcel groups equal total training weight. An experimental 80% nominal range is calibrated on the maximum absolute log residual per calibration parcel. The report measures row-level coverage and median width on each holdout, alongside sample and parcel-group counts, median and 90th-percentile absolute percentage error and the percentage within 25%. It publishes no individual transaction or prediction.

Economic series are not joined automatically: the current API snapshots do not provide historical publication vintages, so using their revised values for earlier forecasts could leak future information. The interval's nominal coverage is not guaranteed under changes across time or geography; inspect held-out coverage and width, and independently test additional periods and locations. Even a good holdout result would not establish title, total actual consideration, the effect of an investment or performance in all land classes. External validation, a representative licensed sample, source and location audits, privacy review and a defined deployment gate are still required before any use in the app. The result always reports `production_ready: false`.

`.github/workflows/market-model.yml` checks the implementation using synthetic records; it does not ingest private sale data or train a model on real transactions. CI capacity does not create missing observations or grant access to a paid feed.
