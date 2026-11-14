import datetime as dt
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import collect_pib_leads as pib


class PibDiscoveryTests(unittest.TestCase):
    def setUp(self):
        self.today = dt.date(2026, 11, 13)
        self.page = '''<div>Displaying 2 Press Releases <span>All Ministry for ALL dates of November-2026</span></div>
        <li><a href="/PressReleseDetail.aspx?PRID=10">Pune Metro project approved</a><span class="publishdatesmall">Posted on: 03 Nov 2026</li>
        <li><a href="/PressReleseDetail.aspx?PRID=11">Unrelated release</a><span class="publishdatesmall">Posted on: 02 Nov 2026</li>'''.encode()

    def test_validates_entire_listing_before_selecting_source_linked_leads(self):
        count, rows = pib.parse_listing(self.page, self.today)
        self.assertEqual(count, 2)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['id'], '10')
        self.assertEqual(rows[0]['published'], '2026-11-03')
        self.assertEqual(rows[0]['url'], 'https://www.pib.gov.in/PressReleseDetail.aspx?PRID=10')

    def test_rejects_partial_duplicate_stale_or_future_rows(self):
        for bad in (self.page.replace(b'Displaying 2', b'Displaying 3'),
                    self.page.replace(b'PRID=11', b'PRID=10'),
                    self.page.replace(b'November-2026', b'October-2026'),
                    self.page.replace(b'03 Nov 2026', b'30 Nov 2026'),
                    b'<html>Service unavailable</html>'):
            with self.assertRaises(pib.SourceError):
                pib.parse_listing(bad, self.today)

    def test_deduplicates_and_drops_only_expired_items_after_successful_parse(self):
        _, rows = pib.parse_listing(self.page, self.today)
        previous = [dict(rows[0]), {'id': '3', 'published': '2025-01-01', 'title': 'old', 'url': 'old'}]
        self.assertEqual(pib.merge_leads(previous, rows, self.today), rows)

    def test_script_output_cannot_close_its_script_element(self):
        encoded = pib.to_script({'leads': [{'title': '</script><script>alert(1)</script>'}]})
        self.assertNotIn('</script>', encoded)
        self.assertIn('\\u003c', encoded)


if __name__ == '__main__':
    unittest.main()
