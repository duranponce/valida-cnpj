import unittest
import sqlite3
import json
from pathlib import Path
from datetime import datetime, timezone
import os
import sys

# Ensure backend/src is in sys.path
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from valida_cnpj.services import receitaws
from valida_cnpj.services import database as db_svc

class TestReceitaWSService(unittest.TestCase):
    def test_normalize_cnpj_digits_valid(self):
        ok, digits, err = receitaws.normalize_cnpj_digits("12.345.678/0001-95")
        self.assertTrue(ok)
        self.assertEqual(digits, "12345678000195")
        self.assertIsNone(err)

    def test_normalize_cnpj_digits_short(self):
        ok, digits, err = receitaws.normalize_cnpj_digits("123")
        self.assertTrue(ok)
        self.assertEqual(digits, "00000000000123")
        self.assertIsNone(err)

    def test_normalize_cnpj_digits_invalid(self):
        ok, digits, err = receitaws.normalize_cnpj_digits("not-a-cnpj")
        self.assertFalse(ok)
        self.assertEqual(err, "CNPJ inválido.")

class TestDatabaseService(unittest.TestCase):
    def setUp(self):
        # Use a unique temporary file for each test
        self.db_path = Path(f"test_db_{id(self)}.sqlite")
        db_svc.init_db(self.db_path)

    def tearDown(self):
        # Explicitly try to close any potential remaining connections if possible
        # Since we don't have access to them, we just try to delete
        try:
            if self.db_path.exists():
                self.db_path.unlink()
        except Exception:
            pass

    def test_init_db(self):
        # Already called in setUp, just verify tables exist
        with db_svc._conn(self.db_path) as con:
            res = con.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='entidades'").fetchone()
            self.assertIsNotNone(res)

    def test_upsert_and_get(self):
        cnpj = "12345678000195"
        data = {
            "nome": "EMPRESA TESTE",
            "fantasia": "TESTE",
            "situacao": "ATIVA",
            "cep": "01001-000",
            "municipio": "SAO PAULO",
            "uf": "SP",
            "abertura": "01/01/2000"
        }
        db_svc.upsert_entidade(self.db_path, cnpj, data)
        
        row = db_svc.get_entidade(self.db_path, cnpj)
        self.assertIsNotNone(row)
        self.assertEqual(row["razao_social"], "EMPRESA TESTE")
        self.assertEqual(row["pinned"], 0)

    def test_pin_entidade(self):
        cnpj = "12345678000195"
        data = {"nome": "EMPRESA TESTE"}
        db_svc.upsert_entidade(self.db_path, cnpj, data)
        
        db_svc.pin_entidade(self.db_path, cnpj, True)
        row = db_svc.get_entidade(self.db_path, cnpj)
        self.assertEqual(row["pinned"], 1)

    def test_patch_entidade(self):
        cnpj = "12345678000195"
        data = {"nome": "EMPRESA TESTE", "fantasia": "ANTIGA"}
        db_svc.upsert_entidade(self.db_path, cnpj, data)
        
        db_svc.patch_entidade(self.db_path, cnpj, {"fantasia": "NOVA"})
        row = db_svc.get_entidade(self.db_path, cnpj)
        self.assertEqual(row["fantasia"], "NOVA")

if __name__ == "__main__":
    unittest.main()
