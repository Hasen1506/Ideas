#!/usr/bin/env python3
"""Check a few public PIB project-discovery sources without downloading an archive."""
import sys
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

MAX_BYTES = 2_000_000
PROBES = (
    ('older release', 'https://www.pib.gov.in/newsite/erelcontent.aspx?lang=2&reg=48&relid=47781', 'older'),
    ('recent release', 'https://www.pib.gov.in/PressReleasePage.aspx?PRID=2154140&lang=2&reg=48', 'recent'),
    ('press-release RSS', 'https://pib.gov.in/RssMain.aspx?ModId=6&Lang=1&Regid=1', 'rss'),
)


def validate(body, kind):
    if not body or len(body) > MAX_BYTES:
        raise ValueError('empty or oversized response')
    if kind == 'rss':
        try:
            root = ET.fromstring(body)
        except ET.ParseError:
            raise ValueError('response is not an RSS or Atom feed') from None
        name = root.tag.rsplit('}', 1)[-1].lower()
        if name not in ('rss', 'feed') or not any(x.tag.rsplit('}', 1)[-1].lower() in ('item', 'entry') for x in root.iter()):
            raise ValueError('feed is empty or has an unexpected structure')
        return
    text = body.decode('utf-8', errors='replace').casefold()
    required = ('chennai metro', '2009') if kind == 'older' else ('marakkanam', 'puducherry', '2025')
    if not all(x in text for x in required):
        raise ValueError('expected release text was not present')


def fetch(url):
    request = urllib.request.Request(url, headers={'User-Agent': 'BhoomiLens source-health check (+https://github.com/Hasen1506/Ideas)'})
    with urllib.request.urlopen(request, timeout=15) as response:
        final = urllib.parse.urlsplit(response.geturl())
        if final.scheme != 'https' or final.hostname not in ('pib.gov.in', 'www.pib.gov.in') or final.port not in (None, 443):
            raise ValueError('unexpected source redirect')
        return response.read(MAX_BYTES + 1)


def main():
    failures = 0
    for name, url, kind in PROBES:
        try:
            validate(fetch(url), kind)
            print(f'{name}: available and recognizable')
        except (urllib.error.URLError, OSError, ValueError) as error:
            failures += 1
            print(f'{name}: unavailable or unrecognized ({type(error).__name__})')
    print('No source data was stored or published.')
    return 1 if failures else 0


if __name__ == '__main__':
    sys.exit(main())
