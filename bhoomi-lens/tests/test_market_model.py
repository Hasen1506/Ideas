"""Evaluate leakage and source gates using generated, non-real sale records."""
import csv
import datetime as dt
import hashlib
import importlib.util
import math
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import market_model as model
import market_predict as predict


def digest(text):
    return hashlib.sha256(text.encode()).hexdigest()


def valid_csv_row():
    return {
        'event_id_hash': digest('event'), 'parcel_group_hash': digest('parcel'),
        'event_date': '2022-05-01', 'state': 'Tamil Nadu', 'district': 'Chennai',
        'land_class': 'residential_plot', 'latitude': '13.08', 'longitude': '80.26',
        'location_precision': 'village', 'area_sqft': '2400', 'consideration_inr': '2400000',
        'source_url': 'https://example.org/public-reference', 'rights_status': 'verified',
        'source_check': 'verified_registered_sale',
    }


def make_records():
    rows = []
    for di, district in enumerate(('Chennai', 'Coimbatore', 'Madurai', 'Salem')):
        for year in range(2019, 2024):
            for i in range(100):
                rows.append({'group': digest(f'{district}-{year}-{i}'), 'date': dt.date(year, 1 + i % 12, 1),
                             'district': district, 'lat': 9.1 + di, 'lon': 78.1 + di * .4,
                             'area': 1000 + i * 10, 'price': 1000 + di * 400 + (year - 2019) * 55 + i})
    return rows


class SalesInputTests(unittest.TestCase):
    def test_accepts_only_checked_deidentified_sale_schema(self):
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / 'sales.csv'
            row = valid_csv_row()
            with path.open('w', newline='') as f:
                writer = csv.DictWriter(f, fieldnames=sorted(model.REQUIRED)); writer.writeheader(); writer.writerow(row)
            self.assertEqual(model.read_sales(path)[0]['price'], 1000)
            for key, value in [('source_check', 'listing'), ('rights_status', 'unknown'), ('district', 'Unknown'),
                               ('source_url', 'https://example.org/?token=secret'), ('event_id_hash', 'raw-document-number')]:
                bad = dict(row, **{key: value})
                with path.open('w', newline='') as f:
                    writer = csv.DictWriter(f, fieldnames=sorted(model.REQUIRED)); writer.writeheader(); writer.writerow(bad)
                with self.subTest(key=key), self.assertRaises(model.DataError):
                    model.read_sales(path)
            with path.open('w', newline='') as f:
                writer = csv.DictWriter(f, fieldnames=sorted(model.REQUIRED) + ['buyer_name']); writer.writeheader()
            with self.assertRaises(model.DataError):
                model.read_sales(path)

    def test_train_split_has_no_future_year_held_out_district_or_shared_parcel(self):
        rows = make_records()
        initial, held, year, _ = model.make_splits(rows)
        shared = initial['training'][0]['group']
        initial['future'][0]['group'] = shared
        splits, held, year, removed = model.make_splits(rows)
        self.assertGreaterEqual(removed, 1)
        self.assertTrue(all(r['date'].year < year and r['district'] != held for r in splits['training']))
        test_groups = {r['group'] for key, values in splits.items() if key != 'training' for r in values}
        self.assertFalse(test_groups.intersection(r['group'] for r in splits['training']))
        self.assertTrue(all(r['date'].year == year for r in splits['future_and_geography']))
        self.assertTrue(all(r['district'] == held for r in splits['future_and_geography']))

    def test_insufficient_sales_abstains(self):
        splits, _, _, _ = model.make_splits(make_records()[:300] + make_records()[500:600] + make_records()[1000:1100])
        with self.assertRaisesRegex(model.DataError, 'insufficient evidence'):
            model.require_sufficient(splits)

    @unittest.skipUnless(importlib.util.find_spec('sklearn'), 'scikit-learn installed in dedicated model CI')
    def test_model_and_baseline_are_scored_on_all_unseen_splits(self):
        report, trained = model.evaluate(make_records())
        self.assertFalse(report['production_ready'])
        self.assertEqual(len(report['training_years']), 4)
        for label in ('future', 'geography', 'future_and_geography'):
            block = report['tests'][label]
            self.assertGreater(block['baseline']['rows'], 0)
            self.assertEqual(block['baseline']['rows'], block['gradient_boosting']['rows'])
            self.assertTrue(math.isfinite(block['gradient_boosting']['median_absolute_percentage_error']))
            self.assertGreater(block['gradient_boosting']['parcel_groups'], 0)
        artifact = {'model': trained, 'scikit_learn_version': report['scikit_learn_version'], 'training_domain': trained._bhoomi_domain}
        forecast = predict.predict_one(artifact, 13.08, 80.26, 2000, dt.date(2025, 1, 1))
        self.assertFalse(forecast['production_ready'])
        self.assertIn('date', forecast['outside_training_bounds'])
        self.assertGreater(forecast['estimated_registered_consideration_inr_per_sqft'], 0)
        with self.assertRaises(ValueError):
            predict.predict_one(artifact, 20, 80, 2000, dt.date(2025, 1, 1))


if __name__ == '__main__':
    unittest.main()
