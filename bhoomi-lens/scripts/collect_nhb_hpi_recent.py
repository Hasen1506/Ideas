#!/usr/bin/env python3
"""Collect the latest NHB press-release housing-index highlights.

The seven city figures are year-on-year changes in NHB's housing assessment
index, not vacant-land prices or individual transactions. Never replace the
previous snapshot when discovery, a PDF, or validation fails.
"""
import argparse
import calendar
import datetime as dt
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import sys
import urllib.error
import urllib.parse
import urllib.request

from collect_nhb_hpi_archive import HOST, SourceError, pdf_text

PAGE = 'https://residex.nhbonline.org.in/DashboardBY2024/DashboardBY2024'
MAX_PAGE, MAX_PDF = 1_000_000, 3_000_000
OUTPUT = Path(__file__).resolve().parents[1] / 'data' / 'nhb_hpi_recent.js'
PREFIX = 'window.BL_NHB_HPI_RECENT='
HEADER = '/* National Housing Bank RESIDEX press-release highlights; housing, not land prices. */\n'
CITIES = ('Ahmedabad', 'Bengaluru', 'Chennai', 'Hyderabad', 'Kolkata', 'Mumbai', 'Pune')
QUARTERS = {'January-March': (1, 'Jan', 'Mar'), 'April-June': (2, 'Apr', 'Jun'),
            'July-September': (3, 'Jul', 'Sep'), 'October-December': (4, 'Oct', 'Dec')}


class Links(HTMLParser):
    def __init__(self):
        super().__init__()
        self.hrefs = []

    def handle_starttag(self, tag, attrs):
        if tag.lower() == 'a':
            href = dict(attrs).get('href')
            if href:
                self.hrefs.append(href)


def discover(html, today=None):
    if 'Base Year FY 2024-25' not in html:
        raise SourceError('the dashboard no longer identifies its 2024–25 base')
    advertised_bases = [int(x) for x in re.findall(r'/DashboardBY(\d{4})/DashboardBY\d{4}', html)]
    if advertised_bases and max(advertised_bases) > 2024:
        raise SourceError('a newer index base is advertised; review before collecting')
    parser = Links()
    parser.feed(html)
    found = {}
    for href in parser.hrefs:
        parsed = urllib.parse.urlsplit(href)
        if parsed.query or parsed.fragment or (parsed.netloc and (parsed.scheme != 'https' or parsed.hostname != HOST)):
            continue
        path = urllib.parse.unquote(parsed.path)
        m = re.fullmatch(r'/DataUploadFormats/PressRelease_English/Press Release (January-March|April-June|July-September|October-December) (\d{4})\.pdf', path, re.I)
        if not m:
            continue
        name = next(k for k in QUARTERS if k.lower() == m[1].lower())
        year, quarter = int(m[2]), QUARTERS[name][0]
        if year < 2026:
            continue
        now = today or dt.date.today()
        last_month = quarter * 3
        if dt.date(year, last_month, calendar.monthrange(year, last_month)[1]) > now:
            raise SourceError('dashboard lists an unfinished reporting quarter')
        url = 'https://' + HOST + urllib.parse.quote(path, safe='/-._~')
        found[(year, quarter)] = (url, name)
    if not found:
        raise SourceError('no current-base quarterly press release found')
    year, quarter = max(found)
    url, name = found[(year, quarter)]
    return {'period': f'{year}-Q{quarter}', 'year': year, 'quarter': quarter,
            'start_month': QUARTERS[name][1], 'end_month': QUARTERS[name][2], 'url': url}


