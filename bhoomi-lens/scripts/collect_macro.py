#!/usr/bin/env python3
"""Collect bounded public CPI and World Bank series for background context.

This is not a land-price or property-transaction feed. Download entire, checked
series first; preserve the previous snapshot if an API is incomplete or fails.
"""
import argparse
import datetime as dt
import json
import math
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'data'
GEOS = {'All India', 'Tamil Nadu', 'Maharashtra'}
MONTHS = {name: i for i, name in enumerate(
    ('January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'), 1)}
CPI_URL = 'https://api.mospi.gov.in/api/cpi/'
WB_URL = 'https://api.worldbank.org/v2/country/IND/indicator/'
WB_INDICATORS = {
    'SP.POP.TOTL': ('Population', 'persons'),
    'SP.URB.TOTL.IN.ZS': ('Urban population share', 'percent of India population'),
    'NY.GDP.MKTP.KD.ZG': ('Real GDP growth', 'annual percent'),
    'NY.GDP.PCAP.KD': ('Real GDP per person', 'constant US dollars'),
    'FP.CPI.TOTL.ZG': ('Consumer inflation', 'annual percent'),
}


class SourceError(Exception):
    pass


def get_json(url):
    if not (url.startswith(CPI_URL) or url.startswith(WB_URL)):
        raise SourceError('unexpected API host')
    last = None
    for attempt in range(3):
        try:
            request = urllib.request.Request(url, headers={'Accept': 'application/json', 'User-Agent': 'BhoomiLens-data/1.0 (+https://github.com/Hasen1506/Ideas)'})
            with urllib.request.urlopen(request, timeout=20) as response:
                if not (response.geturl().startswith(CPI_URL) or response.geturl().startswith(WB_URL)):
                    raise SourceError('unexpected redirect')
                raw = response.read(2_000_001)
            if len(raw) > 2_000_000:
                raise SourceError('response exceeds size limit')
            return json.loads(raw.decode('utf-8'))
        except (urllib.error.URLError, OSError, ValueError, SourceError) as error:
            last = error
            if attempt < 2:
                time.sleep(1 + attempt)
    raise SourceError(f'API unavailable or invalid ({type(last).__name__})')


def cpi_pages(path, params, fetch=get_json):
    """Fetch every page and reject empty, partial or inconsistent API output."""
    records, expected, pages = [], None, None
    for page in range(1, 21):
        query = dict(params, page=str(page), limit='100', Format='JSON')
        payload = fetch(CPI_URL + path + '?' + urllib.parse.urlencode(query))
        if not isinstance(payload, dict) or payload.get('statusCode') is not True:
            raise SourceError('CPI API did not return a successful response')
        meta, batch = payload.get('meta_data'), payload.get('data')
        if not isinstance(meta, dict) or not isinstance(batch, list):
            raise SourceError('CPI pagination metadata missing')
        try:
            count, total_pages, actual_page = int(meta['totalRecords']), int(meta['totalPages']), int(meta['page'])
        except (KeyError, TypeError, ValueError):
            raise SourceError('invalid CPI pagination metadata')
        if actual_page != page or count < 1 or not 1 <= total_pages <= 20 or not batch:
            raise SourceError('empty or invalid CPI page')
        if expected is None:
            expected, pages = count, total_pages
        if expected != count or pages != total_pages:
            raise SourceError('CPI count changed during pagination')
        records.extend(batch)
        if page == pages:
            if len(records) != expected:
                raise SourceError('incomplete CPI result')
            return records
    raise SourceError('CPI page budget exceeded')


def finite_number(value, positive=False):
    if value is None or str(value).strip() in ('', '-', 'NA', 'N/A', 'null'):
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        raise SourceError('invalid numeric value')
    if not math.isfinite(number) or (positive and number <= 0):
        raise SourceError('invalid numeric value')
    return number


def collect_cpi(fetch=get_json):
    # Codes differ across CPI base years; retain each base and back-series separately.
    specs = [
        ('2012', 'Back', 'getCPIIndex', {'state_code': '33,27,99', 'group_code': '0', 'subgroup_code': '0.99'}, GEOS),
        ('2012', 'Current', 'getCPIIndex', {'state_code': '33,27,99', 'group_code': '0', 'subgroup_code': '0.99'}, GEOS),
        ('2024', 'Back', 'getCPIData', {'state_code': '31,20,1', 'division_code': '0'}, {'All India'}),
        ('2024', 'Current', 'getCPIData', {'state_code': '31,20,1', 'division_code': '0'}, GEOS),
    ]
    series = []
    for base, vintage, path, filters, required_geos in specs:
        params = dict(base_year=base, series=vintage, sector_code='3', **filters)
        rows = cpi_pages(path, params, fetch)
        grouped = {geo: [] for geo in GEOS}
        keys = set()
        for row in rows:
            if not isinstance(row, dict):
                raise SourceError('invalid CPI record')
            geo = row.get('state')
            actual_base = str(row.get('baseyear') or row.get('base_year') or '')
            if geo not in GEOS or actual_base != base or row.get('sector') != 'Combined':
                raise SourceError('unexpected CPI geography, base or sector')
            if base == '2012' and (row.get('group') != 'General' or row.get('subgroup') != 'General-Overall'):
                raise SourceError('unexpected CPI group')
            if base == '2024' and (row.get('division') != 'CPI (General)' or row.get('series') != vintage):
                raise SourceError('unexpected CPI division or series')
            try:
                year, month = int(row['year']), MONTHS[row['month']]
            except (KeyError, ValueError, TypeError):
                raise SourceError('invalid CPI observation date')
            if not 2010 <= year <= dt.date.today().year:
                raise SourceError('CPI observation date out of bounds')
            date = f'{year:04d}-{month:02d}'
            if (geo, date) in keys:
                raise SourceError('duplicate CPI geography and period')
            keys.add((geo, date))
            grouped[geo].append([date, finite_number(row.get('index'), positive=True), finite_number(row.get('inflation')), row.get('status') or None])
        if any(not grouped[geo] for geo in required_geos):
            raise SourceError('a required CPI geography is missing')
        for geo in sorted(geo for geo in grouped if grouped[geo]):
            series.append({'geo': geo, 'base': base, 'series': vintage, 'points': sorted(grouped[geo])})
    return {
        'source': 'Ministry of Statistics and Programme Implementation (MoSPI), Consumer Price Index',
        'source_url': 'https://esankhyiki.mospi.gov.in/macroindicators?product=cpi',
        'api_url': CPI_URL,
        'unit': 'index, specified base year = 100; year-on-year inflation in percent',
        'scope': 'Monthly general consumer prices, combined rural and urban; not property or land prices.',
        'vintage_note': 'Current and official back series are separate; source release dates and historical publication vintages are not supplied.',
        'series': series,
    }


