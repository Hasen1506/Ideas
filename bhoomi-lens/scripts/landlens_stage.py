#!/usr/bin/env python3
"""Stage private, unverified candidates from saved LandLens Price Map reports.

This reads an existing report only; it never creates a paid Price Map. It does
not produce training-ready records or infer the location of individual deeds.
"""
import argparse
import datetime as dt
import hashlib
import hmac
import json
import math
import os
import re
import sys
import urllib.error
import urllib.request
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ENDPOINT = 'https://verified.realestate/api/v1/tools/pricemap_transactions'
PUBLIC_SOURCE = 'https://verified.realestate/landlens/docs/price-map-transactions-api'
MAX_BYTES = 8_000_000
MAX_REPORTS = 100
MAX_SHOWN = 250


class StageError(Exception):
    pass


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def outside_repository(path):
    resolved = Path(path).resolve()
    if resolved.is_relative_to(ROOT):
        raise StageError('private inputs and outputs must be outside the public repository')
    return resolved


def hash_key(raw):
    if not isinstance(raw, str) or not re.fullmatch(r'[0-9a-fA-F]{64}', raw):
        raise StageError('BHOOMI_SALES_HASH_KEY must contain 64 hexadecimal characters')
    return bytes.fromhex(raw)


def fingerprint(key, *parts):
    # JSON encoding is unambiguous when fields themselves contain separators.
    message = json.dumps(parts, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    return hmac.new(key, message, hashlib.sha256).hexdigest()


def positive_number(value):
    if isinstance(value, bool):
        raise ValueError('invalid number')
    n = float(value)
    if not math.isfinite(n) or n <= 0:
        raise ValueError('invalid number')
    return n


def read_saved_report(report_id, token):
    if not token or '\n' in token or '\r' in token:
        raise StageError('LANDLENS_KEY is missing or invalid')
    body = json.dumps({'price_map_id': report_id}).encode('utf-8')
    req = urllib.request.Request(ENDPOINT, data=body, method='POST', headers={
        'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json',
        'Accept': 'application/json', 'User-Agent': 'BhoomiLens-private-staging/1.0',
    })
    try:
        with urllib.request.build_opener(NoRedirect()).open(req, timeout=25) as response:
            if response.geturl() != ENDPOINT or response.status != 200:
                raise StageError('saved-report endpoint returned an unexpected response')
            raw = response.read(MAX_BYTES + 1)
        if len(raw) > MAX_BYTES:
            raise StageError('saved-report response exceeded the size limit')
        return json.loads(raw)
    except (urllib.error.URLError, OSError, ValueError):
        # Never echo a response body, authorization header, or personal fields.
        raise StageError('saved-report request failed or returned invalid JSON') from None


def load_private_json(path):
    path = outside_repository(path)
    try:
        with path.open('rb') as f:
            raw = f.read(MAX_BYTES + 1)
        if len(raw) > MAX_BYTES:
            raise StageError('saved report exceeded the size limit')
        return json.loads(raw)
    except (OSError, ValueError):
        raise StageError('saved report could not be read as JSON') from None


def stage_reports(reports, key):
    if not reports or len(reports) > MAX_REPORTS:
        raise StageError('supply between 1 and 100 saved reports')
    candidates, conflicts, summary, checks = {}, set(), [], Counter()
    for report in reports:
        if not isinstance(report, dict) or report.get('ok') is not True or report.get('status') != 'ok':
            raise StageError('a saved report was not returned successfully')
        charge = report.get('credits_charged')
        if type(charge) not in (int, float) or charge != 0:
            raise StageError('saved-report response did not confirm zero credits charged')
        data = report.get('data')
        if not isinstance(data, dict) or data.get('found') is not True:
            raise StageError('a saved report was not found')
        report_id, sro = data.get('price_map_id'), str(data.get('sro_code', ''))
        if type(report_id) is not int or report_id <= 0 or not re.fullmatch(r'\d{1,12}', sro):
            raise StageError('a saved report lacks a valid report or office identifier')
        land = data.get('land')
        if not isinstance(land, dict) or not isinstance(land.get('transactions'), list):
            raise StageError('a saved report lacks its land transaction section')
        counts = [land.get('total'), land.get('priced'), land.get('shown')]
        if (any(type(n) is not int or n < 0 for n in counts) or
            counts[1] > counts[0] or counts[2] > counts[0] or counts[2] > MAX_SHOWN or
            counts[2] != len(land['transactions'])):
            raise StageError('a saved report has incomplete or inconsistent transaction counts')
        report_hash = fingerprint(key, 'landlens-report-v1', report_id)
        summary.append({'report_hash': report_hash, 'land_total': counts[0], 'land_priced': counts[1],
                        'land_shown': counts[2], 'truncated': counts[0] > counts[2]})
        for transaction in land['transactions']:
            if not isinstance(transaction, dict):
                checks['malformed'] += 1
                continue
            if transaction.get('family_transfer') is not False or transaction.get('price_bearing') is not True:
                checks['family_unpriced_or_unknown'] += 1
                continue
            if str(transaction.get('nature', '')).strip().casefold() != 'sale deed' or str(transaction.get('type', '')).strip().casefold() != 'plot':
                checks['not_a_confirmed_plot_sale_candidate'] += 1
                continue
            try:
                date = dt.datetime.strptime(transaction.get('date', ''), '%d-%m-%Y').date()
                if not dt.date(2000, 1, 1) <= date <= dt.date.today() or str(transaction.get('year', '')) != str(date.year):
                    raise ValueError('invalid date')
                document = str(transaction.get('doc_no', '')).strip()
                if not re.fullmatch(r'[A-Za-z0-9/-]{1,40}', document):
                    raise ValueError('invalid document identifier')
                area, amount = positive_number(transaction.get('extent_sqft')), positive_number(transaction.get('value'))
                if not 100 <= area <= 10_000_000 or not 1 <= amount / area <= 10_000_000:
                    raise ValueError('invalid area or consideration')
            except (TypeError, ValueError, OverflowError):
                checks['invalid_or_missing_fields'] += 1
                continue
            event_hash = fingerprint(key, 'tn-sro-year-document-v1', sro, date.year, document)
            candidate = {'event_fingerprint': event_hash, 'event_date': date.isoformat(),
                         'area_sqft': area, 'recorded_consideration_inr': amount,
                         'source_reference': PUBLIC_SOURCE, 'training_ready': False,
                         'report_hashes': [report_hash],
                         'requires_review': ['data_rights', 'source_record', 'residential_land_class',
                                             'deed_location', 'parcel_group', 'document_identity']}
            if event_hash in conflicts:
                checks['duplicate_conflict'] += 1
            elif event_hash in candidates and any(candidates[event_hash][k] != v for k, v in candidate.items() if k != 'report_hashes'):
                candidates.pop(event_hash)
                conflicts.add(event_hash)
                checks['duplicate_conflict'] += 1
            elif event_hash in candidates:
                if report_hash not in candidates[event_hash]['report_hashes']:
                    candidates[event_hash]['report_hashes'].append(report_hash)
                checks['duplicate_candidate'] += 1
            else:
                candidates[event_hash] = candidate
    return {'schema': 'bhoomi-private-sale-candidates-v1', 'training_ready': False,
            'limitations': ['Report results can be truncated and biased toward newer, priced deeds.',
                            'The search parcel is not the location of every deed.',
                            'Fingerprints are provisional and do not establish unique deeds or parcels.',
                            'Recorded consideration is not necessarily the total amount paid.'],
            'reports': summary, 'counts': dict(sorted(checks.items())),
            'candidates': [candidates[k] for k in sorted(candidates)]}


def write_private(path, data):
    path = outside_repository(path)
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, 'O_NOFOLLOW', 0)
    try:
        fd = os.open(path, flags, 0o600)
        with os.fdopen(fd, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, separators=(',', ':'), allow_nan=False)
            f.write('\n')
    except OSError:
        raise StageError('private output could not be created; existing files are not overwritten') from None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument('--input-json', type=Path, nargs='+', help='private saved report JSON files')
    source.add_argument('--saved-report-id', type=int, help='fetch one report already owned by this account')
    parser.add_argument('--output', type=Path, required=True, help='new private staging JSON outside this repository')
    args = parser.parse_args()
    try:
        key = hash_key(os.environ.get('BHOOMI_SALES_HASH_KEY'))
        outside_repository(args.output)
        if args.input_json:
            if len(args.input_json) > MAX_REPORTS:
                raise StageError('too many saved reports')
            reports = [load_private_json(path) for path in args.input_json]
        else:
            if args.saved_report_id <= 0:
                raise StageError('saved report ID must be positive')
            reports = [read_saved_report(args.saved_report_id, os.environ.get('LANDLENS_KEY'))]
        staged = stage_reports(reports, key)
        write_private(args.output, staged)
        print(f'Staged {len(staged["candidates"])} de-identified candidates from {len(staged["reports"])} saved report(s).')
        print('Candidates are not training-ready; source, rights, classification, location and identity require review.')
        return 0
    except (StageError, OSError):
        print('Private staging stopped: ' + str(sys.exc_info()[1]), file=sys.stderr)
        return 2


if __name__ == '__main__':
    sys.exit(main())
