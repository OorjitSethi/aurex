from pathlib import Path
import asyncio, json, math, statistics, uuid, time, subprocess
from contextlib import asynccontextmanager
from concurrent.futures import ThreadPoolExecutor
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

ROOT = Path(__file__).resolve().parent.parent
ENGINE = ROOT / "build/aurex-engine"
DATA = ROOT / "data"
DATA.mkdir(exist_ok=True)


class Config(BaseModel):
    name: str = Field(default="Balanced market", max_length=80)
    price: float = Field(default=100, ge=1, le=10000)
    duration: int = Field(default=240, ge=30, le=1800)
    seed: int = Field(default=42, ge=0, le=2147483647)
    volatility: float = Field(default=0.8, ge=0, le=10)
    pressure: float = Field(default=0, ge=-1, le=1)
    latency: int = Field(default=80, ge=0, le=2000)
    fees: float = Field(default=1, ge=0, le=50)
    noise: int = Field(default=6, ge=1, le=20)
    execution: bool = True
    target: int = Field(default=200, ge=1, le=5000)
    shock: bool = False
    shockPct: float = Field(default=-2, ge=-30, le=30)
    focal: str = Field(default="inventory", pattern="^(inventory|fixed)$")


class Control(BaseModel):
    action: str
    speed: int = Field(default=1, ge=1, le=20)


class Experiment(BaseModel):
    config: Config
    runs: int = Field(default=20, ge=5, le=200)


class Session:
    def __init__(self):
        self.proc = None
        self.lock = asyncio.Lock()
        self.running = False
        self.speed = 1
        self.frames = []
        self.state = None
        self.clients = set()
        self.run_id = None
        self.commands = []

    async def command(self, command, **kw):
        self.proc.stdin.write((json.dumps(dict(command=command, **kw)) + "\n").encode())
        await self.proc.stdin.drain()
        line = await self.proc.stdout.readline()
        if not line:
            raise RuntimeError("Simulation engine stopped unexpectedly")
        s = json.loads(line)
        if "error" in s:
            raise RuntimeError(s["error"])
        self.state = s
        self.commands.append(dict(command=command, **kw))
        return s

    def record(self):
        self.frames.append({k: v for k, v in self.state.items() if k != "history"})
        if len(self.frames) > 2000:
            self.frames = self.frames[::2]

    async def reset(self, config):
        self.running = False
        if self.proc and self.proc.returncode is None:
            self.proc.terminate()
            await self.proc.wait()
        self.proc = await asyncio.create_subprocess_exec(
            str(ENGINE),
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            limit=16 * 1024 * 1024,
        )
        self.commands = []
        await self.command("init", config=config)
        self.frames = []
        self.run_id = None
        self.record()

    def payload(self):
        return {**self.state, "running": self.running, "speed": self.speed}

    async def broadcast(self):
        for ws in list(self.clients):
            try:
                await asyncio.wait_for(ws.send_json(self.payload()), 2)
            except Exception:
                self.clients.discard(ws)

    def save(self):
        self.run_id = self.run_id or uuid.uuid4().hex[:12]
        doc = {
            "id": self.run_id,
            "created": time.time(),
            "snapshot": self.state,
            "frames": self.frames,
            "commands": self.commands,
        }
        path = DATA / f"run-{self.run_id}.json"
        temp = path.with_suffix(".tmp")
        temp.write_text(json.dumps(doc))
        temp.replace(path)
        return self.run_id

    async def ticker(self):
        while True:
            await asyncio.sleep(0.15)
            async with self.lock:
                if self.running:
                    try:
                        await self.command("step", count=12 * self.speed)
                        self.record()
                        if self.state["done"]:
                            self.running = False
                            self.save()
                        await self.broadcast()
                    except Exception:
                        self.running = False
                        for ws in list(self.clients):
                            try:
                                await ws.send_json(
                                    {
                                        "error": "Engine failed. Reset the scenario to continue."
                                    }
                                )
                            except Exception:
                                pass


session = Session()


@asynccontextmanager
async def lifespan(app):
    await session.reset(Config().model_dump())
    task = asyncio.create_task(session.ticker())
    yield
    task.cancel()
    if session.proc and session.proc.returncode is None:
        session.proc.terminate()
        await session.proc.wait()


app = FastAPI(title="Aurex", lifespan=lifespan)


@app.get("/api/state")
async def state():
    return session.payload()


@app.post("/api/scenario")
async def scenario(config: Config):
    async with session.lock:
        await session.reset(config.model_dump())
        await session.broadcast()
        return session.payload()


@app.post("/api/control")
async def control(c: Control):
    async with session.lock:
        if c.action == "play":
            session.running = not session.state["done"]
        elif c.action == "pause":
            session.running = False
        elif c.action == "step":
            session.running = False
            await session.command("step", count=1)
            session.record()
        elif c.action == "speed":
            session.speed = c.speed
        elif c.action == "shock":
            if session.state["done"]:
                raise HTTPException(
                    409, "Reset the completed run before adding a shock"
                )
            await session.command("shock", percent=-2)
            await session.command("step", count=1)
            session.record()
        else:
            raise HTTPException(400, "Unknown action")
        if session.state["done"] and session.run_id is None:
            session.save()
        await session.broadcast()
        return session.payload()


