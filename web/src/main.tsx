import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  ArrowDownLeft,
  ArrowUpRight,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronRight,
  Download,
  FlaskConical,
  Layers3,
  LayoutDashboard,
  Menu,
  Moon,
  Pause,
  Play,
  Plus,
  Radio,
  RotateCcw,
  Settings2,
  SkipForward,
  Sun,
  Users,
  X,
  Zap,
  Bookmark,
  Clock3,
  Orbit,
} from "lucide-react";
import type {
  Bot,
  Config,
  Snapshot,
  Point,
  Level,
  Run,
  Replay,
  Result,
  Summary,
} from "./types";
import "./style.css";
const money = (n: number, d = 2) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  }).format(n);
const number = (n: number) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n);
const signed = (n: number) => `${n >= 0 ? "+" : "−"}${money(Math.abs(n))}`;
const clock = (n: number) =>
  `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(Math.floor(n % 60)).padStart(2, "0")}`;
const kind = (s: string) =>
  ({
    inventory: "Inventory-aware",
    fixed: "Fixed spread",
    noise: "Background flow",
    execution: "TWAP execution",
  })[s] || s;
const cls = (n: number) => (n >= 0 ? "positive" : "negative");
async function api<T>(url: string, body?: unknown): Promise<T> {
  const r = await fetch(
    "/api" + url,
    body === undefined
      ? {}
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  if (!r.ok) {
    const d = await r.json();
    throw Error(
      typeof d.detail === "string"
        ? d.detail
        : "Please check the scenario values.",
    );
  }
  return r.json();
}
function download(data: unknown, name: string) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
function App() {
  const [live, setLive] = useState<Snapshot | null>(null),
    [page, setPage] = useState("market"),
    [theme, setTheme] = useState(
      () => localStorage.getItem("aurex-theme") || "dark",
    ),
    [connected, setConnected] = useState(false),
    [error, setError] = useState(""),
    [toast, setToast] = useState(""),
    [settings, setSettings] = useState(false),
    [library, setLibrary] = useState(false),
    [runs, setRuns] = useState<Run[]>([]),
    [selected, setSelected] = useState<number | null>(null),
    [replay, setReplay] = useState<Replay | null>(null),
    [frame, setFrame] = useState(0),
    [mobileNav, setMobileNav] = useState(false),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("aurex-theme", theme);
  }, [theme]);
  useEffect(() => {
    let ws: WebSocket;
    let retry: ReturnType<typeof setTimeout>;
    let alive = true;
    const connect = () => {
      ws = new WebSocket(
        `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/live`,
      );
      ws.onopen = () => {
        setConnected(true);
        setError("");
      };
      ws.onmessage = (e) => {
        const s = JSON.parse(e.data);
        if (s.error) setError(s.error);
        else setLive(s);
      };
      ws.onclose = () => {
        setConnected(false);
        if (alive) retry = setTimeout(connect, 1800);
      };
    };
    api<Snapshot>("/state")
      .then(setLive)
      .catch(() => setError("Connecting to the local exchange…"));
    connect();
    return () => {
      alive = false;
      clearTimeout(retry);
      ws?.close();
    };
  }, []);
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(""), 3500);
      return () => clearTimeout(t);
    }
  }, [toast]);
  const state = replay
    ? ({
        ...replay.frames[frame],
        history: replay.snapshot.history.filter(
          (p) => p.time <= replay.frames[frame].time,
        ),
      } as Snapshot)
    : live;
  async function control(action: string, speed?: number) {
    try {
      setBusy(true);
      setLive(
        await api<Snapshot>("/control", {
          action,
          speed: speed || live?.speed || 1,
        }),
      );
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  async function reset(c: Config) {
    try {
      setBusy(true);
      setLive(await api<Snapshot>("/scenario", c));
      setReplay(null);
      setSettings(false);
      setToast("Scenario ready. Your seed and settings are recorded.");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  async function openLibrary() {
    try {
      setRuns(await api<Run[]>("/runs"));
      setLibrary(true);
    } catch (e) {
      setError(String(e));
    }
  }
  async function save() {
    try {
      await api("/runs", {});
      setToast("Run saved to your local library.");
    } catch (e) {
      setError(String(e));
    }
  }
  async function exportRun() {
    try {
      if (replay) {
        download(replay, "aurex-run.json");
        return;
      }
      const saved = await api<{ id: string }>("/runs", {});
      download(await api<Replay>("/runs/" + saved.id), "aurex-run.json");
    } catch (e) {
      setError(String(e));
    }
  }
  async function loadRun(id: string) {
    try {
      await control("pause");
      const r = await api<Replay>("/runs/" + id);
      setReplay(r);
      setFrame(r.frames.length - 1);
      setLibrary(false);
      setPage("market");
    } catch (e) {
      setError(String(e));
    }
  }
  if (!state)
    return (
      <div className="loading">
        <div className="brand">
          <Logo />
          Aurex
          <span className="loading-dot" />
        </div>
        <p>{error || "Preparing your market laboratory"}</p>
      </div>
    );
  const bot = state.bots.find((b) => b.id === selected);
  return (
    <div className="shell">
      <aside className={"sidebar " + (mobileNav ? "open" : "")}>
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setPage("market");
          }}
        >
          <Logo />
          Aurex<span className="brand-dot">®</span>
        </a>
        <div className="workspace-label">MARKET LABORATORY</div>
        <nav aria-label="Main navigation">
          {[
            { id: "market", label: "Market overview", icon: LayoutDashboard },
            { id: "traders", label: "Traders", icon: Users },
            { id: "experiments", label: "Experiments", icon: FlaskConical },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={"nav-item " + (page === id ? "active" : "")}
              onClick={() => {
                setPage(id);
                setMobileNav(false);
              }}
            >
              <Icon size={18} />
              {label}
              {page === id && <span className="nav-dot" />}
            </button>
          ))}
          <button
            className="nav-item"
            onClick={() => {
              openLibrary();
              setMobileNav(false);
            }}
          >
            <Layers3 size={18} />
            Saved runs
          </button>
        </nav>
        <div className="sidebar-note">
          <div className="tiny-orbit">
            <Orbit size={25} />
          </div>
          <h3>A space to explore.</h3>
          <p>
            Build a market. Test an idea.
            <br />
            Understand what changes.
          </p>
          <button onClick={() => setSettings(true)}>
            Create a scenario <ArrowUpRight size={15} />
          </button>
        </div>
        <div className="sidebar-bottom">
          <div className="engine-status">
            <span className={connected ? "status-dot" : "status-dot offline"} />
            <span>{connected ? "Exchange connected" : "Reconnecting…"}</span>
            <span className="version">v1.0</span>
          </div>
          <button
            className="theme-switch"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          >
            {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
            <span>
              {theme === "dark" ? "Switch to light" : "Switch to dark"}
            </span>
            <span className="theme-chip">{theme === "dark" ? "D" : "L"}</span>
          </button>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="breadcrumbs">
            <button
              className="icon-button mobile-menu"
              aria-label="Open navigation"
              onClick={() => setMobileNav(!mobileNav)}
            >
              <Menu size={19} />
            </button>
            <span>Workspace</span>
            <ChevronRight size={13} />
            <strong>
              {page === "market"
                ? "Market overview"
                : page === "traders"
                  ? "Traders"
                  : "Experiments"}
            </strong>
          </div>
          <div className="topbar-right">
            <span className="environment">
              <span />
              SIMULATION
            </span>
            <span className="top-divider" />
            <span className="avatar">A</span>
          </div>
        </header>
        <main>
          {error && (
            <div role="alert" className="error-banner">
              {error}
              <button aria-label="Dismiss error" onClick={() => setError("")}>
                <X size={16} />
              </button>
            </div>
          )}
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                {page === "experiments"
                  ? "REPEAT. COMPARE. UNDERSTAND."
                  : "YOUR MARKET, IN PERSPECTIVE"}
              </div>
              <h1>
                {page === "market"
                  ? "Market overview"
                  : page === "traders"
                    ? "Meet your market."
                    : "Ideas, put to the test."}
              </h1>
              <p>
                {page === "market"
                  ? "A closer look at the forces shaping your simulated market."
                  : page === "traders"
                    ? "Different strategies. One shared market. Every decision accounted for."
                    : "Compare strategies across identical external conditions and recorded seeds."}
              </p>
            </div>
            <button
              className="button scenario-button"
              onClick={() => setSettings(true)}
            >
              <Settings2 size={16} />
              {state.config.name}
              <ChevronDown size={14} />
            </button>
          </div>
          {replay && (
            <div className="replay-bar">
              <Clock3 size={16} />
              <strong>Replay</strong>
              <span>{clock(state.time)}</span>
              <input
                aria-label="Replay position"
                type="range"
                min="0"
                max={replay.frames.length - 1}
                value={frame}
                onChange={(e) => setFrame(+e.target.value)}
              />
              <span>{clock(replay.snapshot.time)}</span>
              <button className="text-button" onClick={() => setReplay(null)}>
                Return to live <X size={14} />
              </button>
            </div>
          )}
          {page === "market" && (
            <>
              <div className="metrics">
                <Metric
                  label="LAST TRADE"
                  value={money(state.price)}
                  detail={
                    <>
                      <span className={cls(state.price - state.config.price)}>
                        {state.price >= state.config.price ? (
                          <ArrowUpRight size={14} />
                        ) : (
                          <ArrowDownLeft size={14} />
                        )}{" "}
                        {((state.price / state.config.price - 1) * 100).toFixed(
                          2,
                        )}
                        %
                      </span>
                      <span>from opening</span>
                    </>
                  }
                />
                <Metric
                  label="BID–ASK SPREAD"
                  value={state.spread === null ? "—" : money(state.spread)}
                  detail={
                    <>
                      <span className="mini-dot" />{" "}
                      {state.spread === null
                        ? "Waiting for two-sided liquidity"
                        : "Best available quotes"}
                    </>
                  }
                />
                <Metric
                  label="TRADED VOLUME"
                  value={number(state.volume)}
                  suffix="shares"
                  detail={`${number(state.tradeCount)} executed trades`}
                />
                <Metric
                  label="ACTIVE TRADERS"
                  value={String(state.bots.length).padStart(2, "0")}
                  detail={
                    <>
                      <div className="micro-avatars">A M T</div>
                      <span>
                        {new Set(state.bots.map((b) => b.kind)).size} strategy
                        types
                      </span>
                    </>
                  }
                />
              </div>
              <div className="market-grid">
                <section className="panel price-panel">
                  <div className="panel-header">
                    <div>
                      <h2>
                        Price discovery{" "}
                        <span className="asset-tag">AUR / USD</span>
                      </h2>
                      <p>Traded price against modeled underlying value</p>
                    </div>
                    <div className="chart-legend">
                      <span>
                        <i />
                        Traded
                      </span>
                      <span>
                        <i className="reference" />
                        Underlying
                      </span>
                    </div>
                  </div>
                  <PriceChart
                    points={state.history}
                    start={state.config.price}
                  />
                  <div className="chart-footer">
                    <span>
                      <span
                        className={
                          "status-dot " + (state.running ? "pulse" : "neutral")
                        }
                      />
                      {replay
                        ? "Replay"
                        : state.done
                          ? "Completed"
                          : state.running
                            ? "Market running"
                            : "Market paused"}
                    </span>
                    <span>
                      Seed <strong>{state.config.seed}</strong>
                      <span className="dot-separator">·</span>{" "}
                      {number(state.events)} events
                    </span>
                  </div>
                </section>
                <section className="panel book-panel">
                  <div className="panel-header">
                    <div>
                      <h2>Order book</h2>
                      <p>Resting liquidity</p>
                    </div>
                    <span className="small-chip">Top 4 levels</span>
                  </div>
                  <OrderBook
                    bids={state.bids}
                    asks={state.asks}
                    price={state.price}
                    spread={state.spread}
                  />
                </section>
                <section className="panel trader-panel">
                  <div className="panel-header">
                    <div>
                      <h2>The participants</h2>
                      <p>Performance marked to underlying value</p>
                    </div>
                    <button
                      className="text-button"
                      onClick={() => setPage("traders")}
                    >
                      View all <ArrowRight size={14} />
                    </button>
                  </div>
                  <BotTable
                    bots={state.bots.filter((b) => b.kind !== "noise")}
                    onSelect={setSelected}
                  />
                </section>
                <section className="panel tape-panel">
                  <div className="panel-header">
                    <h2>Recent trades</h2>
                    <span className="live-label">
                      <Radio size={12} />
                      TAPE
                    </span>
                  </div>
                  <TradeTape state={state} />
                </section>
              </div>
              <div className="transport">
                <div className="transport-time">
                  <Clock3 size={17} />
                  <strong>
                    {clock(state.time)}
                    <span> / {clock(state.config.duration)}</span>
                  </strong>
                  <div className="progress">
                    <i
                      style={{
                        width: `${(state.time / state.config.duration) * 100}%`,
                      }}
                    />
                  </div>
                </div>
                <div className="transport-actions">
                  <button
                    className="icon-button"
                    aria-label="Reset simulation"
                    title="Reset simulation"
                    disabled={busy || !!replay}
                    onClick={() => reset(state.config)}
                  >
                    <RotateCcw size={16} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label="Advance one event"
                    title="Advance one event"
                    disabled={busy || state.done || !!replay}
                    onClick={() => control("step")}
                  >
                    <SkipForward size={17} />
                  </button>
                  <select
                    aria-label="Playback speed"
                    value={live?.speed || 1}
                    disabled={!!replay}
                    onChange={(e) => control("speed", +e.target.value)}
                  >
                    <option value="1">1× speed</option>
                    <option value="5">5× speed</option>
                    <option value="20">20× speed</option>
                  </select>
                  <button
                    className="button primary play-button"
                    disabled={busy || !!replay || !connected}
                    onClick={() =>
                      state.done
                        ? reset(state.config)
                        : control(state.running ? "pause" : "play")
                    }
                  >
                    {state.done ? (
                      <RotateCcw size={15} />
                    ) : state.running ? (
                      <Pause size={15} />
                    ) : (
                      <Play size={15} />
                    )}{" "}
                    {state.done
                      ? "New run"
                      : state.running
                        ? "Pause"
                        : "Run market"}
                  </button>
                </div>
              </div>
              <div className="under-transport">
                <span>Simulated time · event-driven execution</span>
                <div>
                  <button
                    className="text-button"
                    disabled={!!replay || state.done}
                    onClick={() => control("shock")}
                  >
                    <Zap size={13} />
                    Introduce −2% shock
                  </button>
                  <button
                    className="text-button"
                    disabled={!!replay}
                    onClick={save}
                  >
                    <Bookmark size={13} />
                    Save run
                  </button>
                  <button className="text-button" onClick={exportRun}>
                    <Download size={13} />
                    Export
                  </button>
                </div>
              </div>
            </>
          )}
          {page === "traders" && (
            <>
              <div className="traders-summary">
                <div className="panel summary-copy">
                  <span className="eyebrow">A MARKET OF DIFFERENT MINDS</span>
                  <h2>
                    Observe the strategy.
                    <br />
                    <em>Understand the tradeoff.</em>
                  </h2>
                  <p>
                    Select a trader to inspect its quotes, account balances, and
                    most recent decisions.
                  </p>
                </div>
                <div className="panel summary-stat">
                  <span>Total trading fees</span>
                  <strong>{money(state.fees)}</strong>
                  <p>Explicitly accounted for on every fill</p>
                </div>
                <div className="panel summary-stat">
                  <span>Execution completion</span>
                  <strong>
                    {state.bots.find((b) => b.kind === "execution")
                      ? `${Math.min(100, ((state.bots.find((b) => b.kind === "execution")?.bought || 0) / state.config.target) * 100).toFixed(0)}%`
                      : "—"}
                  </strong>
                  <p>
                    {state.config.execution
                      ? `${state.bots.find((b) => b.kind === "execution")?.bought || 0} of ${state.config.target} shares purchased`
                      : "Execution trader disabled"}
                  </p>
                </div>
              </div>
              <section className="panel">
                <div className="panel-header">
                  <h2>
                    All participants{" "}
                    <span className="small-chip">{state.bots.length}</span>
                  </h2>
                  <span className="muted small">Click any row to inspect</span>
                </div>
                <BotTable bots={state.bots} onSelect={setSelected} />
              </section>
              <div className="method-note">
                <Activity size={17} />
                <p>
                  P&L = cash + holdings × underlying value − starting equity.
                  Realized and unrealized gains exclude fees; total P&L includes
                  them. All traders start with $100,000 and 500 shares. No short
                  selling or borrowing.
                </p>
              </div>
            </>
          )}
          {page === "experiments" && (
            <Experiments config={state.config} onError={setError} />
          )}
          <footer>
            <span>
              AUREX <span className="dot-separator">/</span> A market laboratory
            </span>
            <span>Fictional assets. Real curiosity.</span>
          </footer>
        </main>
      </div>
      {settings && (
        <Scenario
          config={live?.config || state.config}
          onClose={() => setSettings(false)}
          onApply={reset}
          busy={busy}
          onError={setError}
          onToast={setToast}
        />
      )}
      {library && (
        <Drawer
          title="Your saved runs"
          subtitle="Revisit the conditions. Replay the outcome."
          onClose={() => setLibrary(false)}
        >
          {runs.length ? (
            runs.map((r) => (
              <button
                className="run-card"
                key={r.id}
                onClick={() => loadRun(r.id)}
              >
                <div className="run-icon">
                  <Layers3 size={20} />
                </div>
                <div>
                  <strong>{r.name}</strong>
                  <p>
                    Seed {r.seed} · {clock(r.time)} · {number(r.trades)} trades
                  </p>
                  <small>
                    {new Date(r.created * 1000).toLocaleString()} ·{" "}
                    {r.done ? "Completed" : "Checkpoint"}
                  </small>
                </div>
                <ChevronRight size={18} />
              </button>
            ))
          ) : (
            <div className="empty-state">
              <Bookmark size={28} />
              <h3>A place for your discoveries.</h3>
              <p>
                Save a run from the market view.
                <br />
                Completed runs are saved automatically.
              </p>
            </div>
          )}
        </Drawer>
      )}
      {bot && (
        <Drawer
          title={bot.name}
          subtitle={kind(bot.kind) + " strategy"}
          onClose={() => setSelected(null)}
        >
          <div className="bot-detail-title">
            <BotAvatar bot={bot} />
            <div>
              <span className="eyebrow">TOTAL P&L</span>
              <h2 className={cls(bot.pnl)}>{signed(bot.pnl)}</h2>
            </div>
          </div>
          <div className="detail-grid">
            {[
              ["Cash", money(bot.cash)],
              ["Holdings", number(bot.inventory) + " shares"],
              ["Realized gain", signed(bot.realized)],
              ["Unrealized gain", signed(bot.unrealized)],
              ["Fees paid", money(bot.fees)],
              ["Maximum drawdown", money(bot.drawdown)],
              ["Reserved cash", money(bot.reservedCash)],
              ["Reserved shares", number(bot.reservedShares)],
              ["Midpoint-marked P&L", signed(bot.midPnl)],
              ["Volume", number(bot.volume) + " shares"],
            ].map(([label, v]) => (
              <div key={label}>
                <span>{label}</span>
                <strong>{v}</strong>
              </div>
            ))}
          </div>
          <>
            {bot.kind === "execution" && (
              <div className="execution-detail">
                <h3 className="section-title">Execution quality</h3>
                <div className="detail-grid">
                  <div>
                    <span>Shares purchased / target</span>
                    <strong>
                      {bot.bought} / {state.config.target}
                    </strong>
                  </div>
                  <div>
                    <span>Average fill price</span>
                    <strong>{bot.bought ? money(bot.averageFill) : "—"}</strong>
                  </div>
                  <div>
                    <span>Total cost including fees</span>
                    <strong>{money(bot.executionCost)}</strong>
                  </div>
                  <div>
                    <span>Shortfall vs. opening value</span>
                    <strong>{signed(bot.shortfall)}</strong>
                  </div>
                </div>
                <p className="field-help" style={{ marginTop: 14 }}>
                  Shortfall compares filled shares against the opening
                  underlying value. Unfilled shares are reported separately
                  through completion; they do not count as zero-cost fills.
                </p>
              </div>
            )}
          </>
          <h3 className="section-title">Current quotes</h3>
          {bot.quotes.length ? (
            <div className="quotes">
              {bot.quotes.map((q) => (
                <div key={q.id}>
                  <span className={q.side === "buy" ? "positive" : "negative"}>
                    {q.side.toUpperCase()}
                  </span>
                  <strong>{money(q.price)}</strong>
                  <span>{q.quantity} shares</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">No resting orders.</p>
          )}
          <h3 className="section-title">Recent decisions</h3>
          <div className="action-list">
            {bot.actions.length ? (
              bot.actions.map((a, i) => (
                <div key={i}>
                  <span className="action-dot" />
                  <p>{a}</p>
                </div>
              ))
            ) : (
              <p className="muted">Waiting for the first decision.</p>
            )}
          </div>
          <div className="method-note">
            <p>
              Quotes use delayed observations of the underlying value.
              Unrealized gains are marked to that modeled value; midpoint
              valuation is shown separately.
            </p>
          </div>
        </Drawer>
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={16} />
          {toast}
        </div>
      )}
    </div>
  );
}
function Logo() {
  return (
    <svg
      width="30"
      height="34"
      viewBox="0 0 30 34"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M3 28 15 4l12 24M9 21h12"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="m4 29 11-9 11 9"
        stroke="currentColor"
        strokeWidth="1.3"
        opacity=".5"
      />
    </svg>
  );
}
function Metric({
  label,
  value,
  suffix,
  detail,
}: {
  label: string;
  value: string;
  suffix?: string;
  detail: React.ReactNode;
}) {
  return (
    <div className="metric">
      <span className="metric-label">{label}</span>
      <div className="metric-value">
        {value}
        {suffix && <span>{suffix}</span>}
      </div>
      <div className="metric-detail">{detail}</div>
    </div>
  );
}
function PriceChart({ points, start }: { points: Point[]; start: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const chartRef = useRef<SVGSVGElement>(null);
  const [W, setWidth] = useState(800);
  useEffect(() => {
    if (!chartRef.current) return;
    const observer = new ResizeObserver(([entry]) =>
      setWidth(Math.max(280, entry.contentRect.width)),
    );
    observer.observe(chartRef.current);
    return () => observer.disconnect();
  }, []);
  const H = 260,
    left = 8,
    right = 61,
    top = 22,
    bottom = 30;
  const data = points.length
    ? points
    : [{ time: 0, price: start, value: start, spread: 0, pnl: [] }];
  const values = data.flatMap((p) => [p.price, p.value]);
  let min = Math.min(...values),
    max = Math.max(...values);
  const pad = Math.max((max - min) * 0.25, start * 0.0005);
  min -= pad;
  max += pad;
  const maxt = Math.max(1, data[data.length - 1].time);
  const x = (t: number) => left + (t / maxt) * (W - left - right),
    y = (v: number) => top + ((max - v) / (max - min)) * (H - top - bottom);
  const path = (key: "price" | "value") =>
    data.map((p, i) => `${i ? "L" : "M"}${x(p.time)},${y(p[key])}`).join(" ");
  const last = data[data.length - 1];
  const current = hover !== null ? data[hover] : null;
  return (
    <div className="chart-wrap" onMouseLeave={() => setHover(null)}>
      <svg
        className="price-chart"
        ref={chartRef}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="Traded price and underlying value over simulated time"
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const ratio = Math.max(
            0,
            Math.min(
              1,
              (((e.clientX - r.left) / r.width) * W - left) /
                (W - left - right),
            ),
          );
          setHover(
            data.reduce(
              (best, p, i) =>
                Math.abs(p.time - ratio * maxt) <
                Math.abs(data[best].time - ratio * maxt)
                  ? i
                  : best,
              0,
            ),
          );
        }}
      >
        <defs>
          <linearGradient id="price-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity=".16" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {Array.from({ length: 5 }, (_, i) => {
          const v = min + ((max - min) * i) / 4;
          return (
            <g key={i}>
              <line
                x1={left}
                x2={W - right + 6}
                y1={y(v)}
                y2={y(v)}
                className="grid-line"
              />
              <text x={W - right + 15} y={y(v) + 4} className="axis-label">
                {v.toFixed(2)}
              </text>
            </g>
          );
        })}
        {Array.from({ length: 6 }, (_, i) => (
          <text
            key={i}
            x={x((maxt * i) / 5)}
            y={H - 5}
            textAnchor={i === 0 ? "start" : i === 5 ? "end" : "middle"}
            className="axis-label"
          >
            {clock((maxt * i) / 5)}
          </text>
        ))}
        <path
          d={`${path("price")} L${x(last.time)},${H - bottom} L${left},${H - bottom} Z`}
          fill="url(#price-fill)"
        />
        <path
          d={path("value")}
          fill="none"
          stroke="var(--reference)"
          strokeWidth="1.5"
          strokeDasharray="4 5"
        />
        <path
          d={path("price")}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="2.2"
          strokeLinejoin="round"
        />
        <circle
          cx={x(last.time)}
          cy={y(last.price)}
          r="4"
          fill="var(--accent)"
          stroke="var(--panel)"
          strokeWidth="2"
        />
        {current && (
          <g>
            <line
              x1={x(current.time)}
              x2={x(current.time)}
              y1={top}
              y2={H - bottom}
              stroke="var(--muted)"
              strokeDasharray="3 4"
            />
            <circle
              cx={x(current.time)}
              cy={y(current.price)}
              r="4"
              fill="var(--accent)"
            />
          </g>
        )}
      </svg>
      {current && (
        <div className="chart-tooltip">
          {clock(current.time)}
          <strong>{money(current.price)}</strong>
          <span>Underlying {money(current.value)}</span>
        </div>
      )}
      {points.length < 2 && (
        <div className="chart-empty">
          <span>Your market is ready.</span>
          <small>Run the simulation to watch prices emerge.</small>
        </div>
      )}
    </div>
  );
}
function OrderBook({
  bids,
  asks,
  price,
  spread,
}: {
  bids: Level[];
  asks: Level[];
  price: number;
  spread: number | null;
}) {
  const max = Math.max(1, ...[...bids, ...asks].map((l) => l.quantity));
  const rows = (ls: Level[], side: string) =>
    Array.from({ length: 4 }, (_, i) => {
      const l = ls[i];
      return (
        <div className={"book-row " + side} key={i}>
          <div
            className="depth-bar"
            style={{ width: l ? `${(l.quantity / max) * 100}%` : "0" }}
          />
          <span>{l ? money(l.price) : "—"}</span>
          <span>{l ? number(l.quantity) : "—"}</span>
          <span>{l ? money(l.price * l.quantity, 0) : "—"}</span>
        </div>
      );
    });
  return (
    <div className="order-book">
      <div className="book-head">
        <span>Price (USD)</span>
        <span>Size</span>
        <span>Total</span>
      </div>
      <div className="asks">{rows(asks.slice(0, 4).reverse(), "sell")}</div>
      <div className="book-mid">
        <strong>{money(price)}</strong>
        <span>{spread === null ? "No spread" : `Spread ${money(spread)}`}</span>
      </div>
      <div className="bids">{rows(bids, "buy")}</div>
      <DepthChart bids={bids} asks={asks} />
    </div>
  );
}
function DepthChart({ bids, asks }: { bids: Level[]; asks: Level[] }) {
  const sharedMax = Math.max(
    1,
    bids.slice(0, 10).reduce((s, l) => s + l.quantity, 0),
    asks.slice(0, 10).reduce((s, l) => s + l.quantity, 0),
  );
  const path = (levels: Level[], reverse: boolean) => {
    let total = 0;
    const ls = levels.slice(0, 10).map((l) => (total += l.quantity));
    const max = sharedMax;
    return (
      `M${reverse ? 145 : 155},46 ` +
      ls
        .map(
          (q, i) =>
            `L${reverse ? 145 - (i * 140) / Math.max(1, ls.length - 1) : 155 + (i * 140) / Math.max(1, ls.length - 1)},${46 - (q / max) * 36}`,
        )
        .join(" ") +
      ` L${reverse ? 5 : 295},46 Z`
    );
  };
  return (
    <div className="depth-mini">
      <svg
        viewBox="0 0 300 48"
        role="img"
        aria-label="Cumulative order book depth"
      >
        <path
          d={path(bids, true)}
          fill="var(--green-soft)"
          stroke="var(--green)"
          strokeWidth="1"
        />
        <path
          d={path(asks, false)}
          fill="var(--red-soft)"
          stroke="var(--red)"
          strokeWidth="1"
        />
      </svg>
      <span>Cumulative depth</span>
    </div>
  );
}
function BotAvatar({ bot }: { bot: Bot }) {
  return (
    <span className={"bot-avatar " + bot.kind}>
      {bot.kind === "inventory" ? (
        <Orbit size={18} />
      ) : bot.kind === "fixed" ? (
        <Layers3 size={17} />
      ) : bot.kind === "execution" ? (
        <Activity size={18} />
      ) : (
        <Users size={16} />
      )}
    </span>
  );
}
function BotTable({
  bots,
  onSelect,
}: {
  bots: Bot[];
  onSelect: (id: number) => void;
}) {
  return (
    <div className="table-scroll">
      <table className="bot-table">
        <thead>
          <tr>
            <th>Trader / strategy</th>
            <th>Inventory</th>
            <th>Volume</th>
            <th>Net P&L</th>
            <th aria-label="Details" />
          </tr>
        </thead>
        <tbody>
          {bots.map((b) => (
            <tr key={b.id} onClick={() => onSelect(b.id)}>
              <td>
                <button
                  className="bot-name"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelect(b.id);
                  }}
                >
                  <BotAvatar bot={b} />
                  <span>
                    <strong>{b.name}</strong>
                    <small>{kind(b.kind)}</small>
                  </span>
                </button>
              </td>
              <td>
                {number(b.inventory)}
                <small> shares</small>
              </td>
              <td>{number(b.volume)}</td>
              <td className={cls(b.pnl)}>{signed(b.pnl)}</td>
              <td>
                <ChevronRight size={14} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function TradeTape({ state }: { state: Snapshot }) {
  return (
    <div className="trade-tape">
      <div className="tape-head">
        <span>Price (USD)</span>
        <span>Size</span>
        <span>Time</span>
      </div>
      {state.trades.length ? (
        state.trades.slice(0, 5).map((t) => (
          <div className="tape-row" key={t.id}>
            <span className={t.side === "buy" ? "positive" : "negative"}>
              {t.side === "buy" ? (
                <ArrowUpRight size={12} />
              ) : (
                <ArrowDownLeft size={12} />
              )}{" "}
              {money(t.price)}
            </span>
            <span>{t.quantity}</span>
            <span>{clock(t.time)}</span>
          </div>
        ))
      ) : (
        <div className="empty-tape">
          The first trade is still ahead.
          <br />
          <span>Start the market to begin.</span>
        </div>
      )}
    </div>
  );
}
function Drawer({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement;
    ref.current?.focus();
    const listener = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const items = ref.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled),input,select,a[href],[tabindex="0"]',
        );
        if (!items?.length) return;
        const first = items[0],
          last = items[items.length - 1];
        if (
          e.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === ref.current)
        ) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", listener);
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", listener);
      document.body.style.overflow = old;
      prev?.focus();
    };
  }, []);
  return (
    <div
      className="overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="drawer"
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="drawer-header">
          <div>
            <div className="eyebrow">AUREX LABORATORY</div>
            <h2>{title}</h2>
            <p>{subtitle}</p>
          </div>
          <button
            className="icon-button"
            aria-label="Close panel"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        <div className="drawer-content">{children}</div>
      </div>
    </div>
  );
}
const presets = [
  {
    name: "Balanced market",
    volatility: 0.8,
    pressure: 0,
    latency: 80,
    shock: false,
  },
  {
    name: "Volatile session",
    volatility: 3,
    pressure: 0,
    latency: 180,
    shock: false,
  },
  {
    name: "Buying pressure",
    volatility: 1,
    pressure: 0.7,
    latency: 100,
    shock: false,
  },
  {
    name: "A sudden shift",
    volatility: 1.2,
    pressure: 0,
    latency: 300,
    shock: true,
  },
];
function Scenario({
  config,
  onClose,
  onApply,
  busy,
  onError,
  onToast,
}: {
  config: Config;
  onClose: () => void;
  onApply: (c: Config) => void;
  busy: boolean;
  onError: (s: string) => void;
  onToast: (s: string) => void;
}) {
  const [c, setC] = useState(config),
    [saved, setSaved] = useState<{ id: string; config: Config }[]>([]);
  useEffect(() => {
    api<typeof saved>("/presets")
      .then(setSaved)
      .catch((e) => onError(String(e)));
  }, []);
  const set = (key: keyof Config, value: unknown) =>
    setC({ ...c, [key]: value });
  return (
    <Drawer
      title="Shape your market."
      subtitle="A few conditions. A world of possible outcomes."
      onClose={onClose}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onApply(c);
        }}
      >
        <label className="field">
          Scenario name
          <input
            value={c.name}
            maxLength={80}
            required
            onChange={(e) => set("name", e.target.value)}
          />
        </label>
        <div className="preset-grid">
          {presets.map((p) => (
            <button
              type="button"
              className={"preset " + (c.name === p.name ? "selected" : "")}
              key={p.name}
              onClick={() => setC({ ...c, ...p })}
            >
              {p.name}
              {c.name === p.name && <Check size={13} />}
            </button>
          ))}
        </div>
        {saved.length > 0 && (
          <label className="field">
            Saved scenarios
            <select
              value=""
              onChange={(e) =>
                setC(saved.find((s) => s.id === e.target.value)!.config)
              }
            >
              <option value="" disabled>
                Load a saved scenario
              </option>
              {saved.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.config.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <h3 className="section-title">The environment</h3>
        <div className="form-grid">
          {[
            {
              k: "price",
              label: "Starting price ($)",
              min: 1,
              max: 10000,
              step: 0.01,
            },
            {
              k: "duration",
              label: "Duration (seconds)",
              min: 30,
              max: 1800,
              step: 1,
            },
            {
              k: "seed",
              label: "Random seed",
              min: 0,
              max: 2147483647,
              step: 1,
            },
            {
              k: "fees",
              label: "Fees (basis points)",
              min: 0,
              max: 50,
              step: 0.1,
            },
            {
              k: "latency",
              label: "Information & order delay (ms)",
              min: 0,
              max: 2000,
              step: 1,
            },
            {
              k: "noise",
              label: "Background traders",
              min: 1,
              max: 20,
              step: 1,
            },
          ].map((f) => (
            <label className="field" key={f.k}>
              {f.label}
              <input
                type="number"
                required
                min={f.min}
                max={f.max}
                step={f.step}
                value={c[f.k as keyof Config] as number}
                onChange={(e) => set(f.k as keyof Config, +e.target.value)}
              />
            </label>
          ))}
        </div>
        <label className="range-field">
          <span>
            Volatility <strong>{c.volatility.toFixed(1)}% / √minute</strong>
          </span>
          <input
            aria-label="Volatility"
            type="range"
            min="0"
            max="10"
            step=".1"
            value={c.volatility}
            onChange={(e) => set("volatility", +e.target.value)}
          />
          <small>
            Quiet<span>Turbulent</span>
          </small>
        </label>
        <label className="range-field">
          <span>
            Directional pressure{" "}
            <strong>
              {c.pressure === 0
                ? "Balanced"
                : c.pressure > 0
                  ? "Buying"
                  : "Selling"}
            </strong>
          </span>
          <input
            aria-label="Directional pressure"
            type="range"
            min="-1"
            max="1"
            step=".1"
            value={c.pressure}
            onChange={(e) => set("pressure", +e.target.value)}
          />
          <small>
            Selling<span>Buying</span>
          </small>
        </label>
        <h3 className="section-title">The participants</h3>
        <label className="field">
          Atlas market maker
          <select
            value={c.focal}
            onChange={(e) => set("focal", e.target.value)}
          >
            <option value="inventory">Inventory-aware quoting</option>
            <option value="fixed">Fixed-spread quoting</option>
          </select>
        </label>
        <p className="field-help">
          Meridian provides fixed-spread quotes as a common counterparty.
        </p>
        <label className="toggle-field">
          <div>
            <strong>Gradual execution trader</strong>
            <p>Tempo buys shares in scheduled slices.</p>
          </div>
          <input
            type="checkbox"
            checked={c.execution}
            onChange={(e) => set("execution", e.target.checked)}
          />
        </label>
        {c.execution && (
          <label className="field">
            Target quantity
            <input
              type="number"
              required
              min="1"
              max="5000"
              value={c.target}
              onChange={(e) => set("target", +e.target.value)}
            />
          </label>
        )}
        <label className="toggle-field">
          <div>
            <strong>Mid-session value shock</strong>
            <p>Change underlying value halfway through.</p>
          </div>
          <input
            type="checkbox"
            checked={c.shock}
            onChange={(e) => set("shock", e.target.checked)}
          />
        </label>
        {c.shock && (
          <label className="field">
            Value change (%)
            <input
              type="number"
              required
              min="-30"
              max="30"
              step=".1"
              value={c.shockPct}
              onChange={(e) => set("shockPct", +e.target.value)}
            />
          </label>
        )}
        <div className="form-note">
          Applying a scenario starts a fresh run. Save your current run first if
          you want to revisit it.
        </div>
        <div className="drawer-actions">
          <button
            type="button"
            className="button"
            onClick={async () => {
              try {
                await api("/presets", c);
                onToast("Scenario saved.");
                setSaved(await api("/presets"));
              } catch (e) {
                onError(String(e));
              }
            }}
          >
            <Bookmark size={15} />
            Save preset
          </button>
          <button type="submit" className="button primary" disabled={busy}>
            <Plus size={16} />
            Create market
          </button>
        </div>
      </form>
    </Drawer>
  );
}
function Experiments({
  config,
  onError,
}: {
  config: Config;
  onError: (s: string) => void;
}) {
  const [runs, setRuns] = useState(20),
    [job, setJob] = useState<{
      id: string;
      status: string;
      completed: number;
      total: number;
      error?: string;
      result?: Result;
    } | null>(null),
    [result, setResult] = useState<Result | null>(null),
    [past, setPast] = useState<Result[]>([]),
    [starting, setStarting] = useState(false);
  useEffect(() => {
    api<Result[]>("/experiments")
      .then((r) => {
        setPast(r);
        if (r.length) setResult(r[0]);
      })
      .catch((e) => onError(String(e)));
    api<NonNullable<typeof job> | null>("/experiment-active")
      .then(setJob)
      .catch((e) => onError(String(e)));
  }, []);
  useEffect(() => {
    if (!job || job.status !== "running") return;
    const t = setInterval(
      () =>
        api<NonNullable<typeof job>>("/experiments/" + job.id)
          .then((j) => {
            setJob(j);
            if (j.status === "complete" && j.result) {
              setResult(j.result);
              setPast((p) => [j.result!, ...p]);
            }
            if (j.status === "failed") onError(j.error || "Experiment failed");
          })
          .catch((e) => {
            onError(String(e));
            clearInterval(t);
          }),
      600,
    );
    return () => clearInterval(t);
  }, [job?.id, job?.status]);
  async function start() {
    setStarting(true);
    try {
      setJob(await api("/experiments", { config, runs }));
    } catch (e) {
      onError(String(e));
    } finally {
      setStarting(false);
    }
  }
  return (
    <>
      <div className="experiment-hero panel">
        <div>
          <span className="eyebrow">THE CENTRAL QUESTION</span>
          <h2>
            Does managing inventory
            <br />
            <em>make a better market maker?</em>
          </h2>
          <p>
            Atlas uses fixed-spread quoting in one market and inventory-aware
            quoting in the other. The external value and trader random streams
            share a seed.
          </p>
          <div className="experiment-tags">
            <span>
              <Layers3 size={13} />
              {config.name}
            </span>
            <span>Seed {config.seed} onward</span>
            <span>{config.duration}s per market</span>
          </div>
        </div>
        <div className="experiment-launch">
          <label className="field">
            Paired scenarios
            <select
              value={runs}
              disabled={job?.status === "running"}
              onChange={(e) => setRuns(+e.target.value)}
            >
              <option value="5">5 pairs · quick check</option>
              <option value="20">20 pairs · exploratory</option>
              <option value="100">100 pairs · extended</option>
              <option value="200">200 pairs · deeper study</option>
            </select>
          </label>
          <button
            className="button primary"
            disabled={starting || job?.status === "running"}
            onClick={start}
          >
            <FlaskConical size={16} />
            {job?.status === "running"
              ? `Running ${job.completed} / ${job.total}`
              : "Run comparison"}
          </button>
          <small>
            {job?.status === "running"
              ? "Working through the paired seeds…"
              : `${runs * 2} independent markets · same conditions`}
          </small>
          {job?.status === "running" && (
            <div className="progress">
              <i style={{ width: `${(job.completed / job.total) * 100}%` }} />
            </div>
          )}
        </div>
      </div>
      {result ? (
        <>
          <div className="results-title">
            <div>
              <h2>The evidence</h2>
              <p>
                {result.runs} paired scenarios · {result.config.name} · seeds{" "}
                {result.rows[0].seed}–{result.rows[result.rows.length - 1].seed}
              </p>
            </div>
            <div className="result-actions">
              {past.length > 1 && (
                <select
                  aria-label="Previous experiment"
                  value={result.id}
                  onChange={(e) =>
                    setResult(past.find((p) => p.id === e.target.value)!)
                  }
                >
                  {past.map((p, i) => (
                    <option key={p.id} value={p.id}>
                      {i === 0 ? "Latest" : `Earlier ${i}`} · {p.runs} pairs ·{" "}
                      {p.config.name}
                    </option>
                  ))}
                </select>
              )}
              <button
                className="button"
                onClick={() => download(result, "aurex-experiment.json")}
              >
                <Download size={14} />
                Export
              </button>
            </div>
          </div>
          <div className="experiment-metrics">
            <Metric
              label="FIXED SPREAD · MEAN P&L"
              value={signed(result.fixed.mean)}
              detail={`${money(result.fixed.low)} to ${money(result.fixed.high)} · 95% CI`}
            />
            <Metric
              label="INVENTORY-AWARE · MEAN P&L"
              value={signed(result.inventory.mean)}
              detail={`${money(result.inventory.low)} to ${money(result.inventory.high)} · 95% CI`}
            />
            <Metric
              label="PAIRED DIFFERENCE · MEAN"
              value={signed(result.difference.mean)}
              detail={
                result.difference.low <= 0 && result.difference.high >= 0
                  ? "Interval includes zero · no clear advantage"
                  : result.difference.mean > 0
                    ? "Favors inventory-aware in this setting"
                    : "Favors fixed spread in this setting"
              }
            />
          </div>
          <div className="experiment-grid">
            <section className="panel">
              <div className="panel-header">
                <div>
                  <h2>A distribution, not a highlight.</h2>
                  <p>Final P&L across seeds · shared bin boundaries</p>
                </div>
              </div>
              <Histogram fixed={result.fixed} inventory={result.inventory} />
            </section>
            <section className="panel evidence-panel">
              <h2>The tradeoffs</h2>
              <div className="comparison-row comparison-head">
                <span>Metric</span>
                <span>Fixed</span>
                <span>Inventory</span>
              </div>
              {[
                ["Worst P&L", result.fixed.worst, result.inventory.worst],
                ["Median P&L", result.fixed.median, result.inventory.median],
                [
                  "Mean drawdown",
                  ...(["fixed", "inventory"] as const).map(
                    (k) =>
                      result.rows.reduce((a, r) => a + r[k].drawdown, 0) /
                      result.runs,
                  ),
                ],
                [
                  "Mean fees",
                  ...(["fixed", "inventory"] as const).map(
                    (k) =>
                      result.rows.reduce((a, r) => a + r[k].fees, 0) /
                      result.runs,
                  ),
                ],
                [
                  "Mean peak shares",
                  ...(["fixed", "inventory"] as const).map(
                    (k) =>
                      result.rows.reduce((a, r) => a + r[k].maxInventory, 0) /
                      result.runs,
                  ),
                ],
              ].map(([name, f, i]) => (
                <div className="comparison-row" key={name}>
                  <span>{name}</span>
                  <strong>
                    {name === "Mean peak shares" ? number(+f) : money(+f)}
                  </strong>
                  <strong>
                    {name === "Mean peak shares" ? number(+i) : money(+i)}
                  </strong>
                </div>
              ))}
            </section>
          </div>
          <div className="method-note">
            <FlaskConical size={18} />
            <p>
              Intervals are approximate 95% normal intervals for the sample mean
              (mean ± 1.96 standard errors). The paired difference uses
              within-seed differences. Small batches are exploratory. P&L
              includes fees and marks inventory to underlying value. These
              results describe this simulated environment, not real-market
              profitability.
            </p>
          </div>
        </>
      ) : (
        <div className="experiment-empty">
          <div className="empty-orbits">
            <Orbit size={48} strokeWidth={1} />
          </div>
          <h3>Good questions deserve repeated trials.</h3>
          <p>
            Run your first comparison to see outcome distributions,
            <br />
            confidence intervals, and the cost of each strategy’s risk.
          </p>
        </div>
      )}
    </>
  );
}
function Histogram({
  fixed,
  inventory,
}: {
  fixed: Summary;
  inventory: Summary;
}) {
  const vals = [...fixed.values, ...inventory.values],
    min = Math.min(...vals),
    max = Math.max(...vals),
    span = max - min || 1,
    bins = 8;
  const bucket = (values: number[]) => {
    const b = Array(bins).fill(0);
    values.forEach(
      (v) => b[Math.min(bins - 1, Math.floor(((v - min) / span) * bins))]++,
    );
    return b;
  };
  const f = bucket(fixed.values),
    iv = bucket(inventory.values),
    height = Math.max(...f, ...iv, 1);
  return (
    <div className="histogram">
      <div className="chart-legend">
        <span>
          <i className="reference" />
          Fixed spread
        </span>
        <span>
          <i />
          Inventory-aware
        </span>
      </div>
      <svg
        viewBox="0 0 600 230"
        role="img"
        aria-label="Histogram of market-maker profit and loss"
      >
        <text x="15" y="15" className="axis-label">
          Runs
        </text>
        {[0, 0.5, 1].map((v) => (
          <g key={v}>
            <text x="15" y={191 - v * 150} className="axis-label">
              {(height * v).toFixed(0)}
            </text>
            <line
              x1="42"
              x2="585"
              y1={188 - v * 150}
              y2={188 - v * 150}
              className="grid-line"
            />
          </g>
        ))}
        {f.map((v, i) => (
          <g key={i}>
            <rect
              x={50 + i * 66}
              y={188 - (v / height) * 150}
              width="24"
              height={(v / height) * 150}
              fill="var(--reference)"
              opacity=".55"
              rx="2"
            />
            <rect
              x={76 + i * 66}
              y={188 - (iv[i] / height) * 150}
              width="24"
              height={(iv[i] / height) * 150}
              fill="var(--accent)"
              rx="2"
            />
          </g>
        ))}
        {[0, 0.5, 1].map((v) => (
          <text
            key={v}
            x={45 + v * 525}
            y="217"
            textAnchor={v === 0 ? "start" : v === 1 ? "end" : "middle"}
            className="axis-label"
          >
            {money(min + span * v, 0)}
          </text>
        ))}
      </svg>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
