"""Test collector transport integrity and honest reporting of parked records."""
import importlib.util
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import patch

# The collector imports requests, but these isolated tests make no network calls.
requests_stub = types.ModuleType("requests")
requests_stub.get = lambda *args, **kwargs: None
sys.modules["requests"] = requests_stub
path = Path(__file__).resolve().parents[1] / "scripts" / "tn_gv_collect.py"
spec = importlib.util.spec_from_file_location("tn_gv_collect", path)
collector = importlib.util.module_from_spec(spec)
spec.loader.exec_module(collector)


class CertificateError(Exception):
    pass


class CollectorTests(unittest.TestCase):
    def test_untrusted_certificate_cannot_supply_source_data(self):
        # Model a hostile proxy with an untrusted certificate: it can forge a page
        # only when the caller has disabled certificate verification.
        forged = types.SimpleNamespace(status_code=200, content=b"<svg", text="<option value='1'>forged</option>")
        def request(_url, **kwargs):
            if kwargs.get("verify", True):
                raise CertificateError("untrusted certificate")
            return forged
        with patch.object(requests_stub, "get", side_effect=request):
            self.assertEqual(collector.Proxies.test("http://proxy.invalid"), ("http://proxy.invalid", False))
            with self.assertRaises(CertificateError):
                collector._one("http://proxy.invalid", collector.PROBE)

    def test_verified_proxy_response_is_accepted(self):
        valid = types.SimpleNamespace(status_code=200, content=b"<svg", text="ok")
        with patch.object(requests_stub, "get", return_value=valid) as get:
            self.assertEqual(collector.Proxies.test("http://proxy.invalid"), ("http://proxy.invalid", True))
            self.assertIs(collector._one("http://proxy.invalid", collector.PROBE)[1], valid)
            self.assertTrue(all(call.kwargs.get("verify", True) for call in get.call_args_list))

    @staticmethod
    def progress(second):
        revisions = {}
        for revision in collector.REV_ORDER:
            revisions[revision] = {
                "v": [["1", "Collected"], ["2", "Other"]],
                "d": {"1": {"items": 1, "rows": [["street"]]}, "2": second.copy()},
            }
        store = types.SimpleNamespace(
            meta={"sro_district": {"sro": "District"}, "discovery_complete": True},
            files={"District": {"sros": {"sro": {"revs": revisions}}}},
        )
        return collector.Store.progress(store)

    def test_parked_failure_is_settled_but_not_collected(self):
        p = self.progress({"err": collector.PARK_ERR})
        self.assertFalse(p["all_done"])
        self.assertTrue(p["all_settled"])
        self.assertFalse(p["totals"]["2024"]["complete"])
        self.assertEqual(p["totals"]["2024"]["villages_parked"], 1)
        self.assertEqual(p["totals"]["2024"]["villages_done"], 1)

    def test_pending_failure_is_not_settled(self):
        p = self.progress({"err": collector.PARK_ERR - 1})
        self.assertFalse(p["all_done"])
        self.assertFalse(p["all_settled"])

    def test_fully_collected_is_done(self):
        p = self.progress({"items": 0, "rows": []})
        self.assertTrue(p["all_done"])
        self.assertTrue(p["all_settled"])
        self.assertEqual(p["totals"]["2024"]["villages_parked"], 0)


if __name__ == "__main__":
    unittest.main()
