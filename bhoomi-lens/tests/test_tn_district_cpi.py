"""Check official report discovery and fail-closed district CPI parsing."""
import sys
import tempfile
import copy
import io
import unittest
import urllib.error
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import collect_macro
import collect_tn_district_cpi as cpi


def page(year=23, names=None, values=None, base='2019-2020=100'):
    names = names or [f'Area {n}' for n in range(1, 33)]
    months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    headers = ' '.join(f"{month}'{year:02d}" for month in months)
    values = values or ['120.0'] * 12
    rows = '\n'.join(f'{n:2d} {name}  ' + ' '.join(values) for n, name in enumerate(names, 1))
    return (f'TAMIL NADU CONSUMER PRICE INDEX (COMBINED)\nBase Year:{base}\n'
            f'District  {headers}\n{rows}\nTamil Nadu  ' + ' '.join(values) + '\n'
            'Source: Compiled and Released by DES , Chennai.\n')


class DistrictCPITests(unittest.TestCase):
    def test_discovery_requires_one_official_index_report(self):
        text = ('<tr><td>Consumer Price Index(Rural / Urban/Combined) Index_State Series</td>'
                '<td><a href="/sites/default/files/cpi.pdf">View</a></td></tr>')
        self.assertTrue(cpi.discover_pdf(text).endswith('/cpi.pdf'))
        with self.assertRaises(cpi.SourceError): cpi.discover_pdf(text + text)
        with self.assertRaises(cpi.SourceError): cpi.discover_pdf(text.replace('/sites/default/files/cpi.pdf', 'https://other.example/cpi.pdf'))
        with self.assertRaises(cpi.SourceError): cpi.discover_pdf(text.replace('Index_State', 'InflationState'))

    def test_keeps_area_labels_months_and_missing_values(self):
        values = ['120.0'] * 12
        values[1] = '-'
        result = cpi.parse_report(page(values=values), 'https://des.tn.gov.in/sites/default/files/cpi.pdf', 'a' * 64)
        self.assertEqual(len(result['series']), 33)
        self.assertEqual(result['first_month'], '2023-01')
        self.assertEqual(result['last_month'], '2023-12')
        self.assertEqual(result['series'][1]['area'], 'Area 1')
        self.assertIsNone(result['series'][1]['points'][1][1])
        self.assertIn('not land prices', result['scope'])

    def test_bad_or_incomplete_sources_never_become_results(self):
        names = [f'Area {n}' for n in range(1, 33)]
        cases = [page(base='2024=100'), page(names=names[:-1]),
                 page(values=['not-a-number'] * 12), page() + '\f' + page(),
                 page() + '\f' + page(25), page() + '\f' + page(24, names=names[:-1] + ['Renamed'])]
        for text in cases:
            with self.subTest(case=text[:100]), self.assertRaises(cpi.SourceError):
                cpi.parse_report(text, 'https://des.tn.gov.in/sites/default/files/cpi.pdf', 'a' * 64)
        with self.assertRaises(cpi.SourceError):
            cpi.parse_report(page(), 'https://evil.example/cpi.pdf', 'a' * 64)

    def test_unchanged_observations_do_not_create_new_snapshot_for_pdf_metadata_changes(self):
        result = cpi.parse_report(page(), 'https://des.tn.gov.in/sites/default/files/cpi.pdf', 'a' * 64)
        with tempfile.TemporaryDirectory() as directory, patch.object(collect_macro, 'DATA', Path(directory)):
            self.assertTrue(cpi.save_if_observations_changed(result))
            path = Path(directory) / 'tn_district_cpi.js'
            before = path.read_text()
            changed_pdf = dict(result, document_sha256='b' * 64)
            self.assertFalse(cpi.save_if_observations_changed(changed_pdf))
            self.assertEqual(path.read_text(), before)
            updated = copy.deepcopy(result)
            updated['series'][1]['points'][0][1] = 121.0
            self.assertTrue(cpi.save_if_observations_changed(updated))

    def test_new_report_cannot_silently_discard_prior_history(self):
        url = 'https://des.tn.gov.in/sites/default/files/cpi.pdf'
        old = cpi.parse_report(page() + '\f' + page(24), url, 'a' * 64)
        shorter = cpi.parse_report(page(24), url, 'b' * 64)
        with tempfile.TemporaryDirectory() as directory, patch.object(collect_macro, 'DATA', Path(directory)):
            self.assertTrue(cpi.save_if_observations_changed(old))
            before = (Path(directory) / 'tn_district_cpi.js').read_text()
            with self.assertRaises(cpi.SourceError):
                cpi.save_if_observations_changed(shorter)
            self.assertEqual((Path(directory) / 'tn_district_cpi.js').read_text(), before)

    def test_transient_network_failure_retries_without_accepting_other_hosts(self):
        class Response(io.BytesIO):
            def geturl(self): return cpi.PAGE
        with patch.object(cpi.urllib.request, 'urlopen', side_effect=[urllib.error.URLError('timeout'), Response(b'valid')]) as fetch, \
             patch.object(cpi.time, 'sleep'):
            self.assertEqual(cpi.get_bytes(cpi.PAGE, 10), b'valid')
            self.assertEqual(fetch.call_count, 2)
        with self.assertRaises(cpi.SourceError):
            cpi.get_bytes('https://other.example/file.pdf', 10)


if __name__ == '__main__':
    unittest.main()
