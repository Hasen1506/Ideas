"""Check farm-rate units against the collected 2024 source records.

Run from the repository root: python3 bhoomi-lens/tests/test_tn_gv_history.py
"""
import glob
import json
import re
import statistics
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from tn_gv_units import farm_per_acre  # noqa: E402


def norm(name):
    return re.sub(r"[\s.\-()]+", "", name or "")


class FarmRateTests(unittest.TestCase):
    def test_units(self):
        self.assertEqual(farm_per_acre(350000, "ac"), 350000)
        self.assertAlmostEqual(farm_per_acre(107639, "ha"), 43560)
        with self.assertRaises(ValueError):
            farm_per_acre(100, "ft2")

    def test_published_farm_rates_match_raw_sources(self):
        source = {}
        for filename in glob.glob(str(ROOT / "data/tn_gv/*.json")):
            if Path(filename).name.startswith("_") or Path(filename).name == "progress.json":
                continue
            with open(filename, encoding="utf-8") as f:
                district = json.load(f)
            for sro in district["sros"].values():
                villages = sro.get("revs", {}).get("2024", {}).get("d", {})
                for village in villages.values():
                    rates = [farm_per_acre(row[1], row[2]) for row in (village.get("rows") or [])
                             if row[2] in ("ac", "ha") and row[1]]
                    if not rates:
                        continue
                    key = (district["district"], sro["name"], norm(village["n"]))
                    value = round(statistics.median(rates))
                    self.assertTrue(key not in source or source[key] == value, f"Ambiguous source: {key}")
                    source[key] = value
        text = (ROOT / "data/tn_gv_history.js").read_text(encoding="utf-8")
        rows = json.loads(text.split("window.BL_TN_GV=", 1)[1].strip().rstrip(";"))["rows"]
        checked = 0
        for row in rows:
            key = (row[3], row[2], norm(row[1]))
            expected = source.get(key)
            if expected is not None or row[13] is not None:
                self.assertEqual(row[13], expected, f"Wrong farm rate for {key}")
                checked += 1
        self.assertGreater(checked, 0, "No published farm rates were checked")


if __name__ == "__main__":
    unittest.main()
