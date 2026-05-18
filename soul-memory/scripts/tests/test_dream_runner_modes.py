import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path
from typing import Optional


ROOT = Path(__file__).resolve().parents[3]
DREAM_RUNNER = ROOT / "soul-memory" / "scripts" / "dream_runner.py"
HERMES_WRAPPER = ROOT / "soul-memory" / "scripts" / "hermes_digest_runner.py"


class DreamRunnerModeTests(unittest.TestCase):
    def _run_script(
        self,
        script: Path,
        extra_env: dict[str, str],
        unset_keys: Optional[list[str]] = None,
    ) -> dict:
        with tempfile.TemporaryDirectory(prefix="dream-runner-test-") as tmp_home:
            env = os.environ.copy()
            env.update(
                {
                    "HOME": tmp_home,
                    "DREAM_ENV_FILE": str(Path(tmp_home) / ".env.none"),
                    "DREAM_PROFILE_ENV_FILE": str(Path(tmp_home) / ".profile.env.none"),
                    "DREAM_ENABLED": "false",
                }
            )
            for key in unset_keys or []:
                env.pop(key, None)
            env.update(extra_env)
            result = subprocess.run(
                ["python3", str(script)],
                cwd=str(ROOT),
                capture_output=True,
                text=True,
                check=False,
                env=env,
            )
            self.assertEqual(
                result.returncode,
                0,
                msg=f"script failed: {result.stderr.strip()}\nstdout={result.stdout.strip()}",
            )
            lines = [line.strip() for line in result.stdout.splitlines() if line.strip()]
            self.assertTrue(lines, msg="script produced no output")
            return json.loads(lines[-1])

    def test_default_mode_is_standard_when_unset(self):
        payload = self._run_script(DREAM_RUNNER, {"DREAM_MODE": ""})
        self.assertTrue(payload.get("ok"))
        self.assertTrue(payload.get("skipped"))
        self.assertEqual(payload.get("mode"), "standard")

    def test_lite_mode_respected(self):
        payload = self._run_script(DREAM_RUNNER, {"DREAM_MODE": "lite"})
        self.assertTrue(payload.get("ok"))
        self.assertTrue(payload.get("skipped"))
        self.assertEqual(payload.get("mode"), "lite")

    def test_pro_mode_respected(self):
        payload = self._run_script(DREAM_RUNNER, {"DREAM_MODE": "pro"})
        self.assertTrue(payload.get("ok"))
        self.assertTrue(payload.get("skipped"))
        self.assertEqual(payload.get("mode"), "pro")

    def test_invalid_mode_falls_back_to_standard(self):
        payload = self._run_script(DREAM_RUNNER, {"DREAM_MODE": "weird-mode"})
        self.assertTrue(payload.get("ok"))
        self.assertTrue(payload.get("skipped"))
        self.assertEqual(payload.get("mode"), "standard")

    def test_legacy_wrapper_bridges_to_dream_and_defaults_to_pro(self):
        payload = self._run_script(
            HERMES_WRAPPER,
            {
                "HERMES_ENABLED": "false",
            },
            unset_keys=["DREAM_ENABLED", "DREAM_MODE"],
        )
        self.assertTrue(payload.get("ok"))
        self.assertTrue(payload.get("skipped"))
        self.assertEqual(payload.get("mode"), "pro")


if __name__ == "__main__":
    unittest.main()
