#!/usr/bin/env python3
"""Fail the workflow when a source check was incomplete or found differences.

The actual retry and sample steps run first, so a verified recovery can be
saved even when a different source is unavailable. No records are read here.
"""
import argparse
import json
import sys
from pathlib import Path

from tn_rera_health import PAGES


def problems(sample, rera):
    errors = []
    keys = ('expected', 'selected', 'attempted', 'matched', 'different', 'unavailable')
    if (not isinstance(sample, dict) or any(type(sample.get(k)) is not int or sample[k] < 0 for k in keys)):
        errors.append('Guideline sample status is missing or malformed.')
    elif (sample['expected'] == 0 or sample['selected'] != sample['expected'] or
          sample['attempted'] != sample['selected'] or sample['matched'] != sample['attempted'] or
          sample['different'] != 0 or sample['unavailable'] != 0):
        errors.append('Guideline sample was incomplete, unavailable, or different; inspect the sample results.')
    if not isinstance(rera, dict) or set(rera) != set(PAGES) or any(value is not True for value in rera.values()):
        errors.append('At least one RERA page was unavailable or could not be verified.')
    return errors


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('sample', type=Path)
    parser.add_argument('rera', type=Path)
    args = parser.parse_args()
    try:
        with args.sample.open(encoding='utf-8') as f:
            sample = json.load(f)
        with args.rera.open(encoding='utf-8') as f:
            rera = json.load(f)
        errors = problems(sample, rera)
    except (OSError, ValueError):
        errors = ['A source status file could not be read; health is unconfirmed.']
    print('## Tamil Nadu source health')
    if errors:
        for error in errors:
            print(f'- {error}')
        print('Verified recoveries, if any, were handled before this health gate.')
        return 1
    print('The complete small guideline sample matched and both checked RERA pages responded.')
    print('This does not establish statewide or historical completeness.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