@app.websocket("/api/live")
async def live(ws: WebSocket):
    await ws.accept()
    session.clients.add(ws)
    try:
        await ws.send_json(session.payload())
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        session.clients.discard(ws)


@app.post("/api/runs")
async def save_run():
    async with session.lock:
        return {"id": session.save()}


@app.get("/api/runs")
async def runs():
    result = []
    for p in DATA.glob("run-*.json"):
        d = json.loads(p.read_text())
        s = d["snapshot"]
        result.append(
            {
                "id": d["id"],
                "created": d["created"],
                "name": s["config"]["name"],
                "seed": s["config"]["seed"],
                "time": s["time"],
                "done": s["done"],
                "trades": s["tradeCount"],
            }
        )
    return sorted(result, key=lambda d: d["created"], reverse=True)


@app.get("/api/runs/{run_id}")
async def get_run(run_id: str):
    if not run_id.isalnum():
        raise HTTPException(404)
    p = DATA / f"run-{run_id}.json"
    if not p.exists():
        raise HTTPException(404)
    return FileResponse(
        p, media_type="application/json", filename=f"aurex-{run_id}.json"
    )


@app.post("/api/presets")
async def save_preset(c: Config):
    ident = uuid.uuid4().hex[:12]
    (DATA / f"preset-{ident}.json").write_text(c.model_dump_json())
    return {"id": ident}


@app.get("/api/presets")
async def presets():
    return [
        {"id": p.stem[7:], "config": json.loads(p.read_text())}
        for p in DATA.glob("preset-*.json")
    ]


jobs = {}


def run_engine(config):
    p = subprocess.run(
        [str(ENGINE), "--run"],
        input=json.dumps(config),
        text=True,
        capture_output=True,
        timeout=90,
        check=True,
    )
    return json.loads(p.stdout)


def summarize(values):
    ordered = sorted(values)
    n = len(values)
    mean = statistics.mean(values)
    se = statistics.stdev(values) / math.sqrt(n) if n > 1 else 0
    return {
        "mean": mean,
        "low": mean - 1.96 * se,
        "high": mean + 1.96 * se,
        "worst": min(values),
        "best": max(values),
        "median": statistics.median(values),
        "values": values,
    }


def batch_job(ident, req):
    job = jobs[ident]
    rows = []
    try:
        base = req.config.model_dump()
        # One stream per actor plus a separate exogenous value stream; seeds are paired.
        with ThreadPoolExecutor(max_workers=2) as pool:
            for i in range(req.runs):
                seed = (base["seed"] + i) % 2147483648
                configs = [
                    {**base, "seed": seed, "focal": kind}
                    for kind in ("fixed", "inventory")
                ]
                pair = list(pool.map(run_engine, configs))
                row = {"seed": seed}
                for kind, s in zip(("fixed", "inventory"), pair):
                    a = s["bots"][0]
                    row[kind] = {
                        "pnl": a["pnl"],
                        "drawdown": a["drawdown"],
                        "inventory": a["inventory"],
                        "maxInventory": a["maxInventory"],
                        "fees": a["fees"],
                        "volume": a["volume"],
                        "spread": s["averageSpread"],
                        "depth": s["averageDepth"],
                    }
                rows.append(row)
                job["completed"] = i + 1
        result = {
            "id": ident,
            "version": pair[0]["version"],
            "config": base,
            "runs": req.runs,
            "rows": rows,
            "fixed": summarize([r["fixed"]["pnl"] for r in rows]),
            "inventory": summarize([r["inventory"]["pnl"] for r in rows]),
            "difference": summarize(
                [r["inventory"]["pnl"] - r["fixed"]["pnl"] for r in rows]
            ),
            "created": time.time(),
        }
        path = DATA / f"experiment-{ident}.json"
        temp = path.with_suffix(".tmp")
        temp.write_text(json.dumps(result))
        temp.replace(path)
        job.update(status="complete", result=result)
    except Exception as e:
        job.update(status="failed", error=str(e))


@app.post("/api/experiments")
async def experiment(req: Experiment):
    if any(j["status"] == "running" for j in jobs.values()):
        raise HTTPException(409, "An experiment is already running")
    ident = uuid.uuid4().hex[:12]
    jobs[ident] = {"id": ident, "status": "running", "completed": 0, "total": req.runs}
    asyncio.create_task(asyncio.to_thread(batch_job, ident, req))
    return jobs[ident]


@app.get("/api/experiments")
async def experiments():
    return [
        json.loads(p.read_text())
        for p in sorted(
            DATA.glob("experiment-*.json"),
            key=lambda p: p.stat().st_mtime,
            reverse=True,
        )
    ]


@app.get("/api/experiment-active")
async def active_experiment():
    return next((j for j in jobs.values() if j["status"] == "running"), None)


@app.get("/api/experiments/{ident}")
async def experiment_status(ident: str):
    if ident not in jobs:
        raise HTTPException(404)
    return jobs[ident]


if (ROOT / "web/dist").exists():
    app.mount("/assets", StaticFiles(directory=ROOT / "web/dist/assets"), name="assets")

    @app.get("/{path:path}")
    async def frontend(path: str):
        if path.startswith("api/"):
            raise HTTPException(404)
        return FileResponse(ROOT / "web/dist/index.html")
