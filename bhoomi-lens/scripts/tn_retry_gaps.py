#!/usr/bin/env python3
"""Bounded, certificate-verified retry for parked TN guideline searches.

Nothing is written unless every page for a search passes the count and row checks.
Newly recovered villages remain unplaced: mapping a village to a point requires
independent review. This program does not collect transactions or RERA records.
"""
import argparse
import datetime as dt
import json
import math
import os
import re
import sys
import urllib.error
import urllib.request

import tn_gv_collect as collector

MAX_REQUESTS = 20
NETWORK_FAILURE_LIMIT = 3
MAX_BYTES = 2_000_000
ALLOWED_UNITS = set(collector.UNIT.values())


class IncompleteResult(Exception):
    pass


def is_transport_failure(error):
    # A per-record 404 is not proof that the whole portal is unreachable.
    if isinstance(error, urllib.error.HTTPError):
        return error.code in (408, 429, 500, 502, 503, 504)
    return isinstance(error, (urllib.error.URLError, OSError))


class Fetcher:
    def __init__(self, limit=MAX_REQUESTS):
        self.remaining = limit

    def __call__(self, url):
        if not url.startswith(collector.P + 'webHP?'):
            raise IncompleteResult('unexpected source')
        if self.remaining <= 0:
            raise IncompleteResult('request budget reached')
        self.remaining -= 1
        req = urllib.request.Request(url, headers={'User-Agent': 'BhoomiLens/1.0 (+https://github.com/Hasen1506/Ideas)'})
        # urllib uses certificate verification and the environment's normal network settings.
        with urllib.request.urlopen(req, timeout=15) as response:
            if response.geturl().split('?', 1)[0] != collector.P + 'webHP':
                raise IncompleteResult('unexpected redirect')
            data = response.read(MAX_BYTES + 1)
        if len(data) > MAX_BYTES:
            raise IncompleteResult('response too large')
        return data.decode('utf-8', errors='replace')


def collect_complete(query, revision, fetch):
    """Return only complete, consistent street results; never accept error pages."""
    url = collector.q_url(**query)
    page = fetch(url)
    if 'Error Page' in page or 'captcha' in page.lower():
        raise IncompleteResult('portal error or access challenge')
    count = collector.n_items(page)
    # An empty result may be genuine, but it needs review rather than silently
    # changing a previously failed historical search to completed.
    if count <= 0:
        raise IncompleteResult('no positive result count')
    page_count = math.ceil(count / 10)
    if page_count > MAX_REQUESTS:
        raise IncompleteResult('result exceeds per-run request budget')
    rows = collector.parse_rows(page, revision)
    if not rows:
        raise IncompleteResult('missing result table')
    seen_pages = {tuple(rows)}
    page_key = re.search(r'(d-\d+-p)=\d+', page)
    if page_count > 1 and not page_key:
        raise IncompleteResult('pagination missing')
    for n in range(2, page_count + 1):
        other = fetch(collector.q_url(**dict(query, **{page_key.group(1): str(n)})))
        if 'Error Page' in other or 'captcha' in other.lower() or collector.n_items(other) != count:
            raise IncompleteResult('inconsistent or failed page')
        batch = collector.parse_rows(other, revision)
        if not batch or tuple(batch) in seen_pages:
            raise IncompleteResult('missing or repeated page')
        seen_pages.add(tuple(batch))
        rows.extend(batch)
    if len(rows) != count:
        raise IncompleteResult('row count mismatch')
    for street, value, unit, classification, effective in rows:
        if not street or not isinstance(value, (int, float)) or not math.isfinite(value) or value <= 0 or unit not in ALLOWED_UNITS:
            raise IncompleteResult('invalid street, rate or unit')
    return url, rows


def candidates(store):
    result = []
    for district, data in store.files.items():
        for sid, sro in data['sros'].items():
            for revision, rev in sro['revs'].items():
                for vid, name in rev.get('v') or []:
                    entry = rev.get('d', {}).get(vid, {})
                    if 'items' not in entry and entry.get('err', 0) >= collector.PARK_ERR:
                        result.append((district, sid, revision, vid, name))
    return sorted(result)


def save_recoveries(store, found):
    """Write only successfully recovered entries, never whole repeated snapshots."""
    files = {}
    provenance_path = os.path.join(collector.DATA, '_recoveries.json')
    provenance = collector.jload(provenance_path, {})
    fetched = dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds').replace('+00:00', 'Z')
    for (district, sid, revision, vid, name), url, rows in found:
        path = collector.rev_path(district, revision)
        if path not in files:
            with open(path, encoding='utf-8') as f:
                files[path] = json.load(f)
        data = files[path]
        entry = data['sros'][sid]['revs'][revision]['d'][vid]
        if 'items' in entry:
            raise IncompleteResult('entry already collected; reload before retrying')
        classes = data['classes']
        encoded = []
        for street, rate, unit, classification, effective in rows:
            if classification not in classes:
                classes.append(classification)
            encoded.append([street, rate, unit, classes.index(classification), effective])
        data['sros'][sid]['revs'][revision]['d'][vid] = {'n': name, 'items': len(rows), 'rows': encoded}
        collector.Store.put_village(store, district, sid, revision, vid, name, len(rows), rows)
        provenance['|'.join((district, sid, revision, vid))] = {
            'source_url': url, 'retrieved_at_utc': fetched, 'items': len(rows),
            'placement': 'not independently matched to an app location',
        }
    for path, data in files.items():
        collector.jdump(path, data)
    collector.jdump(provenance_path, provenance, pretty=True)
    collector.jdump(os.path.join(collector.DATA, 'progress.json'), store.progress(), pretty=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true', help='save fully checked recoveries (default: dry run)')
    parser.add_argument('--max-records', type=int, default=5, choices=range(1, 6))
    args = parser.parse_args()
    store = collector.Store()
    pending = candidates(store)
    if pending:
        offset = int(dt.date.today().strftime('%V')) % len(pending)
        pending = pending[offset:] + pending[:offset]
    print(f'Parked searches: {len(pending)}; attempting at most {args.max_records}; request limit {MAX_REQUESTS}.', flush=True)
    fetch = Fetcher()
    found = []
    consecutive_failures = 0
    for key in pending[:args.max_records]:
        district, sid, rev, vid, name = key
        try:
            query = collector.street_query(store, sid, rev, vid, name)
            url, rows = collect_complete(query, rev, fetch)
            found.append((key, url, rows))
            consecutive_failures = 0
            print(f'{district} {rev} SRO {sid} village {vid}: {len(rows)} checked rows', flush=True)
        except (IncompleteResult, urllib.error.URLError, OSError, ValueError, KeyError) as exc:
            consecutive_failures = consecutive_failures + 1 if is_transport_failure(exc) else 0
            print(f'{district} {rev} SRO {sid} village {vid}: unresolved ({type(exc).__name__}: {str(exc)[:100]})', flush=True)
            if consecutive_failures >= NETWORK_FAILURE_LIMIT:
                print('Repeated connection failures: stopping this run early; remaining searches stay unresolved.', flush=True)
                break
    if args.apply and found:
        save_recoveries(store, found)
        print('Saved checked results and source URLs; location matching is still required.', flush=True)
    else:
        print('No files written.' if not found else 'Dry run: no files written.', flush=True)
    print(f'Requests used: {MAX_REQUESTS - fetch.remaining}; complete recoveries: {len(found)}.', flush=True)


if __name__ == '__main__':
    main()
