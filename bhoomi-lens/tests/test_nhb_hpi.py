import datetime as dt
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import collect_nhb_hpi_archive as archive
import collect_nhb_hpi_recent as recent


class ArchiveTests(unittest.TestCase):
    def setUp(self):
        self.spec = dict(archive.SOURCES[0])
        self.spec['count'] = 2
        self.sample = self.spec['start'] + '\nQuarter Ending Jun-13 Sep-13\n' + '\n'.join(
            f'{name} 101 102' for name in ('Chennai', 'Coimbatore', 'Mumbai', 'Pune', 'Nagpur')
        ) + '\n' + self.spec['end']

    def test_parses_only_assessment_rows_and_exact_quarter_order(self):
        rows = archive.parse_table(self.sample, self.spec, expected_cities=5)
        self.assertEqual(rows['Chennai'], [101, 102])
        self.assertEqual(archive.periods(2013, 2, 4), ['2013-Q2', '2013-Q3', '2013-Q4', '2014-Q1'])
        with self.assertRaises(archive.SourceError):
            archive.parse_table(self.sample.replace('Jun-13 Sep-13', 'Sep-13 Jun-13'), self.spec, expected_cities=5)

    def test_rejects_missing_cities_and_duplicate_rows(self):
        with self.assertRaises(archive.SourceError):
            archive.parse_table(self.sample.replace('Pune 101 102', ''), self.spec, expected_cities=5)
        with self.assertRaises(archive.SourceError):
            archive.parse_table(self.sample.replace('Pune 101 102', 'Chennai 101 102'), self.spec, expected_cities=5)

    def test_only_joins_checked_same_base_publications_with_matching_overlaps(self):
        names = [f'City {i}' for i in range(50)]
        series = {'periods': ['2022-Q3'], 'cities': {n: [100.4] for n in names},
                  'source_url': 'https://example.test/report.pdf', 'source_sha256': 'a' * 64}
        transcript = {'publisher': 'National Housing Bank', 'measure': 'HPI @ Assessment Prices',
                      'base': 'FY 2017-18 = 100', 'tables': []}
        for year in (2022, 2023, 2024):
            transcript['tables'].append({'periods': archive.periods(year, 3, 5),
                'source_url': f'https://www.nhb.org.in/wp-content/{year}/report.pdf',
                'cities': {n: [100, 100, 100, 100, 100] for n in names}})
        archive.extend_2017_series(series, transcript)
        self.assertEqual(series['periods'][-1], '2025-Q3')
        self.assertEqual(len(series['cities']['City 0']), 13)
        transcript['tables'][0]['cities']['City 0'][0] = 102
        fresh = {'periods': ['2022-Q3'], 'cities': {n: [100.4] for n in names},
                 'source_url': 'https://example.test/report.pdf', 'source_sha256': 'a' * 64}
        with self.assertRaises(archive.SourceError):
            archive.extend_2017_series(fresh, transcript)


class RecentTests(unittest.TestCase):
    def setUp(self):
        self.html = '''Base Year FY 2024-25
          <a href="/DataUploadFormats/PressRelease_English/Press Release January-March 2026.pdf">Q1</a>
          <a href="/DataUploadFormats/PressRelease_English/Press Release April-June 2026.pdf">Q2</a>'''
        self.spec = recent.discover(self.html, today=dt.date(2026, 11, 13))
        self.text = '''HPI @ Assessment Prices. India’s seven key primary residential
          markets witnessed appreciating property prices during the period Apr - Jun 2026.
          Ahmedabad (7.9%), Bengaluru (21.5%), Chennai (10.8%), Hyderabad (5.2%),
          Kolkata (6.9%), Mumbai (6.2%) & Pune (3.7%) recorded increase in the index on
          an annual basis during Q1 FY27 as per the Housing Price Index published by the
          National Housing Bank.'''

    def test_finds_latest_current_base_release(self):
        self.assertEqual(self.spec['period'], '2026-Q2')
        self.assertTrue(self.spec['url'].startswith('https://residex.nhbonline.org.in/'))
        self.assertEqual(recent.parse_release(self.text, self.spec)['Chennai'], 10.8)

    def test_rejects_wrong_quarter_missing_city_and_changed_base(self):
        for bad in (self.text.replace('Apr - Jun 2026', 'Jan - Mar 2026'), self.text.replace('Chennai (10.8%)', 'Chennai unavailable')):
            with self.assertRaises(recent.SourceError):
                recent.parse_release(bad, self.spec)
        with self.assertRaises(recent.SourceError):
            recent.discover(self.html.replace('FY 2024-25', 'FY 2030-31'), today=dt.date(2026, 11, 13))

    def test_ignores_an_untrusted_link_and_future_report(self):
        bad = 'Base Year FY 2024-25 <a href="https://example.com/DataUploadFormats/PressRelease_English/Press Release April-June 2026.pdf">bad</a>'
        with self.assertRaises(recent.SourceError):
            recent.discover(bad, today=dt.date(2026, 11, 13))
        with self.assertRaises(recent.SourceError):
            recent.discover(self.html, today=dt.date(2026, 2, 1))


if __name__ == '__main__':
    unittest.main()
