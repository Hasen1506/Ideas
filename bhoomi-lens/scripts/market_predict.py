#!/usr/bin/env python3
"""Run a private experimental registered-consideration model; not a valuation."""
import argparse
import datetime as dt
import json
import math
import sys
from pathlib import Path


def predict_one(artifact, latitude, longitude, area_sqft, date):
    import sklearn
    if artifact.get('scikit_learn_version') != sklearn.__version__:
        raise ValueError('model and installed scikit-learn versions differ')
    if not all(math.isfinite(v) for v in (latitude, longitude, area_sqft)):
        raise ValueError('coordinates and area must be finite')
    if not (8 <= latitude <= 13.7 and 76 <= longitude <= 80.5 and 100 <= area_sqft <= 10_000_000):
        raise ValueError('location or area outside the supported bounds')
    if not dt.date(2000, 1, 1) <= date <= dt.date(2100, 12, 31):
        raise ValueError('date outside the supported range')
    domain = artifact['training_domain']
    log_value = float(artifact['model'].predict([[latitude, longitude, math.log(area_sqft), date.year + (date.month - 1) / 12]])[0])
    if not math.isfinite(log_value) or not -100 < log_value < 100:
        raise ValueError('model returned an invalid prediction')
    value = math.exp(log_value)
    flags = [key for key, val in (('latitude', latitude), ('longitude', longitude), ('area_sqft', area_sqft), ('date', date.isoformat()))
             if val < domain[key][0] or val > domain[key][1]]
    result = {
        'estimated_registered_consideration_inr_per_sqft': round(value, 2),
        'outside_training_bounds': flags,
        'production_ready': False,
        'limitation': 'Experimental model of registered consideration for a residential plot. Not validated for this plot; not total consideration, a causal estimate or investment advice.',
    }
    if 'calibration_log_radius' in artifact:
        radius = float(artifact['calibration_log_radius'])
        nominal = artifact.get('interval_nominal_percent')
        if not math.isfinite(radius) or not 0 <= radius < 100 or type(nominal) not in (float, int) or not 0 < nominal < 100:
            raise ValueError('invalid calibration interval in model artifact')
        result['experimental_interval_inr_per_sqft'] = {
            'lower': round(value * math.exp(-radius), 2),
            'upper': round(value * math.exp(radius), 2),
            'nominal_percent': nominal,
            'limitation': 'Nominal coverage is not guaranteed for this place or time; check held-out coverage and width.',
        }
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('model', type=Path, help='Trusted private model artifact outside this public repository')
    parser.add_argument('--latitude', type=float, required=True)
    parser.add_argument('--longitude', type=float, required=True)
    parser.add_argument('--area-sqft', type=float, required=True)
    parser.add_argument('--date', type=dt.date.fromisoformat, required=True)
    args = parser.parse_args()
    try:
        if args.model.resolve().is_relative_to(Path(__file__).resolve().parents[2]):
            raise ValueError('model artifact must be stored outside this public repository')
        import joblib
        # joblib uses pickle: load only an artifact created by a trusted training run.
        artifact = joblib.load(args.model)
        print(json.dumps(predict_one(artifact, args.latitude, args.longitude, args.area_sqft, args.date), indent=2, allow_nan=False))
        return 0
    except (OSError, ValueError, KeyError, TypeError, ImportError) as error:
        print(f'Prediction stopped: {error}', file=sys.stderr)
        return 2


if __name__ == '__main__':
    sys.exit(main())
