#!/usr/bin/env python3
"""Discover bounded, unreviewed project leads from the current PIB release listing."""
import argparse
import datetime as dt
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from zoneinfo import ZoneInfo

URL = 'https://www.pib.gov.in/AllRelease.aspx?lang=1&reg=3'
OUT = Path(__file__).resolve().parents[1] / 'data' / 'pib_leads.js'
PREFIX = '/* Unreviewed PIB headline matches; not verified projects or land-price evidence. */\nwindow.BL_PIB_LEADS='
MAX_BYTES = 2_000_000
RETENTION_DAYS = 180
MAX_LEADS = 500
PLACE = re.compile(r'\b(?:tamil\s*nadu|maharashtra|chennai|coimbatore|madurai|pune|mumbai|nagpur|nashik|thane)\b', re.I)
INFRA = re.compile(r'\b(?:metro|highway|expressway|airport|infrastructure|road|railway|port|bypass|corridor)\b', re.I)
MILESTONE = re.compile(r'\b(?:projects?|approv\w*|foundation|inaugurat\w*|construct\w*|completion|completed|corridor)\b', re.I)
MONTHS = {name.lower(): n for n, name in enumerate(('January','February','March','April','May','June','July','August','September','October','November','December'), 1)}


class SourceError(Exception):
    pass


class ListingParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.current = None
        self.in_title = False
        self.in_date = False
        self.rows = []

    def handle_starttag(self, tag, attributes):
        attrs = dict(attributes)
        if tag == 'a':
            href = attrs.get('href', '')
            m = re.fullmatch(r'/PressReleseDetail\.aspx\?PRID=(\d+)', href, re.I)
            if m:
                if self.current is not None:
                    raise SourceError('release row missing its date')
                self.current = {'id': m.group(1), 'title': '', 'date': ''}
                self.in_title = True
        elif tag == 'span' and self.current is not None and 'publishdatesmall' in attrs.get('class', '').split():
            self.in_date = True

    def handle_endtag(self, tag):
        if tag == 'a':
            self.in_title = False
        elif tag == 'span' and self.in_date:
            self.in_date = False
            self.rows.append(self.current)
            self.current = None

    def handle_data(self, text):
        if self.current is not None:
            if self.in_date:
                self.current['date'] += text
                # The official page currently omits closing span tags in rows.
                if re.fullmatch(r'\s*Posted on:\s*\d{1,2}\s+[A-Za-z]{3}\s+\d{4}\s*', self.current['date'], re.I):
                    self.rows.append(self.current)
                    self.current = None
                    self.in_date = False
            elif self.in_title:
                self.current['title'] += text

    def finish(self):
        if self.current is not None and self.in_date:
            self.rows.append(self.current)
            self.current = None


def parse_listing(raw, today):
    if not raw or len(raw) > MAX_BYTES:
        raise SourceError('empty or oversized listing')
    text = raw.decode('utf-8', errors='replace')
    m = re.search(r'Displaying\s+(\d+)\s+Press Releases\s*<span[^>]*>\s*All Ministry\s+for ALL dates of\s+([A-Za-z]+)-(\d{4})', text, re.I)
    if not m or m.group(2).lower() not in MONTHS:
        raise SourceError('listing summary or period not found')
    expected = int(m.group(1))
    year, month = int(m.group(3)), MONTHS[m.group(2).lower()]
    if (year, month) != (today.year, today.month) or not 1 <= expected <= 5000:
        raise SourceError('listing is stale, empty or unexpectedly large')
    parser = ListingParser()
    parser.feed(text)
    parser.finish()
    if len(parser.rows) != expected or len({x['id'] for x in parser.rows}) != expected:
        raise SourceError('release count is incomplete or duplicated')
    leads = []
    for row in parser.rows:
        title = ' '.join(row['title'].split())
        if not title or len(title) > 500 or any(ord(c) < 32 for c in title):
            raise SourceError('invalid release title')
        date_match = re.fullmatch(r'Posted on:\s*(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})', row['date'].strip(), re.I)
        if not date_match:
            raise SourceError('release date missing or unrecognized')
        try:
            day = dt.datetime.strptime(date_match.group(0)[len('Posted on:'):].strip(), '%d %b %Y').date()
        except ValueError:
            raise SourceError('invalid release date') from None
        if (day.year, day.month) != (year, month) or day > today:
            raise SourceError('release date outside current listing period')
        if PLACE.search(title) and INFRA.search(title) and MILESTONE.search(title):
            leads.append({'id': row['id'], 'title': title, 'published': day.isoformat(),
                          'url': 'https://www.pib.gov.in/PressReleseDetail.aspx?PRID=' + row['id']})
    return expected, leads


