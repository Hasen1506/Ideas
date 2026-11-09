#!/usr/bin/env python3
"""Collect the TN government's published district consumer-price indices.

The series is economic context, not land prices. District names and boundaries
are preserved exactly as the source prints them; no map join is inferred.
"""
import argparse
import datetime as dt
import hashlib
from html.parser import HTMLParser
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request

import collect_macro

PAGE = 'https://des.tn.gov.in/node/346'
ALLOWED_HOSTS = {'des.tn.gov.in', 'www.des.tn.gov.in'}
MONTHS = {m: n for n, m in enumerate(('jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'), 1)}
MONTH_PATTERN = re.compile(r"\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)['-](\d{2})\b", re.I)
MAX_PDF = 8_000_000


class SourceError(Exception):
    pass


class PublicationTable(HTMLParser):
    def __init__(self):
        super().__init__()
        self.current = None
        self.rows = []

    def handle_starttag(self, tag, attrs):
        if tag == 'tr':
            self.current = {'text': [], 'links': []}
        elif tag == 'a' and self.current is not None:
            self.current['links'].append(dict(attrs).get('href', ''))

    def handle_data(self, data):
        if self.current is not None:
            self.current['text'].append(data)

    def handle_endtag(self, tag):
        if tag == 'tr' and self.current is not None:
            self.rows.append(self.current)
            self.current = None


def allowed_pdf_url(url):
    try:
        u = urllib.parse.urlparse(url)
        return (u.scheme == 'https' and u.hostname in ALLOWED_HOSTS and not u.username and not u.password and
                u.port in (None, 443) and not u.query and not u.fragment and
                u.path.startswith('/sites/default/files/') and u.path.lower().endswith('.pdf'))
    except ValueError:
        return False


def discover_pdf(html):
    parser = PublicationTable()
    parser.feed(html)
    found = []
    for row in parser.rows:
        text = re.sub(r'[^a-z]+', ' ', ' '.join(row['text']).lower())
        if ('consumer price index' in text and 'index state series' in text and
            all(word in text for word in ('rural', 'urban', 'combined')) and 'inflation' not in text):
            found.extend(urllib.parse.urljoin(PAGE, href) for href in row['links'] if href)
    if len(found) != 1 or not allowed_pdf_url(found[0]):
        raise SourceError('could not identify one official district CPI index report')
    return found[0]


def get_bytes(url, limit):
    if url != PAGE and not allowed_pdf_url(url):
        raise SourceError('unexpected source URL')
    request = urllib.request.Request(url, headers={'User-Agent': 'BhoomiLens/1.0 (+https://github.com/Hasen1506/Ideas)'})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(request, timeout=45) as response:
                final = urllib.parse.urlparse(response.geturl())
                if final.scheme != 'https' or final.hostname not in ALLOWED_HOSTS or final.port not in (None, 443) or final.query or final.fragment:
                    raise SourceError('unexpected source redirect')
                raw = response.read(limit + 1)
            if len(raw) > limit:
                raise SourceError('source exceeded size limit')
            return raw
        except urllib.error.HTTPError as error:
            if error.code not in (408, 429, 500, 502, 503, 504):
                raise SourceError('source rejected the request') from None
        except (urllib.error.URLError, OSError):
            pass
        if attempt < 2:
            time.sleep(2 * (attempt + 1))
    raise SourceError('source unavailable after bounded retries')


def pdf_text(raw):
    if not raw.startswith(b'%PDF-'):
        raise SourceError('source was not a PDF')
    try:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'source.pdf'
            path.write_bytes(raw)
            run = subprocess.run(['pdftotext', '-layout', str(path), '-'], capture_output=True, timeout=30, check=True)
        return run.stdout.decode('utf-8')
    except (OSError, subprocess.SubprocessError, UnicodeError):
        raise SourceError('could not read the official PDF') from None


def parse_values(raw, count):
    values = raw.split()
    if len(values) != count:
        raise SourceError('row and month counts do not match')
    result = []
    for value in values:
        if value == '-':
            result.append(None)
        elif re.fullmatch(r'\d+(?:\.\d+)?', value) and 0 < float(value) < 10000:
            result.append(float(value))
        else:
            raise SourceError('invalid CPI value')
    return result


