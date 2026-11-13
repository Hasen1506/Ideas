#!/usr/bin/env python3
"""Read fixed NHB RESIDEX historical housing-index publications.

These are city-level housing indices, not land prices or sale records. The
base years and legacy methods are kept separate and the PDFs are not queried on a
schedule. Source values are transcribed with pdftotext and checked before any
output is written.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import urllib.error
import urllib.parse
import urllib.request

HOST = 'residex.nhbonline.org.in'
ROOT = 'https://' + HOST + '/DataUploadFormats/QuarterlyBooklet_English/'
SOURCES = [
    {
        'id': 'fy2012', 'base': 'FY 2012-13 = 100', 'start': 'Table below comprises of HPI@Assessment Prices computed for 50 cities',
        'end': 'APPENDIX 2', 'first': (2013, 2), 'count': 16,
        'url': ROOT + 'April13-June-13-To-January17-March-17.pdf',
    },
    {
        'id': 'fy2017', 'base': 'FY 2017-18 = 100', 'start': 'NHB RESIDEX – HPI@Assessment Price (Base year FY 2017-18)',
        'end': 'NHB RESIDEX – HPI@Market Price for Under Construction Properties', 'first': (2018, 2), 'count': 18,
        'url': ROOT + 'English%20Quaterly%20Booklet%20Jul-Sep%202022.pdf',
    },
]
ALIASES = {'Chandigarh(Tricity)': 'Chandigarh (Tricity)', 'MiraBhayander': 'Mira Bhayander',
           'NaviMumbai': 'Navi Mumbai', 'VasaiVirar': 'Vasai Virar'}
MAX_PDF = 8_000_000
DEFAULT_OUT = Path(__file__).resolve().parents[1] / 'data' / 'nhb_hpi_archive.js'
DEFAULT_TRANSCRIPT = Path(__file__).resolve().parents[1] / 'data' / 'nhb_hpi_transcribed.json'
DEFAULT_LEGACY = Path(__file__).resolve().parents[1] / 'data' / 'nhb_hpi_2007_transcribed.json'
LEGACY_URLS = [
    'https://www.nhb.org.in/events/nhb-residex-quarterly-update-january-march-2012-20-cities/',
    'https://www.nhb.org.in/events/nhb-residex-residential-housing-price-index-quarterly-update-january-march-2013-26-cities/',
    'https://www.nhb.org.in/data-graphs/',
]


class SourceError(Exception):
    pass


def get_pdf(url):
    request = urllib.request.Request(url, headers={'User-Agent': 'BhoomiLens/1.0 (+https://github.com/Hasen1506/Ideas)'})
    try:
        with urllib.request.urlopen(request, timeout=45) as response:
            final = urllib.parse.urlparse(response.geturl())
            if final.scheme != 'https' or final.hostname != HOST or final.port not in (None, 443) or final.query or final.fragment:
                raise SourceError('unexpected source redirect')
            raw = response.read(MAX_PDF + 1)
    except (OSError, urllib.error.URLError) as error:
        raise SourceError('official PDF unavailable: ' + type(error).__name__) from None
    if len(raw) > MAX_PDF or not raw.startswith(b'%PDF-'):
        raise SourceError('official source was not a PDF within the size limit')
    return raw


def pdf_text(raw):
    if not raw.startswith(b'%PDF-') or len(raw) > MAX_PDF:
        raise SourceError('invalid PDF')
    try:
        with tempfile.TemporaryDirectory() as directory:
            pdf = Path(directory) / 'report.pdf'
            pdf.write_bytes(raw)
            run = subprocess.run(['pdftotext', '-layout', str(pdf), '-'], capture_output=True, check=True, timeout=45)
        return run.stdout.decode('utf-8')
    except (OSError, subprocess.SubprocessError, UnicodeError):
        raise SourceError('could not extract PDF text') from None


def periods(year, quarter, count):
    out = []
    for _ in range(count):
        out.append(f'{year}-Q{quarter}')
        quarter += 1
        if quarter == 5:
            year += 1
            quarter = 1
    return out


def parse_table(text, spec, expected_cities=50):
    if text.count(spec['start']) != 1:
        raise SourceError('assessment table heading missing or ambiguous')
    part = text.split(spec['start'], 1)[1]
    if spec['end'] not in part:
        raise SourceError('assessment table end not found')
    part = part.split(spec['end'], 1)[0]
    # Verify the actual quarter headings, rather than silently assigning values
    # from a changed PDF layout to our fixed dates.
    first_line = next((line for line in part.splitlines() if ('Quarter Ending' in line or 'City Name' in line) and 'Jun-' in line), '')
    labels = re.findall(r'\b(?:Mar|Jun|Sep|Dec)-\d{2}\b', first_line)
    expected = periods(*spec['first'], spec['count'])
    qlabel = {'Q1': 'Mar', 'Q2': 'Jun', 'Q3': 'Sep', 'Q4': 'Dec'}
    if labels != [f"{qlabel[p[-2:]]}-{p[2:4]}" for p in expected]:
        raise SourceError('unexpected assessment table quarter headings')
    rows = {}
    for line in part.splitlines():
        fields = line.split()
        if len(fields) <= spec['count']:
            continue
        try:
            nums = [float(v) for v in fields[-spec['count']:]]
        except ValueError:
            continue
        name = ' '.join(fields[:-spec['count']])
        if not name or not all(math.isfinite(x) and 0 < x < 10000 for x in nums):
            raise SourceError('invalid assessment row')
        if name in rows:
            raise SourceError('duplicate city in assessment table')
        rows[name] = [int(x) if x.is_integer() else x for x in nums]
    if len(rows) != expected_cities or not {'Chennai', 'Coimbatore', 'Mumbai', 'Pune', 'Nagpur'}.issubset(rows):
        raise SourceError(f'incomplete assessment table: {len(rows)} cities')
    return rows


def extend_2017_series(series, transcription):
    if (transcription.get('publisher') != 'National Housing Bank' or
            transcription.get('measure') != 'HPI @ Assessment Prices' or
            transcription.get('base') != 'FY 2017-18 = 100'):
        raise SourceError('unexpected transcribed series metadata')
    tables = transcription.get('tables')
    starts = [(2022, 3), (2023, 3), (2024, 3)]
    if not isinstance(tables, list) or len(tables) != len(starts):
        raise SourceError('unexpected transcribed table count')
    aliases = {'Bidhan Nagar (Excluding Rajarhat)': 'Bidhan Nagar', 'Chandigarh (Tricity)': 'Chandigarh'}
    series['sources'] = [{'from': series['periods'][0], 'to': series['periods'][-1],
                          'url': series['source_url'], 'source_sha256': series['source_sha256']}]
    for table, start in zip(tables, starts, strict=True):
        expected = periods(*start, 5)
        url = urllib.parse.urlparse(table.get('source_url', ''))
        if (url.scheme != 'https' or url.hostname != 'www.nhb.org.in' or url.port not in (None, 443)
                or url.query or url.fragment or not url.path.startswith('/wp-content/') or not url.path.endswith('.pdf')):
            raise SourceError('unexpected transcribed publication URL')
        if table.get('periods') != expected or series['periods'][-1] != expected[0]:
            raise SourceError('transcribed publication periods do not match')
        cities = table.get('cities')
        if not isinstance(cities, dict) or len(cities) != 50:
            raise SourceError('incomplete transcribed city table')
        normal = {}
        for name, values in cities.items():
            name = aliases.get(name, name)
            if (name in normal or not isinstance(values, list) or len(values) != 5 or
                    not all(isinstance(x, (int, float)) and not isinstance(x, bool) and math.isfinite(x) and 0 < x < 10000 for x in values)):
                raise SourceError('invalid transcribed city values')
            normal[name] = values
        if set(normal) != set(series['cities']):
            raise SourceError('transcribed city names differ from archive')
        for name, values in normal.items():
            # The 2022 booklet prints two decimals for its latest quarter;
            # later annual tables round that same value to a whole number.
            if abs(series['cities'][name][-1] - values[0]) > 0.51:
                raise SourceError('overlapping NHB publications disagree: ' + name)
        for name, values in normal.items():
            series['cities'][name].extend(values[1:])
        series['periods'].extend(expected[1:])
        series['sources'].append({'from': expected[1], 'to': expected[-1], 'url': table['source_url'],
                                  'method': 'official PDF text retrieved through a search index; source bytes unavailable locally'})


def legacy_series(transcription):
    """Merge independently published 2007-base tables only where they agree."""
    if (transcription.get('publisher') != 'National Housing Bank' or
            transcription.get('measure') != 'NHB RESIDEX legacy city housing index' or
            transcription.get('base') != '2007 = 100'):
        raise SourceError('unexpected legacy series metadata')
    tables = transcription.get('tables')
    expected_periods = [
        ['2008-H1', '2008-H2', '2009-H1', '2009-H2'] + periods(2010, 1, 9),
        periods(2011, 1, 9), periods(2012, 4, 10),
    ]
    if not isinstance(tables, list) or len(tables) != 3:
        raise SourceError('unexpected legacy table count')
    all_periods = ['2008-H1', '2008-H2', '2009-H1', '2009-H2'] + periods(2010, 1, 21)
    cities = {}
    aliases = {'Bhubaneshwar': 'Bhubaneswar', 'Bhubneshwar': 'Bhubaneswar'}
    sources = []
    for table, expected, url, count in zip(tables, expected_periods, LEGACY_URLS, (20, 26, 26), strict=True):
        if table.get('source_url') != url or table.get('periods') != expected:
            raise SourceError('unexpected legacy source or period headings')
        rows = table.get('cities')
        if not isinstance(rows, dict) or len(rows) != count:
            raise SourceError('incomplete legacy table')
        seen = set()
        for raw_name, values in rows.items():
            name = aliases.get(raw_name, raw_name)
            if name in seen or not isinstance(values, list) or len(values) != len(expected):
                raise SourceError('invalid legacy city row')
            seen.add(name)
            row = cities.setdefault(name, [None] * len(all_periods))
            for p, value in zip(expected, values, strict=True):
                if value is None:
                    continue
                if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or not 0 < value < 10000:
                    raise SourceError('invalid legacy index value')
                index = all_periods.index(p)
                if row[index] is not None and row[index] != value:
                    raise SourceError('overlapping legacy publications disagree: ' + name + ' ' + p)
                row[index] = value
        sources.append({'from': expected[0], 'to': expected[-1], 'url': url,
                        'method': 'official page text retrieved through a search index; source bytes unavailable locally'})
    if (len(cities) != 26 or not {'Chennai', 'Coimbatore', 'Mumbai', 'Pune', 'Nagpur'}.issubset(cities)
            or sum(v is not None for row in cities.values() for v in row) != 494):
        raise SourceError('unexpected legacy series coverage')
    return {'id': 'base2007', 'base': '2007 = 100', 'periods': all_periods,
            'cities': cities, 'source_url': LEGACY_URLS[0], 'sources': sources,
            'measure': 'Legacy NHB RESIDEX city housing price index'}


def build(raw_pdfs, transcription, legacy):
    series = []
    for spec, raw in zip(SOURCES, raw_pdfs, strict=True):
        cities = parse_table(pdf_text(raw), spec)
        series.append({'id': spec['id'], 'base': spec['base'], 'periods': periods(*spec['first'], spec['count']),
                       'cities': cities, 'source_url': spec['url'], 'source_sha256': hashlib.sha256(raw).hexdigest()})
    extend_2017_series(series[1], transcription)
    return {'publisher': 'National Housing Bank', 'measure': 'NHB RESIDEX city housing indices',
            'description': 'City-level housing indices; not vacant-land prices.',
            'city_name_aliases': ALIASES, 'series': [legacy_series(legacy)] + series}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=DEFAULT_OUT)
    parser.add_argument('--historic-pdf', type=Path, help='Use an already downloaded official 2013–17 booklet')
    parser.add_argument('--recent-pdf', type=Path, help='Use an already downloaded official 2018–22 booklet')
    parser.add_argument('--transcriptions', type=Path, default=DEFAULT_TRANSCRIPT, help='Checked official annual-report tables')
    parser.add_argument('--legacy-transcriptions', type=Path, default=DEFAULT_LEGACY, help='Checked official 2007-base tables')
    args = parser.parse_args()
    try:
        files = [args.historic_pdf, args.recent_pdf]
        raw = [p.read_bytes() if p else get_pdf(spec['url']) for p, spec in zip(files, SOURCES, strict=True)]
        data = build(raw, json.loads(args.transcriptions.read_text(encoding='utf-8')),
                     json.loads(args.legacy_transcriptions.read_text(encoding='utf-8')))
        out = '/* National Housing Bank RESIDEX; city housing indices, not land prices. */\nwindow.BL_NHB_HPI_ARCHIVE=' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';\n'
        tmp = args.output.with_name(args.output.name + '.tmp')
        tmp.write_text(out, encoding='utf-8')
        tmp.replace(args.output)
        print('Validated historical NHB housing-index series:', ', '.join(f"{s['id']}: {len(s['cities'])} cities, {len(s['periods'])} periods" for s in data['series']))
    except (SourceError, OSError, ValueError, TypeError) as error:
        print('NHB archive not changed:', error, file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
