"""Dependency-free preflight checks; no model, network or training runtime is imported."""
import hashlib
import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

RUNNER = Path(__file__).with_name("train_lora.py")
spec = importlib.util.spec_from_file_location("closet_lora", RUNNER)
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)


class LoraPreflightTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="closet-lora-")
        self.directory = Path(self.temp.name).resolve()
        self.assertEqual(self.directory.parent, Path(tempfile.gettempdir()).resolve())

    def tearDown(self):
        # The resolved target was checked against the temporary directory before cleanup.
        self.temp.cleanup()

    def write_data(self, partitions=None):
        partitions = partitions or {split: [] for split in ("train", "validation", "test")}
        manifest = {"ready": False, "task": "outfit-selection", "files": {}}
        for split, rows in partitions.items():
            raw = "".join(json.dumps(row) + "\n" for row in rows).encode("utf-8")
            (self.directory / f"{split}.jsonl").write_bytes(raw)
            manifest["files"][split] = {"sha256": hashlib.sha256(raw).hexdigest()}
        (self.directory / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")

    def test_nf4_uses_double_quantization_and_selected_compute_dtype(self):
        self.assertEqual(runner.quantization_settings("nf4", "bf16"), {"load_in_4bit": True, "bnb_4bit_quant_type": "nf4", "bnb_4bit_use_double_quant": True, "bnb_4bit_compute_dtype": "bf16"})
        self.assertIsNone(runner.quantization_settings("none", "bf16"))
        with self.assertRaises(ValueError):
            runner.quantization_settings("unsupported", "bf16")

    def test_dry_run_defaults_to_nf4_without_training_dependencies(self):
        self.write_data()
        result = subprocess.run([sys.executable, "-B", str(RUNNER), "--data-dir", str(self.directory)], capture_output=True, text=True, check=True)
        report = json.loads(result.stdout)
        self.assertEqual(report["quantization"], "nf4")
        self.assertFalse(report["ready"])
        self.assertFalse(report["trainingStarted"])

    def test_train_refuses_insufficient_real_data_before_loading_a_model(self):
        self.write_data()
        result = subprocess.run([sys.executable, "-B", str(RUNNER), "--data-dir", str(self.directory), "--train"], capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Not training: collect enough", result.stderr)
        self.assertNotIn("ModuleNotFoundError", result.stderr)

    def test_preflight_rejects_changed_data(self):
        self.write_data()
        (self.directory / "train.jsonl").write_text("{}\n", encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "dataset hash differs"):
            runner.validate_dataset(self.directory)

    def test_preflight_rejects_prompt_leakage_even_with_different_record_ids(self):
        row = {"group": "g1", "fingerprint": "first", "prompt": [{"role": "system", "content": "Select"}, {"role": "user", "content": "Same brief"}], "completion": [{"role": "assistant", "content": "A"}]}
        other = {**row, "group": "g2", "fingerprint": "second"}
        self.write_data({"train": [row], "validation": [other], "test": []})
        with self.assertRaisesRegex(ValueError, "leakage"):
            runner.validate_dataset(self.directory)


if __name__ == "__main__":
    unittest.main()
