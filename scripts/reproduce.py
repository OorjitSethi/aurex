#!/usr/bin/env python3
"""Verify a saved run/export by replaying its exact engine command journal."""

import json, subprocess, sys
from pathlib import Path

root = Path(__file__).resolve().parents[1]
doc = json.loads(Path(sys.argv[1]).read_text())
if not doc.get("commands"):
    raise SystemExit("This older file has no command journal. Use a new run export.")
with subprocess.Popen(
    [str(root / "build/aurex-engine")],
    stdin=subprocess.PIPE,
    stdout=subprocess.PIPE,
    text=True,
) as engine:
    result = None
    for command in doc["commands"]:
        engine.stdin.write(json.dumps(command) + "\n")
        engine.stdin.flush()
        result = json.loads(engine.stdout.readline())
    engine.stdin.close()
    engine.stdout.close()
    engine.wait()
if result != doc["snapshot"]:
    raise SystemExit("Mismatch: verify the engine version and build.")
print(f"Verified exact replay of {result['events']} events, including interventions.")
