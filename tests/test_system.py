import sys, json, subprocess, unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from backend.app import run_engine, Config, app
from fastapi.testclient import TestClient


class EngineTests(unittest.TestCase):
    def test_deterministic_and_accounting(self):
        for override in [
            {},
            {"latency": 0, "fees": 0},
            {"volatility": 6, "shock": True, "pressure": 0.9},
            {"price": 1, "fees": 50, "pressure": -1},
            {"noise": 20, "latency": 2000},
        ]:
            c = Config(duration=30, **override).model_dump()
            s = run_engine(c)
            self.assertEqual(s, run_engine(c))
            self.assertEqual(
                sum(a["inventory"] for a in s["bots"]), 500 * len(s["bots"])
            )
            self.assertAlmostEqual(
                sum(a["cash"] for a in s["bots"]) + s["fees"], 100000 * len(s["bots"])
            )
            for a in s["bots"]:
                self.assertAlmostEqual(
                    a["pnl"], a["realized"] + a["unrealized"] - a["fees"], places=7
                )
                self.assertGreaterEqual(a["cash"] - a["reservedCash"], 0)
                self.assertGreaterEqual(a["inventory"] - a["reservedShares"], 0)

    def test_external_value_identical_across_strategies(self):
        c = Config(duration=30, seed=81).model_dump()
        a = run_engine({**c, "focal": "fixed"})
        b = run_engine({**c, "focal": "inventory"})
        self.assertEqual(
            [(p["time"], p["value"]) for p in a["history"]],
            [(p["time"], p["value"]) for p in b["history"]],
        )

    def test_live_steps_equal_batch(self):
        from backend.app import ENGINE

        c = Config(duration=30).model_dump()
        p = subprocess.Popen(
            [str(ENGINE)], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True
        )

        def cmd(d):
            p.stdin.write(json.dumps(d) + "\n")
            p.stdin.flush()
            return json.loads(p.stdout.readline())

        s = cmd({"command": "init", "config": c})
        while not s["done"]:
            s = cmd({"command": "step", "count": 31})
        p.terminate()
        p.wait()
        p.stdin.close()
        p.stdout.close()
        self.assertEqual(s, run_engine(c))

    def test_future_shock_not_observed_early(self):
        c = Config(duration=30).model_dump()
        a = run_engine(c)
        b = run_engine({**c, "shock": True})
        self.assertEqual(
            [p for p in a["history"] if p["time"] < 15],
            [p for p in b["history"] if p["time"] < 15],
        )


class ApiTests(unittest.TestCase):
    def test_saved_command_journal_reproduces_intervention(self):
        import tempfile
        from unittest.mock import patch

        with tempfile.TemporaryDirectory() as tmp, patch("backend.app.DATA", Path(tmp)):
            with TestClient(app) as client:
                client.post("/api/scenario", json={"duration": 30})
                for _ in range(12):
                    client.post("/api/control", json={"action": "step"})
                client.post("/api/control", json={"action": "shock"})
                for _ in range(5):
                    client.post("/api/control", json={"action": "step"})
                ident = client.post("/api/runs", json={}).json()["id"]
                doc = client.get("/api/runs/" + ident).json()
                self.assertEqual(len(doc["commands"]), 20)
                path = Path(tmp) / f"run-{ident}.json"
                p = subprocess.run(
                    [sys.executable, "scripts/reproduce.py", str(path)],
                    text=True,
                    capture_output=True,
                )
                self.assertEqual(p.returncode, 0, p.stderr + p.stdout)

    def test_control_and_validation(self):
        with TestClient(app) as client:
            self.assertEqual(
                client.post("/api/scenario", json={"price": -5}).status_code, 422
            )
            s = client.post("/api/scenario", json={"duration": 30, "seed": 7}).json()
            self.assertEqual(s["time"], 0)
            next = client.post("/api/control", json={"action": "step"}).json()
            self.assertEqual(next["events"], 1)
            self.assertEqual(
                client.post("/api/control", json={"action": "pause"}).json()["running"],
                False,
            )
            s = client.post("/api/control", json={"action": "shock"}).json()
            self.assertEqual(len(s["changes"]), 1)
            self.assertEqual(
                client.post("/api/control", json={"action": "unknown"}).status_code, 400
            )
            with client.websocket_connect("/api/live") as ws:
                self.assertIn("bots", ws.receive_json())


if __name__ == "__main__":
    unittest.main(verbosity=2)
