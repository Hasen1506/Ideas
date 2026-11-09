"""Verify private staging of synthetic saved reports; no live API or real deeds."""
import io
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import landlens_stage as stage


def transaction(document='DOCSECRET947491'):
    return {'date': '04-03-2022', 'year': '2022', 'doc_no': document, 'nature': 'Sale deed',
            'type': 'Plot', 'seller': 'SECRET SELLER', 'buyer': 'SECRET BUYER',
            'address': 'SECRET PROPERTY ADDRESS', 'survey_no': 'SECRET SURVEY NUMBER',
            'extent_sqft': 2000, 'value': 4000000, 'per_sqft': 2000,
            'family_transfer': False, 'price_bearing': True}


def report(records, report_id=42, total=None):
    return {'ok': True, 'status': 'ok', 'credits_charged': 0,
            'data': {'found': True, 'price_map_id': report_id, 'sro_code': '20001',
                     'location': 'SECRET REPORT LOCATION', 'land': {
                         'total': len(records) if total is None else total,
                         'priced': len(records), 'shown': len(records), 'transactions': records}}}


class StagingTests(unittest.TestCase):
    def setUp(self):
        self.key = stage.hash_key('ab' * 32)

    def test_strips_personal_fields_and_never_claims_training_readiness(self):
        output = stage.stage_reports([report([transaction()], total=3)], self.key)
        encoded = json.dumps(output)
        for text in ('SECRET SELLER', 'SECRET BUYER', 'SECRET PROPERTY ADDRESS', 'SECRET SURVEY NUMBER', 'SECRET REPORT LOCATION'):
            self.assertNotIn(text, encoded)
        self.assertNotIn('DOCSECRET947491', encoded)
        self.assertFalse(output['training_ready'])
        self.assertFalse(output['candidates'][0]['training_ready'])
        self.assertTrue(output['reports'][0]['truncated'])
        self.assertIn('deed_location', output['candidates'][0]['requires_review'])
        self.assertNotIn('latitude', output['candidates'][0])
        self.assertNotIn('parcel_group_hash', output['candidates'][0])

    def test_deduplicates_consistent_documents_and_quarantines_conflicts(self):
        base = transaction()
        output = stage.stage_reports([report([base], 1), report([dict(base)], 2)], self.key)
        self.assertEqual(len(output['candidates']), 1)
        self.assertEqual(len(output['candidates'][0]['report_hashes']), 2)
        self.assertEqual(output['counts']['duplicate_candidate'], 1)
        conflicting = dict(base, value=5000000)
        output = stage.stage_reports([report([base], 1), report([conflicting], 2)], self.key)
        self.assertEqual(output['candidates'], [])
        self.assertEqual(output['counts']['duplicate_conflict'], 1)

    def test_unknown_flags_family_transfers_and_invalid_records_are_excluded(self):
        rows = [transaction('1'), dict(transaction('2'), family_transfer=True),
                dict(transaction('3'), price_bearing=None), dict(transaction('4'), type='Land'),
                dict(transaction('5'), extent_sqft=0), dict(transaction('6'), year='2021')]
        output = stage.stage_reports([report(rows)], self.key)
        self.assertEqual(len(output['candidates']), 1)
        self.assertEqual(output['counts']['family_unpriced_or_unknown'], 2)
        self.assertEqual(output['counts']['invalid_or_missing_fields'], 2)
        self.assertEqual(output['counts']['not_a_confirmed_plot_sale_candidate'], 1)

    def test_incomplete_and_unsuccessful_report_is_rejected(self):
        bad = report([transaction()]); bad['data']['land']['shown'] = 2
        with self.assertRaises(stage.StageError):
            stage.stage_reports([bad], self.key)
        with self.assertRaises(stage.StageError):
            stage.stage_reports([{'ok': False, 'status': 'not_found'}], self.key)
        with self.assertRaises(stage.StageError):
            stage.stage_reports([dict(report([transaction()]), credits_charged=1)], self.key)

    def test_private_output_is_exclusive_and_protected(self):
        with self.assertRaises(stage.StageError):
            stage.outside_repository(stage.ROOT / 'private-data.json')
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'candidates.json'
            stage.write_private(path, stage.stage_reports([report([transaction()])], self.key))
            self.assertEqual(os.stat(path).st_mode & 0o777, 0o600)
            with self.assertRaises(stage.StageError):
                stage.write_private(path, {})
            self.assertIn('candidates', json.loads(path.read_text()))
        with self.assertRaises(stage.StageError):
            stage.hash_key('weak-secret')

    def test_only_saved_report_endpoint_is_called_and_redirects_are_disabled(self):
        class Response(io.BytesIO):
            status = 200
            def geturl(self): return stage.ENDPOINT
        payload = json.dumps(report([transaction()])).encode()
        class Opener:
            def open(self, req, timeout):
                self.req, self.timeout = req, timeout
                return Response(payload)
        opener = Opener()
        with patch.object(stage.urllib.request, 'build_opener', return_value=opener) as build:
            result = stage.read_saved_report(42, 'TEST_TOKEN')
        self.assertEqual(result['data']['price_map_id'], 42)
        self.assertIsInstance(build.call_args.args[0], stage.NoRedirect)
        self.assertEqual(opener.req.full_url, stage.ENDPOINT)
        self.assertEqual(json.loads(opener.req.data), {'price_map_id': 42})
        self.assertEqual(opener.req.get_header('Authorization'), 'Bearer TEST_TOKEN')
        self.assertIsNone(stage.NoRedirect().redirect_request(None, None, 302, '', {}, 'https://example.org/'))


if __name__ == '__main__':
    unittest.main()
