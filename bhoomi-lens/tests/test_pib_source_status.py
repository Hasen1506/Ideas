import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import pib_source_status as pib


class PibHealthTests(unittest.TestCase):
    def test_expected_release_and_feed_are_recognized(self):
        pib.validate(b'Chennai Metro project in 2009', 'older')
        pib.validate(b'Marakkanam Puducherry 2025', 'recent')
        pib.validate(b'<rss><channel><item><title>Project</title></item></channel></rss>', 'rss')

    def test_error_pages_and_empty_feed_are_not_success(self):
        for body, kind in ((b'<html>Forbidden</html>', 'recent'), (b'<html>Unavailable</html>', 'rss'),
                           (b'<rss><channel/></rss>', 'rss'), (b'', 'older')):
            with self.assertRaises(ValueError):
                pib.validate(body, kind)


if __name__ == '__main__':
    unittest.main()
