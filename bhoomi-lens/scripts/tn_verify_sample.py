#!/usr/bin/env python3
"""Compare a small reproducible sample of saved TN rows with the official portal.

The sample is restricted to searches with 1–10 saved rows, so it is not
representative of all locations or large result sets. This is a read-only check.
"""
import argparse
from collections import Counter
import datetime as dt
import hashlib
import os
import re
import time
import urllib.error

import tn_gv_collect as collector
from tn_retry_gaps import Fetcher, IncompleteResult, collect_complete, is_transport_failure, NETWORK_FAILURE_LIMIT


def select_samples(store, per_revision, seed):
    pools = {rev: [] for rev in collector.REV_ORDER}
    for district, data in store.files.items():
        for sid, sro in data.get('sros', {}).items():
            for rev, result in sro.get('revs', {}).items():
                if rev not in pools:
                    continue
                for vid, entry in result.get('d', {}).items():
                    n = entry.get('items')
                    if isinstance(n, int) and 1 <= n <= 10 and len(entry.get('rows', [])) == n:
                        key = (district, sid, rev, vid, entry.get('n', ''))
                        rank = hashlib.sha256((seed + '|'.join(key)).encode('utf-8')).hexdigest()
                        pools[rev].append((rank, key, entry, data['classes']))
    chosen = []
    for rev in collector.REV_ORDER:
        pool = sorted(pools[rev], key=lambda item: item[0])
        districts = set()
        for candidate in pool:
            district = candidate[1][0]
            if district in districts:
                continue
            districts.add(district)
            chosen.append(candidate)
            if len(districts) >= per_revision:
                break
    return chosen


def stored_rows(entry, classes):
    return Counter((street, value, unit, classes[class_index], effective)
                   for street, value, unit, class_index, effective in entry['rows'])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--per-revision', type=int, choices=(1, 2), default=2)
    parser.add_argument('--seed', default=dt.date.today().strftime('%G-W%V'),
                        help='seed recorded in output, defaults to ISO week')
    args = parser.parse_args()
    if not re.fullmatch(r'[A-Za-z0-9_-]{1,32}', args.seed):
        parser.error('seed must contain 1–32 letters, numbers, underscores or hyphens')
    store = collector.Store()
    sample = select_samples(store, args.per_revision, args.seed)
    fetch = Fetcher(limit=14)
    counts = Counter()
    consecutive_failures = 0
    print(f'Seed {args.seed}; {len(sample)} saved searches selected, at most 14 requests; 1–10 rows only.', flush=True)
    for _, key, entry, classes in sample:
        district, sid, revision, vid, name = key
        try:
            url, rows = collect_complete(collector.street_query(store, sid, revision, vid, name), revision, fetch)
            if Counter(rows) == stored_rows(entry, classes):
                result = 'matched'
            else:
                result = 'different: requires review'
            counts[result] += 1
            consecutive_failures = 0
            print(f'{revision} {district}, SRO {sid}, village {vid}: {result} (saved {entry["items"]}, portal {len(rows)})', flush=True)
        except (IncompleteResult, urllib.error.URLError, OSError, ValueError, KeyError, IndexError) as exc:
            counts['unavailable'] += 1
            consecutive_failures = consecutive_failures + 1 if is_transport_failure(exc) else 0
            print(f'{revision} {district}, SRO {sid}, village {vid}: unavailable ({type(exc).__name__})', flush=True)
            if consecutive_failures >= NETWORK_FAILURE_LIMIT:
                print('Repeated connection failures: stopping this sample early.', flush=True)
                break
        time.sleep(0.2)
    print(f'Attempted {sum(counts.values())} of {len(sample)}; matched {counts["matched"]}; different {counts["different: requires review"]}; unavailable {counts["unavailable"]}. Read-only, small-result sample, not a statewide accuracy estimate.', flush=True)
    if os.environ.get('GITHUB_ACTIONS') == 'true' and (counts['different: requires review'] or counts['unavailable']):
        print('::warning::Some TN guideline spot-checks differed or could not be completed; review the run summary.', flush=True)


if __name__ == '__main__':
    main()
