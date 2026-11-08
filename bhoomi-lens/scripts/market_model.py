#!/usr/bin/env python3
"""Evaluate an experimental registered-consideration model on a private CSV.

The input must contain de-identified, rights-cleared Tamil Nadu residential-plot
sales with independently documented source checks. No raw rows or predictions
are published. This is a research evaluation, not an app valuation or causal model.
"""
import argparse
import csv
import datetime as dt
import hashlib
import json
import math
import re
import statistics
import sys
from collections import Counter, defaultdict
from pathlib import Path
from urllib.parse import urlparse

REQUIRED = {'event_id_hash', 'parcel_group_hash', 'event_date', 'state', 'district',
            'land_class', 'latitude', 'longitude', 'location_precision', 'area_sqft',
            'consideration_inr', 'source_url', 'rights_status', 'source_check'}
HASH = re.compile(r'^[a-f0-9]{64}$')
MINIMUM = {'training': 1000, 'future': 100, 'geography': 100, 'future_and_geography': 50}
DISTRICTS = {name.casefold(): name for name in (
    'Ariyalur', 'Chengalpattu', 'Chennai', 'Coimbatore', 'Cuddalore', 'Dharmapuri',
    'Dindigul', 'Erode', 'Kallakurichi', 'Kancheepuram', 'Kanniyakumari', 'Karur',
    'Krishnagiri', 'Madurai', 'Mayiladuthurai', 'Nagapattinam', 'Namakkal', 'Nilgiris',
    'Perambalur', 'Pudukkottai', 'Ramanathapuram', 'Ranipet', 'Salem', 'Sivagangai',
    'Tenkasi', 'Thanjavur', 'Theni', 'Tiruchirappalli', 'Tirupathur', 'Tiruvarur',
    'Thoothukkudi', 'Tirunelveli', 'Tiruppur', 'Tiruvallur', 'Tiruvannamalai',
    'Vellore', 'Viluppuram', 'Virudhunagar')}


class DataError(Exception):
    pass


def positive(raw):
    try:
        value = float(raw)
    except (TypeError, ValueError):
        raise DataError('invalid numeric field')
    if not math.isfinite(value) or value <= 0:
        raise DataError('invalid numeric field')
    return value


def read_sales(path):
    """Strict input: no unknown columns, names, contact details or raw deed IDs."""
    records = []
    seen = set()
    with open(path, encoding='utf-8-sig', newline='') as file:
        reader = csv.DictReader(file)
        if set(reader.fieldnames or []) != REQUIRED or len(reader.fieldnames or []) != len(REQUIRED):
            raise DataError('CSV columns do not match the required de-identified schema')
        for line, row in enumerate(reader, 2):
            try:
                if None in row or not HASH.fullmatch(row['event_id_hash'] or '') or not HASH.fullmatch(row['parcel_group_hash'] or ''):
                    raise DataError('IDs must be pseudonymized SHA-256 hashes')
                if row['event_id_hash'] in seen:
                    raise DataError('duplicate event ID')
                date = dt.date.fromisoformat(row['event_date'])
                if not dt.date(2000, 1, 1) <= date <= dt.date.today():
                    raise DataError('transaction date outside supported range')
                if row['state'] != 'Tamil Nadu' or row['district'].strip().casefold() not in DISTRICTS:
                    raise DataError('expected a recognized Tamil Nadu district')
                if row['land_class'] != 'residential_plot' or row['location_precision'] not in ('survey', 'village'):
                    raise DataError('expected a residential plot at survey or village precision')
                if row['rights_status'] != 'verified' or row['source_check'] != 'verified_registered_sale':
                    raise DataError('rights and recorded-sale checks must be verified')
                source = urlparse(row['source_url'])
                if source.scheme not in ('http', 'https') or not source.hostname or source.username or source.password or source.query or source.fragment:
                    raise DataError('expected a public source reference without credentials or query parameters')
                lat, lon = positive(row['latitude']), positive(row['longitude'])
                if not (8.0 <= lat <= 13.7 and 76.0 <= lon <= 80.5):
                    raise DataError('coordinates outside the Tamil Nadu bounding box')
                area, amount = positive(row['area_sqft']), positive(row['consideration_inr'])
                if not 100 <= area <= 10_000_000 or not 1 <= amount / area <= 10_000_000:
                    raise DataError('area or unit price outside broad quality bounds')
                district = DISTRICTS[row['district'].strip().casefold()]
                records.append({'group': row['parcel_group_hash'], 'date': date, 'district': district,
                                'lat': lat, 'lon': lon, 'area': area, 'price': amount / area})
                seen.add(row['event_id_hash'])
            except (ValueError, KeyError, DataError) as error:
                raise DataError(f'Invalid data on line {line}: {error}') from None
    if not records:
        raise DataError('no sale records supplied')
    return records


def make_splits(records):
    """Future time, an unseen district, and both together; no parcel crosses training/test."""
    districts = sorted({r['district'] for r in records}, key=lambda d: hashlib.sha256(d.casefold().encode()).hexdigest())
    if len(districts) < 3:
        raise DataError('at least three districts are required for a geographic holdout')
    held_out = districts[0]
    test_year = max(r['date'].year for r in records)
    splits = {'training': [], 'future': [], 'geography': [], 'future_and_geography': []}
    for row in records:
        future, geo = row['date'].year >= test_year, row['district'] == held_out
        key = 'future_and_geography' if future and geo else 'future' if future else 'geography' if geo else 'training'
        splits[key].append(row)
    test_groups = {r['group'] for k, rows in splits.items() if k != 'training' for r in rows}
    removed = sum(r['group'] in test_groups for r in splits['training'])
    splits['training'] = [r for r in splits['training'] if r['group'] not in test_groups]
    return splits, held_out, test_year, removed


