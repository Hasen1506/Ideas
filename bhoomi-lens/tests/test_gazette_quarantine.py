"""The withdrawn third-party extract must not be rebuilt or recommitted by accident."""
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class GazetteQuarantineTest(unittest.TestCase):
    def test_extractor_and_rebuild_stop_before_writing(self):
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp) / "notice-data.json"
            for script, args in (
                ("gazette_scraper.py", ["--out", str(output)]),
                ("gazette_job.py", ["--no-scrape"]),
            ):
                result = subprocess.run([sys.executable, str(ROOT / "scripts" / script), *args], cwd=tmp, capture_output=True, text=True, timeout=10)
                self.assertNotEqual(result.returncode, 0, script)
                self.assertIn("disabled", result.stderr.lower())
                self.assertFalse(output.exists())

    def test_withdrawn_extracts_are_absent_from_app_tree(self):
        for name in ("gazette_raw.json", "gazette.js"):
            self.assertFalse((ROOT / "data" / name).exists(), name)
        self.assertNotIn('src="data/gazette.js"', (ROOT / "index.html").read_text())


if __name__ == "__main__":
    unittest.main()
