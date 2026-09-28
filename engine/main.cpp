#include "exchange.hpp"
#include <iostream>
#include <memory>
#include <queue>
#include <random>
constexpr const char *VERSION = "aurex-1.0.0";
struct Event {
  I time, seq;
  int type, owner;
  bool buy = false;
  I price = 0, qty = 0;
  bool market = false;
};
struct Later {
  bool operator()(const Event &a, const Event &b) const {
    return a.time == b.time ? a.seq > b.seq : a.time > b.time;
  }
};
struct Sim {
  Exchange ex;
  json config;
  std::priority_queue<Event, std::vector<Event>, Later> queue;
  std::mt19937_64 valueRng;
  std::vector<std::mt19937_64> rng;
  I now = 0, seq = 0, processed = 0, end = 240000, initialCash = 0,
    initialShares = 0;
  double value = 10000, start = 10000, vol = .8, pressure = 0;
  I latency = 80;
  int execId = -1;
  I target = 200;
  std::vector<std::pair<I, double>> valueHistory;
  json history = json::array(), changes = json::array();
  double spreadSum = 0, depthSum = 0;
  I samples = 0, spreadSamples = 0;
  double random(std::mt19937_64 &r) { return (r() >> 11) * 0x1.0p-53; }
  double normal(std::mt19937_64 &r) {
    double u = std::max(1e-12, random(r));
    return std::sqrt(-2 * std::log(u)) *
           std::cos(6.283185307179586 * random(r));
  }
  void push(I t, int type, int owner = -1, bool buy = false, I p = 0, I q = 0,
            bool market = false) {
    queue.push({t, seq++, type, owner, buy, p, q, market});
  }
  Sim(json c) : config(c), valueRng(c.value("seed", 42)) {
    start = value = std::llround(c.value("price", 100.0) * 100);
    end = c.value("duration", 240) * 1000LL;
    vol = c.value("volatility", .8);
    pressure = c.value("pressure", 0.0);
    latency = c.value("latency", 80);
    ex.feeBps = c.value("fees", 1.0);
    target = c.value("target", 200);
    ex.last = (I)start;
    auto add = [&](std::string name, std::string kind) {
      int id = ex.accounts.size();
      Account a;
      a.id = id;
      a.name = name;
      a.kind = kind;
      a.basis = start;
      a.initialEquity = a.peakEquity = a.cash + a.shares * start;
      a.maxInventory = a.shares;
      ex.accounts.push_back(a);
      rng.emplace_back((unsigned long long)c.value("seed", 42) * 104729ULL +
                       id * 7919ULL + 13);
      initialCash += a.cash;
      initialShares += a.shares;
    };
    add("Atlas", c.value("focal", "inventory"));
    add("Meridian", "fixed");
    for (int i = 0; i < c.value("noise", 6); i++)
      add("Flow " + std::to_string(i + 1), "noise");
    if (c.value("execution", true)) {
      execId = ex.accounts.size();
      add("Tempo", "execution");
    }
    valueHistory.push_back({0, value});
    for (int i = 0; i < 2; i++) {
      ex.submit(i, true, start - 8 - i * 3, 30, false, 0);
      ex.submit(i, false, start + 8 + i * 3, 30, false, 0);
    }
    for (auto &a : ex.accounts)
      push(100 + a.id * 31, 1, a.id);
    push(1000, 0);
    push(0, 4);
    if (c.value("shock", false))
      push(end / 2, 5, -1, false, c.value("shockPct", -2.0) * 100);
  }
  double observed(I t) {
    auto it = std::upper_bound(valueHistory.begin(), valueHistory.end(), t,
                               [](I x, const auto &p) { return x < p.first; });
    return it == valueHistory.begin() ? valueHistory.front().second
                                      : std::prev(it)->second;
  }
  void decision(int id) {
    auto &a = ex.accounts[id];
    auto &r = rng[id];
    double z = normal(r), u = random(r), v = random(r);
    double fair = observed(std::max(0LL, now - latency));
    push(now + latency, 2, id);
    if (a.kind == "fixed" || a.kind == "inventory") {
      double skew = a.kind == "inventory" ? (a.shares - 500) * .12 : 0;
      I center = std::llround(fair - skew);
      I width = 8 + (I)(vol * 3);
      push(now + latency, 3, id, true, std::max(1LL, center - width), 30);
      push(now + latency, 3, id, false, std::max(1LL, center + width), 30);
      a.note(a.kind == "inventory"
                 ? (skew > 1    ? "Lowered quotes to reduce inventory"
                    : skew < -1 ? "Raised quotes to rebuild inventory"
                                : "Quoting around observed value")
                 : "Maintaining a symmetric fixed spread");
      push(now + 450, 1, id);
    } else if (a.kind == "execution") {
      I scheduled = std::min(target, (I)std::ceil((double)target * now / end));
      I q = std::min(20LL, std::max(0LL, scheduled - a.bought));
      if (q) {
        push(now + latency, 3, id, true, 0, q, true);
        a.note("Buying the next scheduled execution slice");
      }
      push(now + 1000, 1, id);
    } else {
      bool buy = u < .5 + pressure * .4;
      bool market = v < .65;
      I p = std::max(1LL, (I)std::llround(fair + z * 12 + (buy ? -4 : 4)));
      I q = 3 + (I)(std::abs(z) * 8);
      push(now + latency, 3, id, buy, p, q, market);
      a.note(
          std::string(buy ? "Buying" : "Selling") +
          (market ? " at available liquidity" : " with a patient limit order"));
      push(now + 650 + id * 37, 1, id);
    }
  }
  void mark() {
    for (auto &a : ex.accounts) {
      double e = a.cash + a.shares * value;
      a.peakEquity = std::max(a.peakEquity, e);
      a.maxDrawdown = std::max(a.maxDrawdown, a.peakEquity - e);
      a.maxInventory = std::max(a.maxInventory, a.shares);
    }
  }
  void sample() {
    json p = {{"time", now / 1000.0},
              {"price", ex.last / 100.0},
              {"value", value / 100.0}};
    double spread =
        ex.bids.empty() || ex.asks.empty()
            ? 0
            : (ex.asks.begin()->first - ex.bids.begin()->first) / 100.0;
    p["spread"] = spread;
    json pn = json::array();
    for (auto &a : ex.accounts)
      pn.push_back((a.cash + a.shares * value - a.initialEquity) / 100);
    p["pnl"] = pn;
    history.push_back(p);
    if (!ex.bids.empty() && !ex.asks.empty()) {
      spreadSum += spread;
      spreadSamples++;
    }
    I d = 0;
    for (auto &[id, l] : ex.orders)
      d += l.order.qty;
    depthSum += d;
    samples++;
  }
  bool step() {
    if (queue.empty() || queue.top().time > end) {
      if (now < end) {
        now = end;
        mark();
        sample();
      }
      return false;
    }
    auto e = queue.top();
    queue.pop();
    now = e.time;
    processed++;
    if (e.type == 0) {
      value = std::max(100.0, value + start * vol / 100 * normal(valueRng) /
                                          std::sqrt(60.0));
      valueHistory.push_back({now, value});
      push(now + 1000, 0);
    }
    if (e.type == 1)
      decision(e.owner);
    if (e.type == 2)
      ex.cancelAll(e.owner);
    if (e.type == 3)
      ex.submit(e.owner, e.buy, e.price, e.qty, e.market, now);
    if (e.type == 4) {
      sample();
      push(now + 1000, 4);
    }
    if (e.type == 5) {
      value = std::max(100.0, value * (1 + e.price / 10000.0));
      valueHistory.push_back({now, value});
      changes.push_back({{"time", now / 1000.0},
                         {"type", "value_shock"},
                         {"percent", e.price / 100.0}});
    }
    mark();
    ex.validate(initialCash, initialShares);
    return true;
  }
  bool done() const { return queue.empty() || queue.top().time > end; }
  json snapshot() {
    json bots = json::array();
    double mid = (!ex.bids.empty() && !ex.asks.empty())
                     ? (ex.bids.begin()->first + ex.asks.begin()->first) / 2.0
                     : ex.last;
    for (auto &a : ex.accounts) {
      json quotes = json::array();
      for (auto &[id, l] : ex.orders)
        if (l.order.owner == a.id)
          quotes.push_back({{"id", id},
                            {"side", l.order.buy ? "buy" : "sell"},
                            {"price", l.order.price / 100.0},
                            {"quantity", l.order.qty}});
      std::sort(quotes.begin(), quotes.end(), [](const json &a, const json &b) {
        return a["id"].get<I>() < b["id"].get<I>();
      });
      bots.push_back(
          {{"id", a.id},
           {"name", a.name},
           {"kind", a.kind},
           {"cash", a.cash / 100.0},
           {"inventory", a.shares},
           {"reservedCash", a.reservedCash / 100.0},
           {"reservedShares", a.reservedShares},
           {"fees", a.fees / 100.0},
           {"pnl", (a.cash + a.shares * value - a.initialEquity) / 100},
           {"midPnl", (a.cash + a.shares * mid - a.initialEquity) / 100},
           {"realized", a.realized / 100},
           {"unrealized", a.shares * (value - a.basis) / 100},
           {"volume", a.volume},
           {"bought", a.bought},
           {"averageFill",
            a.bought ? (10000000 - a.cash - a.fees) / 100.0 / a.bought : 0},
           {"executionCost", (10000000 - a.cash) / 100.0},
           {"shortfall", (10000000 - a.cash - a.bought * start) / 100.0},
           {"maxInventory", a.maxInventory},
           {"drawdown", a.maxDrawdown / 100},
           {"actions", a.actions},
           {"quotes", quotes}});
    }
    json bids = json::array(), asks = json::array(), tape = json::array();
    for (auto &[p, ids] : ex.bids) {
      I q = 0;
      for (I id : ids)
        q += ex.orders.at(id).order.qty;
      bids.push_back({{"price", p / 100.0}, {"quantity", q}});
      if (bids.size() == 10)
        break;
    }
    for (auto &[p, ids] : ex.asks) {
      I q = 0;
      for (I id : ids)
        q += ex.orders.at(id).order.qty;
      asks.push_back({{"price", p / 100.0}, {"quantity", q}});
      if (asks.size() == 10)
        break;
    }
    for (int i = (int)ex.trades.size() - 1;
         i >= std::max(0, (int)ex.trades.size() - 30); i--) {
      auto &t = ex.trades[i];
      tape.push_back({{"id", t.id},
                      {"time", t.time / 1000.0},
                      {"price", t.price / 100.0},
                      {"quantity", t.qty},
                      {"side", t.buy ? "buy" : "sell"},
                      {"buyer", t.buyer},
                      {"seller", t.seller}});
    }
    return {
        {"version", VERSION},
        {"time", now / 1000.0},
        {"events", processed},
        {"done", done()},
        {"price", ex.last / 100.0},
        {"value", value / 100.0},
        {"volume", ex.totalVolume},
        {"tradeCount", ex.trades.size()},
        {"fees", ex.totalFees / 100.0},
        {"spread",
         bids.empty() || asks.empty()
             ? json(nullptr)
             : json((ex.asks.begin()->first - ex.bids.begin()->first) / 100.0)},
        {"averageSpread", spreadSamples ? spreadSum / spreadSamples : 0},
        {"averageDepth", samples ? depthSum / samples : 0},
        {"bots", bots},
        {"bids", bids},
        {"asks", asks},
        {"trades", tape},
        {"history", history},
        {"changes", changes},
        {"config", config}};
  }
};
int main(int argc, char **argv) {
  try {
    if (argc > 1 && std::string(argv[1]) == "--run") {
      json c;
      std::cin >> c;
      Sim s(c);
      while (s.step()) {
      }
      std::cout << s.snapshot().dump() << "\n";
      return 0;
    }
    std::unique_ptr<Sim> s;
    std::string line;
    while (std::getline(std::cin, line)) {
      try {
        auto j = json::parse(line);
        auto cmd = j.value("command", std::string("snapshot"));
        if (cmd == "init")
          s = std::make_unique<Sim>(j.at("config"));
        if (!s)
          throw std::runtime_error("Initialize first");
        if (cmd == "step")
          for (int i = 0; i < j.value("count", 1); i++)
            if (!s->step())
              break;
        if (cmd == "shock")
          s->push(s->now, 5, -1, false,
                  (I)std::llround(j.value("percent", -2.0) * 100));
        std::cout << s->snapshot().dump() << std::endl;
      } catch (std::exception &e) {
        std::cout << json({{"error", e.what()}}).dump() << std::endl;
      }
    }
  } catch (std::exception &e) {
    std::cerr << e.what() << "\n";
    return 1;
  }
}
