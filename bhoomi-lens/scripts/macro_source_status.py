#!/usr/bin/env python3
"""Report partial economic-source outages after checked updates are saved."""
import argparse
import json
import sys
from pathlib import Path


def healthy(status):
    return status == {'cpi': 'ok', 'worldbank': 'ok'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('status', type=Path)
    args = parser.parse_args()
    try:
        with args.status.open(encoding='utf-8') as f:
            status = json.load(f)
    except (OSError, ValueError):
        status = None
    print('## Economic source health')
    if not healthy(status):
        print('At least one source is unavailable or unconfirmed; the last checked snapshot was retained.')
        print('Independently verified updates, if any, were handled before this health gate.')
        return 1
    print('Both economic sources responded with complete, checked series.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
