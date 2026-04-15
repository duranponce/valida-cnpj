import unittest
from pathlib import Path
import sys
import json
from unittest.mock import patch

# Ensure backend/src is in sys.path
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from valida_cnpj import create_app

class TestAPI(unittest.TestCase):
    def setUp(self):
        self.app = create_app()
        self.app.config["TESTING"] = True
        self.client = self.app.test_client()
        # Ensure we don't overwrite the real database during tests
        self.app.config["DB_PATH"] = Path("test_api.sqlite")
        if self.app.config["DB_PATH"].exists():
            self.app.config["DB_PATH"].unlink()

    def tearDown(self):
        if self.app.config["DB_PATH"].exists():
            self.app.config["DB_PATH"].unlink()

    def test_health(self):
        resp = self.client.get("/api/health")
        self.assertEqual(resp.status_code, 200)
        data = resp.get_json()
        self.assertTrue(data["ok"])
        self.assertEqual(data["app"], "valida-cnpj")

    def test_auth_status_logged_out(self):
        resp = self.client.get("/api/auth/status")
        # API routes return 401 if not authorized
        self.assertEqual(resp.status_code, 401)
        data = resp.get_json()
        self.assertIn("Não autorizado", data["error"])

    def test_auth_status_logged_in(self):
        # Setup session
        with self.client.session_transaction() as sess:
            sess["user"] = "testuser"
        
        resp = self.client.get("/api/auth/status")
        self.assertEqual(resp.status_code, 200)
        data = resp.get_json()
        self.assertTrue(data["logged_in"])
        self.assertEqual(data["user"], "testuser")

    @patch("valida_cnpj.services.receitaws.fetch_cnpj_json")
    def test_cnpj_proxy(self, mock_fetch):
        # Mocking the response from ReceitaWS
        mock_fetch.return_value = ({"status": "OK", "nome": "EMPRESA MOCK", "cnpj": "12345678000195"}, None)
        
        with self.client.session_transaction() as sess:
            sess["user"] = "testuser"
            
        resp = self.client.get("/api/cnpj/12345678000195")
        self.assertEqual(resp.status_code, 200)
        data = resp.get_json()
        self.assertEqual(data["nome"], "EMPRESA MOCK")

if __name__ == "__main__":
    unittest.main()
