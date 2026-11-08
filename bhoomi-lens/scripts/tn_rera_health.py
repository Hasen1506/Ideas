#!/usr/bin/env python3
"""Check two official TNRERA pages; this does not collect project records."""
import re
import urllib.error
import urllib.request

PAGES = {
    'building 2024': 'https://rera.tn.gov.in/registered-building/tn?year=2024',
    'legacy building 2018': 'https://rera.tn.gov.in/cms/reg_projects_tamilnadu/Building/2018.php',
}
ID = re.compile(r'TN\s*/\s*\d+\s*/\s*(?:Building|BLG|Layout)\s*/\s*\d+\s*/\s*20\d{2}', re.I)


def classify(status, html):
    if status != 200:
        return f'unavailable (HTTP {status})'
    if 'captcha' in html.lower() or 'error page' in html.lower():
        return 'unavailable (error or access challenge)'
    return 'registration identifier found; parser and coverage still require verification' if ID.search(html) else 'unconfirmed page; no recognizable registration identifier'


def main():
    for label, url in PAGES.items():
        try:
            request = urllib.request.Request(url, headers={'User-Agent': 'BhoomiLens/1.0 (+https://github.com/Hasen1506/Ideas)'})
            with urllib.request.urlopen(request, timeout=15) as response:
                if not response.geturl().startswith('https://rera.tn.gov.in/'):
                    raise ValueError('unexpected redirect')
                result = classify(response.status, response.read(2_000_000).decode('utf-8', errors='replace'))
        except urllib.error.HTTPError as exc:
            result = f'unavailable (HTTP {exc.code})'
        except (urllib.error.URLError, OSError, ValueError) as exc:
            result = f'unavailable ({type(exc).__name__})'
        print(f'{label}: {result}', flush=True)
    print('A successful page alone does not establish a complete historical dataset.', flush=True)


if __name__ == '__main__':
    main()
