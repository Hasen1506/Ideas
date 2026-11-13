"""Exercise the workflow's response handling without a real credential."""
import contextlib
import io
import json
import os
import textwrap
import unittest
import urllib.error
import urllib.request
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
WORKFLOW = ROOT / '.github/workflows/landlens-connection.yml'
ENDPOINT = 'https://verified.realestate/api/v1/me'
SYNTHETIC_KEY = 'llk_SYNTHETIC_PRIVATE_KEY'
PRIVATE_VALUE = 'PRIVATE_ACCOUNT_VALUE'


def workflow_script():
    source = WORKFLOW.read_text(encoding='utf-8')
    body = source.split("          python3 - <<'PY'\n", 1)[1].split('\n          PY', 1)[0]
    return compile(textwrap.dedent(body), str(WORKFLOW), 'exec')


class Response(io.BytesIO):
    status = 200

    def geturl(self):
        return ENDPOINT


class Opener:
    def __init__(self, payload):
        self.payload = payload

    def open(self, request, timeout):
        assert request.full_url == ENDPOINT
        assert request.get_method() == 'GET'
        assert request.get_header('Authorization') == 'Bearer ' + SYNTHETIC_KEY
        if isinstance(self.payload, Exception):
            raise self.payload
        return Response(json.dumps(self.payload).encode())


class ConnectionCheckTests(unittest.TestCase):
    def run_check(self, payload):
        output = io.StringIO()
        code = None
        with patch.dict(os.environ, {'LANDLENS_KEY': SYNTHETIC_KEY}), \
             patch('urllib.request.build_opener', return_value=Opener(payload)), \
             contextlib.redirect_stdout(output):
            try:
                exec(workflow_script(), {'__name__': '__main__'})
            except SystemExit as error:
                code = error.code
        text = output.getvalue()
        self.assertNotIn(SYNTHETIC_KEY, text)
        self.assertNotIn(PRIVATE_VALUE, text)
        return code, text

    def test_accepts_live_me_and_documented_success_envelopes_without_logging_data(self):
        for payload in ({'ok': True, 'wallet': PRIVATE_VALUE},
                        {'ok': True, 'status': 'ok', 'data': PRIVATE_VALUE}):
            code, text = self.run_check(payload)
            self.assertIsNone(code)
            self.assertIn('authentication succeeded', text)

    def test_rejects_failed_or_inconsistent_responses_without_logging_values(self):
        for payload in ({'ok': False, 'status': 'unauthorized', 'wallet': PRIVATE_VALUE},
                        {'ok': True, 'status': 'error', 'message': PRIVATE_VALUE},
                        {'wallet': PRIVATE_VALUE}, []):
            code, text = self.run_check(payload)
            self.assertIsNotNone(code)
            self.assertNotIn('authentication succeeded', text)

    def test_http_unauthorized_is_a_failure(self):
        error = urllib.error.HTTPError(ENDPOINT, 401, PRIVATE_VALUE, {}, None)
        code, text = self.run_check(error)
        self.assertIn('rejected the key', code)
        self.assertNotIn(PRIVATE_VALUE, text)


if __name__ == '__main__':
    unittest.main()