def parse_report(text, source_url, document_hash):
    if not allowed_pdf_url(source_url) or not re.fullmatch(r'[a-f0-9]{64}', document_hash):
        raise SourceError('unexpected source provenance')
    combined = [p for p in text.split('\f') if re.search(r'\(combined\)', p, re.I)]
    if not combined:
        raise SourceError('no combined-sector pages found')
    points, names, all_months = {}, None, set()
    for page in combined:
        if not re.search(r'Base\s*Year\s*:\s*2019\s*-\s*2020\s*=\s*100', page, re.I):
            raise SourceError('unexpected or missing CPI base')
        if not re.search(r'Source:\s*Compiled\s+and\s+Released\s+by\s+DES', page, re.I):
            raise SourceError('source attribution missing')
        months = [f'20{year}-{MONTHS[month.lower()]:02d}' for month, year in MONTH_PATTERN.findall(page)]
        if not 1 <= len(months) <= 12 or len(months) != len(set(months)) or months != sorted(months):
            raise SourceError('invalid month headers')
        current_month = dt.date.today().strftime('%Y-%m')
        if months[-1] > current_month or any(m in all_months for m in months):
            raise SourceError('future or duplicate month')
        all_months.update(months)
        rows, state = [], []
        for line in page.splitlines():
            row = re.match(r'^\s*(\d{1,2})\s+(.+?)\s{2,}(.+?)\s*$', line)
            if row:
                rows.append((int(row.group(1)), row.group(2).strip(), parse_values(row.group(3), len(months))))
            state_match = re.match(r'^\s*Tamil\s*nadu\s{2,}(.+?)\s*$', line, re.I)
            if state_match:
                state.append(parse_values(state_match.group(1), len(months)))
        if [x[0] for x in rows] != list(range(1, 33)) or len(state) != 1:
            raise SourceError('expected 32 numbered areas and one state aggregate')
        page_names = [name for _, name, _ in rows]
        if len(set(page_names)) != 32 or (names is not None and names != page_names):
            raise SourceError('area names changed across report pages')
        names = page_names
        for _, name, values in rows:
            points.setdefault(name, []).extend(zip(months, values))
        points.setdefault('Tamil Nadu', []).extend(zip(months, state[0]))
    periods = sorted(all_months)
    if len(periods) < 12:
        raise SourceError('too few months to establish a history')
    for left, right in zip(periods, periods[1:]):
        y, m = map(int, left.split('-'))
        next_month = f'{y + (m == 12):04d}-{1 if m == 12 else m + 1:02d}'
        if right != next_month:
            raise SourceError('report has missing months')
    series = []
    for name in ['Tamil Nadu'] + names:
        values = sorted(points[name])
        if [month for month, _ in values] != periods:
            raise SourceError('incomplete area history')
        series.append({'area': name, 'points': [[month, value] for month, value in values]})
    return {'source': 'Tamil Nadu Department of Economics and Statistics', 'source_url': source_url,
            'source_page': PAGE, 'document_sha256': document_hash, 'base': '2019–2020 = 100',
            'sector': 'Combined', 'first_month': periods[0], 'last_month': periods[-1],
            'scope': 'Consumer prices, not land prices. The report names 32 areas; do not assume those boundaries match current districts.',
            'series': series}


def save_if_observations_changed(result):
    """Preserve prior coverage; do not write for PDF-only metadata changes."""
    path = collect_macro.DATA / 'tn_district_cpi.js'
    prefix = 'window.BL_TN_DISTRICT_CPI='
    try:
        contents = path.read_text(encoding='utf-8')
        old = json.loads(contents[len(prefix):].strip().rstrip(';')) if contents.startswith(prefix) else None
        if old:
            previous = {series['area']: dict(series['points']) for series in old['series']}
            incoming = {series['area']: dict(series['points']) for series in result['series']}
            if previous.keys() != incoming.keys():
                raise SourceError('published area coverage changed; review before replacement')
            for area, values in previous.items():
                if not values.keys() <= incoming[area].keys() or any(value is not None and incoming[area][month] is None for month, value in values.items()):
                    raise SourceError('new report drops previous observations; review before replacement')
        if old and {k: v for k, v in old.items() if k not in ('captured_utc', 'document_sha256')} == {k: v for k, v in result.items() if k != 'document_sha256'}:
            return False
    except (OSError, ValueError, TypeError, KeyError):
        pass
    return collect_macro.save_if_changed('tn_district_cpi.js', 'BL_TN_DISTRICT_CPI', result)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    try:
        html = get_bytes(PAGE, 2_000_000).decode('utf-8')
        url = discover_pdf(html)
        raw = get_bytes(url, MAX_PDF)
        data = parse_report(pdf_text(raw), url, hashlib.sha256(raw).hexdigest())
        changed = save_if_observations_changed(data) if args.apply else False
        count = sum(len(s['points']) for s in data['series'])
        print(f'{len(data["series"]) - 1} published areas plus state, {count} monthly observations; {data["first_month"]} to {data["last_month"]}.')
        year, month = map(int, data['last_month'].split('-'))
        today = dt.date.today()
        lag = 12 * (today.year - year) + today.month - month
        if lag >= 4:
            print(f'Latest published observation is {lag} months old; the source may be stale.')
            if os.environ.get('GITHUB_ACTIONS') == 'true':
                print('::warning::The latest Tamil Nadu district CPI observation is at least four months old.')
        print('Saved checked changes.' if changed else 'No files written.')
        return 0
    except (SourceError, OSError, ValueError, UnicodeError) as error:
        print(f'TN district CPI unavailable or incomplete ({type(error).__name__}). Previous snapshot retained.', file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
