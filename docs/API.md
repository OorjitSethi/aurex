# Interfaces

The default HTTP service listens at `http://127.0.0.1:8787`. It is local and single-user. FastAPI generates an interactive reference at `/docs` and OpenAPI schema at `/openapi.json`.

## HTTP

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/state` | Current snapshot, running state, and display speed |
| POST | `/api/scenario` | Validate configuration and replace the active session |
| POST | `/api/control` | `play`, `pause`, `step`, `speed`, or `shock` |
| GET / POST | `/api/runs` | List saved runs / save the active run |
| GET | `/api/runs/{id}` | Download the saved artifact |
| GET / POST | `/api/presets` | List / save scenario configurations |
| GET / POST | `/api/experiments` | List completed results / start a paired experiment |
| GET | `/api/experiment-active` | Active job summary, or null |
| GET | `/api/experiments/{id}` | Status of a job started in this server session |

`POST /api/control` accepts, for example, `{"action":"step"}` or `{"action":"speed","speed":5}`. Speed is an integer from 1 to 20. A shock injects a −2% value change at the current simulated time through the event queue. A completed session must be reset before injecting another shock.

`POST /api/experiments` accepts `{"config": { ... }, "runs": 20}` with 5–200 pairs. One batch runs at a time. Jobs are polled by their returned ID; completed results persist on disk. An in-progress batch is not resumable across server restarts.

## Scenario fields

All fields are optional at the HTTP boundary; omitted fields use these defaults. Unknown fields follow Pydantic's default ignore behavior. The standalone C++ executable assumes valid, bounded inputs rather than repeating HTTP validation.

| Field | Default | Bounds / meaning |
| --- | --- | --- |
| `name` | `Balanced market` | Up to 80 characters |
| `price` | 100 | $1–$10,000 |
| `duration` | 240 | 30–1,800 simulated seconds |
| `seed` | 42 | Integer 0–2,147,483,647 |
| `volatility` | 0.8 | 0–10, percent of initial price per √minute |
| `pressure` | 0 | −1 (selling) to +1 (buying) |
| `latency` | 80 | 0–2,000 ms, applied to observations and order arrival separately |
| `fees` | 1 | 0–50 basis points per side |
| `noise` | 6 | 1–20 background traders |
| `execution` | true | Include Tempo |
| `target` | 200 | 1–5,000 shares to purchase |
| `shock` | false | Schedule a halfway value shock |
| `shockPct` | −2 | −30% to +30% |
| `focal` | `inventory` | `inventory` or `fixed` for Atlas |

## WebSocket

Connect to `/api/live`. The server sends an initial snapshot and subsequent snapshots after controls or display ticks. Market snapshots include configuration, clock, history, price/value, trades, book levels, accounts, and recorded changes. An `error` message indicates that the active engine failed and the scenario should be reset. Disconnects are retried by the UI.

## Engine protocol

Build with `./scripts/build-engine.sh`.

- `build/aurex-engine --run`: reads one JSON configuration from stdin and prints the final snapshot.
- `build/aurex-engine`: reads one JSON command per line and emits one response per line.

Commands:

```json
{"command":"init","config":{"seed":42,"duration":30}}
{"command":"step","count":1}
{"command":"snapshot"}
{"command":"shock","percent":-2}
```

The `shock` command schedules an event; it does not advance the clock itself. The Python service then requests a step. Existing events at the same time retain sequence priority. Saved command journals capture the exact insertion/step sequence for replay.

## Saved artifact

A run file contains `id`, `created` (Unix seconds), `snapshot`, `frames`, and `commands`. Frames omit duplicate full history; the final snapshot carries the sampled history used during visual replay. `commands` is the exact engine input journal. Use `scripts/reproduce.py` to verify it against the same build.
