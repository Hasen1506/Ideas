"""Focused tests for complete official responses and the no-write failure path."""
import io
import json
import urllib.error
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest.mock import patch

sys.modules.setdefault('requests', types.ModuleType('requests'))
scripts = Path(__file__).resolve().parents[1] / 'scripts'
sys.path.insert(0, str(scripts))
import tn_retry_gaps as retry
import tn_rera_health as rera
import tn_verify_sample as verify


def page(count=1, street='Main Road', price='120 / சதுரடி', pagination=''):
    row = (f'<tr class="odd"><td>1</td><td>{street}</td><td>{price}</td>'
           '<td></td><td>Residential</td><td>01-Apr-2002</td></tr>')
    count_text = 'One item found' if count == 1 else f'{count} items found'
    return f'{count_text}<table class="its" id="searchTable">{row}</table>{pagination}'


class RetryTests(unittest.TestCase):
    def test_complete_positive_result_preserves_official_source(self):
        url, rows = retry.collect_complete({'screenId': '7000057'}, '2002', lambda _: page())
        self.assertTrue(url.startswith('https://tnreginet.gov.in/portal/webHP?'))
        self.assertEqual(rows, [('Main Road', 120, 'ft2', 'Residential', '')])

    def test_error_empty_bad_rate_and_missing_table_are_not_results(self):
        invalid = ['Error Page 1 items found', 'Nothing found', page(price='unknown'), 'One item found']
        for response in invalid:
            with self.subTest(response=response), self.assertRaises(retry.IncompleteResult):
                retry.collect_complete({}, '2002', lambda _: response)

    def test_incomplete_or_repeated_pages_are_rejected(self):
        for body in [page(11), page(11, pagination='d-123-p=2')]:
            with self.subTest(body=body), self.assertRaises(retry.IncompleteResult):
                retry.collect_complete({}, '2002', lambda _: body)

    def test_fetch_budget_cannot_be_exceeded(self):
        fetch = retry.Fetcher(limit=0)
        with self.assertRaises(retry.IncompleteResult):
            fetch('https://tnreginet.gov.in/portal/webHP?test=1')

    def test_no_recovery_does_not_write(self):
        store = types.SimpleNamespace(files={'D': {'sros': {'1': {'revs': {
            '2002': {'v': [['2', 'Village']], 'd': {'2': {'err': 6}}}
        }}}}}, meta={'sro_zone': {'1': '1'}, 'sro_name': {'1': 'SRO'}})
        with patch.object(retry.collector, 'Store', return_value=store), \
             patch.object(retry, 'collect_complete', side_effect=retry.IncompleteResult('error page')), \
             patch.object(retry, 'save_recoveries') as save, \
             patch.object(sys, 'argv', ['tn_retry_gaps.py', '--apply']):
            retry.main()
        save.assert_not_called()

    def test_recovery_saves_only_checked_entry_and_provenance(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'Namakkal.json'
            data = {'classes': ['Residential'], 'sros': {'sro': {'revs': {
                '2002': {'d': {'village': {'n': 'Village', 'err': 6}}}
            }}}}
            path.write_text(json.dumps(data), encoding='utf-8')
            store = types.SimpleNamespace(progress=lambda: {'all_done': False})
            key = ('Namakkal', 'sro', '2002', 'village', 'Village')
            rows = [('Main Road', 120, 'ft2', 'Residential', '')]
            with patch.object(retry.collector, 'DATA', directory), \
                 patch.object(retry.collector, 'rev_path', return_value=str(path)), \
                 patch.object(retry.collector.Store, 'put_village') as put:
                retry.save_recoveries(store, [(key, 'https://tnreginet.gov.in/portal/webHP?x=1', rows)])
            saved = json.loads(path.read_text(encoding='utf-8'))
            self.assertEqual(saved['sros']['sro']['revs']['2002']['d']['village']['items'], 1)
            self.assertEqual(saved['sros']['sro']['revs']['2002']['d']['village']['rows'][0][3], 0)
            recovery = json.loads((Path(directory) / '_recoveries.json').read_text(encoding='utf-8'))
            self.assertEqual(recovery['Namakkal|sro|2002|village']['items'], 1)
            self.assertIn('not independently matched', recovery['Namakkal|sro|2002|village']['placement'])
            put.assert_called_once()

    def test_sample_is_deterministic_and_excludes_incomplete_and_large_searches(self):
        village = lambda n, rows: {'n': 'Village', 'items': n, 'rows': rows}
        row = ['Main Road', 120, 'ft2', 0, '']
        store = types.SimpleNamespace(files={
            'D1': {'classes': ['Residential'], 'sros': {'1': {'revs': {'2002': {'d': {
                '1': village(1, [row]), '2': village(2, [row]), '3': village(11, [row] * 11)
            }}}}}},
            'D2': {'classes': ['Residential'], 'sros': {'2': {'revs': {'2002': {'d': {
                '4': village(1, [row])
            }}}}}}
        })
        samples = verify.select_samples(store, 2, 'fixed')
        self.assertEqual(samples, verify.select_samples(store, 2, 'fixed'))
        self.assertEqual({item[1][0] for item in samples}, {'D1', 'D2'})
        self.assertEqual(verify.stored_rows(samples[0][2], samples[0][3]),
                         {('Main Road', 120, 'ft2', 'Residential', ''): 1})

    def test_repeated_transport_failures_back_off_without_writing(self):
        store = types.SimpleNamespace()
        pending = [('D', 'sro', '2002', str(i), 'Village') for i in range(5)]
        with patch.object(retry.collector, 'Store', return_value=store), \
             patch.object(retry, 'candidates', return_value=pending), \
             patch.object(retry.collector, 'street_query', return_value={}), \
             patch.object(retry, 'collect_complete', side_effect=urllib.error.URLError('timeout')) as collect, \
             patch.object(retry, 'save_recoveries') as save, \
             patch.object(sys, 'stdout', new_callable=io.StringIO) as output, \
             patch.object(sys, 'argv', ['tn_retry_gaps.py', '--apply']):
            retry.main()
        self.assertEqual(collect.call_count, 3)
        save.assert_not_called()
        self.assertIn('stopping this run early', output.getvalue())
        self.assertFalse(retry.is_transport_failure(urllib.error.HTTPError('https://example.com', 404, 'not found', None, None)))
        self.assertTrue(retry.is_transport_failure(urllib.error.HTTPError('https://example.com', 503, 'unavailable', None, None)))

    def test_sample_seed_rejects_workflow_control_characters(self):
        with patch.object(verify.collector, 'Store') as store, \
             patch.object(sys, 'stderr', new_callable=io.StringIO), \
             patch.object(sys, 'argv', ['tn_verify_sample.py', '--seed', 'bad\n::warning::fake']):
            with self.assertRaises(SystemExit):
                verify.main()
        store.assert_not_called()

    def test_sample_backs_off_and_reports_the_number_attempted(self):
        samples = [(None, ('D', 'sro', '2002', str(i), 'Village'), {'items': 1}, []) for i in range(5)]
        with patch.object(verify.collector, 'Store', return_value=types.SimpleNamespace()), \
             patch.object(verify, 'select_samples', return_value=samples), \
             patch.object(verify.collector, 'street_query', return_value={}), \
             patch.object(verify, 'collect_complete', side_effect=urllib.error.URLError('timeout')) as collect, \
             patch.object(verify.time, 'sleep'), \
             patch.object(sys, 'stdout', new_callable=io.StringIO) as output, \
             patch.object(sys, 'argv', ['tn_verify_sample.py']):
            verify.main()
        self.assertEqual(collect.call_count, 3)
        self.assertIn('Attempted 3 of 5', output.getvalue())
        self.assertIn('stopping this sample early', output.getvalue())

    def test_rera_check_does_not_mistake_error_or_generic_page_for_data(self):
        self.assertIn('unavailable', rera.classify(503, 'TN/11/Building/0301/2024'))
        self.assertIn('unconfirmed', rera.classify(200, '<html>Welcome</html>'))
        self.assertIn('identifier found', rera.classify(200, '<td>TN/11/Building/0301/2024</td>'))
        self.assertIn('unavailable', rera.classify(200, 'Error Page TN/11/Building/0301/2024'))


if __name__ == '__main__':
    unittest.main()