def collect_worldbank(fetch=get_json):
    series = []
    for code, (name, unit) in WB_INDICATORS.items():
        query = urllib.parse.urlencode({'format': 'json', 'per_page': '200'})
        payload = fetch(WB_URL + code + '?' + query)
        if not isinstance(payload, list) or len(payload) != 2 or not isinstance(payload[0], dict) or not isinstance(payload[1], list):
            raise SourceError('invalid World Bank response')
        meta, rows = payload
        if int(meta.get('pages', 0)) != 1 or int(meta.get('total', -1)) != len(rows) or len(rows) < 20:
            raise SourceError('incomplete World Bank indicator')
        points, years = [], set()
        for row in rows:
            if row.get('countryiso3code') != 'IND' or row.get('indicator', {}).get('id') != code:
                raise SourceError('unexpected World Bank country or indicator')
            try:
                year = int(row['date'])
            except (KeyError, TypeError, ValueError):
                raise SourceError('invalid World Bank year')
            if year in years or not 1950 <= year <= dt.date.today().year:
                raise SourceError('invalid or repeated World Bank year')
            years.add(year)
            points.append([year, finite_number(row.get('value'))])
        if not any(v is not None for _, v in points):
            raise SourceError('World Bank indicator has no observations')
        series.append({'code': code, 'name': name, 'unit': unit, 'points': sorted(points)})
    return {
        'source': 'World Bank, World Development Indicators',
        'source_url': 'https://data.worldbank.org/country/india',
        'api_url': 'https://api.worldbank.org/v2/country/IND/indicator/',
        'license_url': 'https://data.worldbank.org/summary-terms-of-use',
        'scope': 'Annual India-wide indicators; not state or district observations and not land prices.',
        'vintage_note': 'Latest API values can be revised. Observation year is not the publication date.',
        'series': series,
    }


def save_if_changed(filename, global_name, result, now=None):
    path = DATA / filename
    prefix = 'window.' + global_name + '='
    old = None
    try:
        text = path.read_text(encoding='utf-8')
        if text.startswith(prefix):
            old = json.loads(text[len(prefix):].strip().rstrip(';'))
    except (OSError, ValueError):
        pass
    if old and {k: v for k, v in old.items() if k != 'captured_utc'} == result:
        return False
    result = dict(result, captured_utc=now or dt.datetime.now(dt.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'))
    text = prefix + json.dumps(result, ensure_ascii=False, separators=(',', ':'), sort_keys=True) + ';\n'
    tmp = path.with_suffix(path.suffix + '.tmp')
    tmp.write_text(text, encoding='utf-8')
    os.replace(tmp, path)
    return True


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--source', choices=('all', 'cpi', 'worldbank'), default='all')
    args = parser.parse_args()
    sources = [('cpi', collect_cpi, 'macro_cpi.js', 'BL_MACRO_CPI'), ('worldbank', collect_worldbank, 'macro_worldbank.js', 'BL_MACRO_WB')]
    succeeded, failed = 0, 0
    for name, collect, filename, global_name in sources:
        if args.source not in ('all', name):
            continue
        try:
            result = collect()
            count = sum(len(s['points']) for s in result['series'])
            changed = save_if_changed(filename, global_name, result) if args.apply else False
            print(f'{name}: {len(result["series"])} checked series, {count} observations; ' + ('saved changes' if changed else 'no files written'), flush=True)
            succeeded += 1
        except (SourceError, OSError, ValueError, TypeError, KeyError) as error:
            failed += 1
            print(f'{name}: unavailable or incomplete ({type(error).__name__}: {str(error)[:120]}). Previous snapshot retained.', flush=True)
            if os.environ.get('GITHUB_ACTIONS') == 'true':
                print(f'::warning::{name} source unavailable or incomplete; previous snapshot retained.', flush=True)
    if not succeeded:
        return 1
    if failed:
        print(f'{failed} source(s) failed; successful sources were handled independently.', flush=True)
    return 0


if __name__ == '__main__':
    sys.exit(main())
