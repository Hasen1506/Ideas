"""Check provenance, pagination, source validation and no-change writes."""
import json
import sys
import tempfile
import unittest
import urllib.parse
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import collect_macro as macro


def page(number, total, rows, pages):
    return {'statusCode': True, 'data': rows, 'meta_data': {'page': number, 'totalRecords': total, 'totalPages': pages}}


class MacroTests(unittest.TestCase):
    def test_cpi_pagination_requires_every_record(self):
        pages = [page(1, 3, [{'n': 1}, {'n': 2}], 2), page(2, 3, [{'n': 3}], 2)]
        self.assertEqual(len(macro.cpi_pages('getCPIIndex', {}, lambda _: pages.pop(0))), 3)
        pages = [page(1, 3, [{'n': 1}, {'n': 2}], 2), page(2, 3, [], 2)]
        with self.assertRaises(macro.SourceError):
            macro.cpi_pages('getCPIIndex', {}, lambda _: pages.pop(0))

    def test_cpi_retains_distinct_bases_and_national_only_backcast(self):
        def records(path, params, _fetch):
            base, vintage = params['base_year'], params['series']
            geos = ['All India'] if base == '2024' and vintage == 'Back' else sorted(macro.GEOS)
            rows = []
            for geo in geos:
                row = {'year': 2024, 'month': 'January', 'state': geo, 'sector': 'Combined', 'index': '100', 'inflation': '2.5', 'status': 'F'}
                row.update({'baseyear': '2012', 'group': 'General', 'subgroup': 'General-Overall'} if base == '2012' else {'base_year': '2024', 'series': vintage, 'division': 'CPI (General)'})
                rows.append(row)
            return rows
        with patch.object(macro, 'cpi_pages', side_effect=records):
            result = macro.collect_cpi()
        self.assertEqual(len(result['series']), 10)
        self.assertEqual(sum(1 for s in result['series'] if s['base'] == '2024' and s['series'] == 'Back'), 1)
        self.assertEqual(result['series'][0]['points'][0], ['2024-01', 100, 2.5, 'F'])
        self.assertIn('not property or land prices', result['scope'])

    def test_wrong_cpi_geography_is_rejected(self):
        row = {'year': 2024, 'month': 'January', 'state': 'Kerala', 'sector': 'Combined', 'index': '100', 'baseyear': '2012', 'group': 'General', 'subgroup': 'General-Overall'}
        with patch.object(macro, 'cpi_pages', return_value=[row]), self.assertRaises(macro.SourceError):
            macro.collect_cpi()

    def test_worldbank_rejects_truncated_data_and_unexpected_country(self):
        def valid(url):
            code = url.split('/indicator/')[1].split('?')[0]
            return [{'pages': 1, 'total': 20}, [{'date': str(2000 + i), 'value': i, 'countryiso3code': 'IND', 'indicator': {'id': code}} for i in range(20)]]
        result = macro.collect_worldbank(valid)
        self.assertEqual(len(result['series']), 5)
        self.assertIn('not state or district', result['scope'])
        with self.assertRaises(macro.SourceError):
            macro.collect_worldbank(lambda url: [{'pages': 2, 'total': 20}, valid(url)[1]])
        def wrong(url):
            output = valid(url); output[1][0]['countryiso3code'] = 'USA'; return output
        with self.assertRaises(macro.SourceError):
            macro.collect_worldbank(wrong)

    def test_unchanged_data_does_not_refresh_timestamp_or_rewrite(self):
        with tempfile.TemporaryDirectory() as d, patch.object(macro, 'DATA', Path(d)):
            payload = {'series': [{'points': [[2024, 3]]}]}
            self.assertTrue(macro.save_if_changed('x.js', 'X', payload, '2026-01-01T00:00:00Z'))
            before = (Path(d) / 'x.js').read_text()
            self.assertFalse(macro.save_if_changed('x.js', 'X', payload, '2026-02-01T00:00:00Z'))
            self.assertEqual((Path(d) / 'x.js').read_text(), before)
            self.assertTrue(macro.save_if_changed('x.js', 'X', {'series': []}, '2026-02-01T00:00:00Z'))


if __name__ == '__main__':
    unittest.main()