def get_bytes(url, limit):
    source = urllib.parse.urlparse(url)
    if source.scheme != 'https' or source.hostname != HOST or source.port not in (None, 443) or source.query or source.fragment:
        raise SourceError('unexpected source URL')
    req = urllib.request.Request(url, headers={'User-Agent': 'BhoomiLens/1.0 (+https://github.com/Hasen1506/Ideas)'})
    try:
        with urllib.request.urlopen(req, timeout=45) as response:
            final = urllib.parse.urlparse(response.geturl())
            if final.scheme != 'https' or final.hostname != HOST or final.port not in (None, 443) or final.query or final.fragment:
                raise SourceError('unexpected source redirect')
            result = response.read(limit + 1)
    except (OSError, urllib.error.URLError) as error:
        raise SourceError('official source unavailable: ' + type(error).__name__) from None
    if len(result) > limit:
        raise SourceError('official source exceeded the size limit')
    return result


def parse_release(text, spec):
    text = re.sub(r'\s+', ' ', text.replace('’', "'").replace('–', '-'))
    period_pattern = rf"\b{spec['start_month']}\s*-\s*{spec['end_month']}\s+{spec['year']}\b"
    if not re.search(period_pattern, text, re.I):
        raise SourceError('the report does not confirm the selected quarter')
    m = re.search(r"India.s seven key primary residential markets(.*?)Housing Price Index published by the National Housing Bank", text, re.I)
    if not m or not re.search(r'annual basis', m[1], re.I) or 'Assessment Prices' not in text:
        raise SourceError('the report no longer contains the expected annual assessment-index highlights')
    figures = {}
    for city in CITIES:
        matches = re.findall(rf'\b{re.escape(city)}\s*\(\s*(-?\d+(?:\.\d+)?)\s*%\s*\)', m[1], re.I)
        if len(matches) != 1:
            raise SourceError(f'missing or ambiguous city figure: {city}')
        value = float(matches[0])
        if not -100 <= value <= 1000:
            raise SourceError(f'city figure out of range: {city}')
        figures[city] = value
    return figures


def read_existing(path):
    if not path.exists():
        return {'publisher': 'National Housing Bank', 'measure': 'HPI @ Assessment Prices', 'releases': []}
    text = path.read_text(encoding='utf-8')
    if not text.startswith(HEADER + PREFIX) or not text.endswith(';\n'):
        raise SourceError('existing data file has an unexpected format')
    try:
        data = json.loads(text[len(HEADER + PREFIX):-2])
        if data['publisher'] != 'National Housing Bank' or not isinstance(data['releases'], list):
            raise ValueError()
        return data
    except (KeyError, ValueError, TypeError):
        raise SourceError('existing data file is invalid') from None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true', help='Write only after a validated source change')
    parser.add_argument('--output', type=Path, default=OUTPUT)
    args = parser.parse_args()
    try:
        html = get_bytes(PAGE, MAX_PAGE).decode('utf-8')
        spec = discover(html)
        pdf = get_bytes(spec['url'], MAX_PDF)
        figures = parse_release(pdf_text(pdf), spec)
        data = read_existing(args.output)
        entry = {'period': spec['period'], 'base': 'FY 2024-25 = 100', 'source_url': spec['url'],
                 'source_sha256': hashlib.sha256(pdf).hexdigest(), 'city_yoy_pct': figures}
        old = next((x for x in data['releases'] if x.get('period') == entry['period']), None)
        if old == entry:
            print(f"NHB {entry['period']}: unchanged; no data write.")
            return 0
        if data['releases'] and entry['period'] < max(x['period'] for x in data['releases']):
            raise SourceError('the source moved backwards to an older quarter')
        data['releases'] = sorted([x for x in data['releases'] if x.get('period') != entry['period']] + [entry], key=lambda x: x['period'])
        if args.apply:
            out = HEADER + PREFIX + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';\n'
            tmp = args.output.with_name(args.output.name + '.tmp')
            tmp.write_text(out, encoding='utf-8')
            tmp.replace(args.output)
            print(f"NHB {entry['period']}: saved {len(figures)} city highlights from the official press release.")
        else:
            print(f"NHB {entry['period']}: {len(figures)} validated city highlights; dry run, no data write.")
    except (SourceError, OSError, UnicodeError) as error:
        print('NHB update not saved:', error, file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