def require_sufficient(splits):
    failures = [f'{key}: {len(splits[key])} rows (minimum {threshold})' for key, threshold in MINIMUM.items() if len(splits[key]) < threshold]
    for key, threshold in MINIMUM.items():
        if len({r['group'] for r in splits[key]}) < threshold // 2:
            failures.append(f'{key}: too few independent parcel groups')
    train = splits['training']
    if len({r['date'].year for r in train}) < 3:
        failures.append('training data must cover at least three calendar years')
    if len({r['district'] for r in train}) < 2:
        failures.append('training data must cover at least two districts')
    if failures:
        raise DataError('insufficient evidence: ' + '; '.join(failures))


def features(rows):
    return [[r['lat'], r['lon'], math.log(r['area']), r['date'].year + (r['date'].month - 1) / 12] for r in rows]


def metrics(rows, predictions):
    if len(rows) != len(predictions) or not rows:
        raise DataError('cannot score empty or mismatched predictions')
    errors = sorted(abs(float(p) / r['price'] - 1) for r, p in zip(rows, predictions))
    return {'rows': len(rows), 'parcel_groups': len({r['group'] for r in rows}),
            'median_absolute_percentage_error': round(statistics.median(errors) * 100, 2),
            'p90_absolute_percentage_error': round(errors[math.ceil(0.9 * len(errors)) - 1] * 100, 2),
            'within_25_percent': round(sum(x <= .25 for x in errors) / len(errors) * 100, 2)}


def evaluate(records):
    splits, held_out, test_year, removed = make_splits(records)
    require_sufficient(splits)
    # Imported only after data passes the gate: the static app has no ML dependency.
    try:
        import sklearn
        from sklearn.ensemble import HistGradientBoostingRegressor
    except ImportError:
        raise DataError('install the pinned market-model requirements before training') from None
    train = splits['training']
    # Give each parcel group equal total weight to reduce repeated-sale overcounting.
    group_counts = Counter(r['group'] for r in train)
    weights = [1 / group_counts[r['group']] for r in train]
    model = HistGradientBoostingRegressor(max_iter=200, max_leaf_nodes=31, min_samples_leaf=20,
                                           l2_regularization=1.0, random_state=2026)
    model.fit(features(train), [math.log(r['price']) for r in train], sample_weight=weights)
    model._bhoomi_domain = {
        'latitude': [min(r['lat'] for r in train), max(r['lat'] for r in train)],
        'longitude': [min(r['lon'] for r in train), max(r['lon'] for r in train)],
        'area_sqft': [min(r['area'] for r in train), max(r['area'] for r in train)],
        'date': [min(r['date'] for r in train).isoformat(), max(r['date'] for r in train).isoformat()],
    }
    # Baseline: median of per-parcel medians, by district, falling back to state.
    by_group = defaultdict(list)
    for r in train:
        by_group[(r['district'], r['group'])].append(r['price'])
    district_values = defaultdict(list)
    for (district, group), values in by_group.items():
        district_values[district].append(statistics.median(values))
    medians = {district: statistics.median(values) for district, values in district_values.items()}
    state_median = statistics.median([v for values in district_values.values() for v in values])
    result = {}
    for label in ('future', 'geography', 'future_and_geography'):
        rows = splits[label]
        baseline = [medians.get(r['district'], state_median) for r in rows]
        predicted = [math.exp(v) for v in model.predict(features(rows))]
        result[label] = {'baseline': metrics(rows, baseline), 'gradient_boosting': metrics(rows, predicted)}
    report = {
        'target': 'registered consideration per square foot for residential plots, not inferred total payment',
        'algorithm': 'HistGradientBoostingRegressor on log registered price per square foot',
        'scikit_learn_version': sklearn.__version__,
        'training_rows': len(train), 'training_parcel_groups': len(group_counts),
        'training_years': sorted({r['date'].year for r in train}),
        'held_out_district': held_out, 'held_out_year': test_year,
        'training_rows_removed_for_parcel_overlap': removed,
        'features': ['latitude', 'longitude', 'log area', 'transaction year and month'],
        'tests': result,
        'production_ready': False,
        'limitations': 'Experimental assessment only. Thresholds are minimum engineering gates, not proof of statistical adequacy. Source checks are asserted by the data provider; spatial joins, temporal availability, accuracy, rights and external validation still need independent review. Does not estimate undisclosed payment or causal project effects.',
    }
    return report, model


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('csv', type=Path, help='Private, de-identified and rights-cleared sale CSV (do not commit to a public repository)')
    parser.add_argument('--report', type=Path, help='Write aggregate evaluation metrics to this path')
    parser.add_argument('--model-out', type=Path, help='Optional private model path outside this public repository')
    args = parser.parse_args()
    try:
        if args.csv.resolve().is_relative_to(Path(__file__).resolve().parents[2]):
            raise DataError('private sales input must be stored outside this public repository')
        if args.model_out and args.model_out.resolve().is_relative_to(Path(__file__).resolve().parents[2]):
            raise DataError('model artifacts must be stored outside this public repository')
        report, model = evaluate(read_sales(args.csv))
        if args.model_out:
            import joblib
            joblib.dump({'model': model, 'features': report['features'], 'target': report['target'], 'scikit_learn_version': report['scikit_learn_version'], 'training_domain': model._bhoomi_domain}, args.model_out)
        output = json.dumps(report, indent=2, allow_nan=False) + '\n'
        if args.report:
            args.report.write_text(output, encoding='utf-8')
        print(output, end='')
        return 0
    except (DataError, OSError, csv.Error) as error:
        print(f'Model evaluation stopped: {error}', file=sys.stderr)
        return 2


if __name__ == '__main__':
    sys.exit(main())
