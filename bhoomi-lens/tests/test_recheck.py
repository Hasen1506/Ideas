"""Check weekly update coverage and preservation of the previous snapshot on outage."""
import contextlib
import importlib.util
import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

path = Path(__file__).resolve().parents[1] / 'scripts' / 'recheck.py'
spec = importlib.util.spec_from_file_location('recheck', path)
recheck = importlib.util.module_from_spec(spec)
spec.loader.exec_module(recheck)


class RecheckTests(unittest.TestCase):
    def test_news_requires_an_rss_channel(self):
        with patch.object(recheck, 'get', return_value=b'<html><body>Unavailable</body></html>'):
            with self.assertRaises(ValueError):
                recheck.news('Project')

    def test_news_reads_tagged_headline_from_rss(self):
        rss = b'''<rss><channel><item><title>Project opened to traffic</title><link>https://example.com/story</link><pubDate>Sun, 08 Nov 2026 06:00:00 GMT</pubDate></item></channel></rss>'''
        with patch.object(recheck, 'get', return_value=rss):
            hit = recheck.news('Project')[0]
        self.assertEqual(hit['url'], 'https://example.com/story')
        self.assertEqual(hit['date'], '2026-11-08')
        self.assertIn('opened', hit['tags'])

    def test_partial_failures_are_counted(self):
        projects = [{'id': 'a', 'n': 'A', 'src': 'https://a.invalid'}, {'id': 'b', 'n': 'B', 'src': 'https://b.invalid'}]
        with tempfile.TemporaryDirectory() as root:
            (Path(root) / 'data').mkdir()
            with patch.object(recheck, 'ROOT', root), patch.object(recheck, 'load_projects', return_value=projects), \
                 patch.object(recheck, 'news', side_effect=[[], OSError('unavailable')]), \
                 patch.object(recheck, 'page_hash', side_effect=['hash', None]), \
                 patch.object(recheck.time, 'sleep'), contextlib.redirect_stderr(io.StringIO()):
                recheck.main()
            text = (Path(root) / 'data' / 'updates.js').read_text()
            result = json.loads(text.split('window.BL_UPDATES=', 1)[1].strip().rstrip(';'))
        self.assertEqual(result['coverage'], {'news_attempted': 2, 'news_ok': 1, 'sources_attempted': 2, 'sources_ok': 1})

    def test_total_news_outage_does_not_replace_previous_snapshot(self):
        projects = [{'id': 'a', 'n': 'A'}]
        old = 'window.BL_UPDATES={"gen":"old","items":[],"hashes":{}};\n'
        with tempfile.TemporaryDirectory() as root:
            directory = Path(root) / 'data'
            directory.mkdir()
            output = directory / 'updates.js'
            output.write_text(old)
            with patch.object(recheck, 'ROOT', root), patch.object(recheck, 'load_projects', return_value=projects), \
                 patch.object(recheck, 'news', side_effect=OSError('unavailable')), \
                 patch.object(recheck.time, 'sleep'), contextlib.redirect_stderr(io.StringIO()):
                with self.assertRaisesRegex(RuntimeError, 'Every news request failed'):
                    recheck.main()
            self.assertEqual(output.read_text(), old)


if __name__ == '__main__':
    unittest.main()
