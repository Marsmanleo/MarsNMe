#!/usr/bin/env python3
import importlib.util
import json
import os
from pathlib import Path

def load_dream_runner():
    script_path = Path(__file__).resolve().parent / "dream_runner.py"
    if not script_path.exists():
        raise RuntimeError(f"dream runner not found: {script_path}")
    spec = importlib.util.spec_from_file_location("dream_runner", script_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load dream runner module: {script_path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

def bridge_legacy_env():
    if "DREAM_ENABLED" not in os.environ and "HERMES_ENABLED" in os.environ:
        os.environ["DREAM_ENABLED"] = os.environ["HERMES_ENABLED"]
    if "DREAM_MODE" not in os.environ:
        os.environ["DREAM_MODE"] = "pro"
    if "DREAM_COMPAT_HERMES" not in os.environ:
        os.environ["DREAM_COMPAT_HERMES"] = "true"

def main() -> int:
    try:
        bridge_legacy_env()
        runner = load_dream_runner()
        return int(runner.main())
    except Exception as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False))
        return 1

if __name__ == "__main__":
    raise SystemExit(main())