def fetch():
    request = urllib.request.Request(URL, headers={'User-Agent': 'BhoomiLens/1.0 (+https://github.com/Hasen1506/Ideas)'})
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            final = urllib.parse.urlsplit(response.geturl())
            if final.scheme != 'https' or final.hostname != 'www.pib.gov.in' or final.port not in (None, 443) or final.path.lower() != '/allrelease.aspx':
                raise SourceError('unexpected source redirect')
            return response.read(MAX_BYTES + 1)
    except (OSError, urllib.error.URLError):
        raise SourceError('PIB listing unavailable') from None


def load_previous(path):
    if not path.exists():
        return []
    content = path.read_text(encoding='utf-8')
    if not content.startswith(PREFIX) or not content.endswith(';\n'):
        raise SourceError('existing snapshot format changed')
    value = json.loads(content[len(PREFIX):-2])
    rows = value.get('leads')
    if not isinstance(rows, list) or len(rows) > MAX_LEADS:
        raise SourceError('invalid existing snapshot')
    for row in rows:
        if (not isinstance(row, dict) or not re.fullmatch(r'\d+', str(row.get('id', ''))) or
                row.get('url') != 'https://www.pib.gov.in/PressReleseDetail.aspx?PRID=' + str(row['id']) or
                not isinstance(row.get('title'), str) or not row['title'] or len(row['title']) > 500):
            raise SourceError('invalid stored lead')
        dt.date.fromisoformat(row['published'])
    return rows


def merge_leads(previous, discovered, today):
    cutoff = today - dt.timedelta(days=RETENTION_DAYS)
    merged = {row['id']: row for row in previous if cutoff <= dt.date.fromisoformat(row['published']) <= today}
    for row in discovered:
        merged[row['id']] = row
    out = sorted(merged.values(), key=lambda row: (row['published'], row['id']), reverse=True)
    if len(out) > MAX_LEADS:
        raise SourceError('candidate limit exceeded; review retention policy')
    return out


def to_script(payload):
    encoded = json.dumps(payload, ensure_ascii=True, separators=(',', ':')).replace('<', '\\u003c')
    return PREFIX + encoded + ';\n'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true', help='Write only a changed validated snapshot')
    parser.add_argument('--output', type=Path, default=OUT)
    args = parser.parse_args()
    today = dt.datetime.now(ZoneInfo('Asia/Kolkata')).date()
    try:
        count, discovered = parse_listing(fetch(), today)
        previous = load_previous(args.output)
        leads = merge_leads(previous, discovered, today)
        print(f'PIB current-month listing: {count} releases checked, {len(discovered)} keyword leads; {len(leads)} retained.')
        print('Leads are unreviewed headlines, not verified project events or land-price evidence.')
        if args.apply and leads != previous:
            payload = {'publisher': 'Press Information Bureau, Government of India', 'last_change': today.isoformat(),
                       'retention_days': RETENTION_DAYS, 'source_url': URL, 'leads': leads}
            tmp = args.output.with_name(args.output.name + '.tmp')
            tmp.write_text(to_script(payload), encoding='utf-8')
            tmp.replace(args.output)
            print('Validated lead snapshot changed.')
        else:
            print('No data write.' if args.apply else 'Read-only check; no data write.')
    except (SourceError, OSError, ValueError, KeyError, TypeError) as error:
        print('PIB leads not changed:', error, file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
