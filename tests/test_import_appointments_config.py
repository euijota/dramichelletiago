import importlib.util
import os
import unittest
from pathlib import Path
from unittest.mock import patch


SCRIPT_PATH = Path(__file__).parents[1] / "import-appointments.py"


def load_script_module():
    spec = importlib.util.spec_from_file_location("import_appointments", SCRIPT_PATH)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


class SupabaseConfigTests(unittest.TestCase):
    def test_reads_supabase_url_from_environment(self):
        module = load_script_module()
        expected = "https://oncsyfsvcpudzdnqjnjj.supabase.co"

        with patch.dict(os.environ, {"SUPABASE_URL": expected}, clear=False):
            self.assertEqual(module.get_supabase_url(), expected)

    def test_rejects_missing_supabase_url(self):
        module = load_script_module()

        with patch.dict(os.environ, {}, clear=True):
            with self.assertRaises(SystemExit):
                module.get_supabase_url()


if __name__ == "__main__":
    unittest.main()
