#pragma once
#include "vendor/json.hpp"
#include <algorithm>
#include <cmath>
#include <list>
#include <map>
#include <stdexcept>
#include <string>
#include <unordered_map>
#include <vector>
using json = nlohmann::json;
using I = long long;
struct Account {
  int id;
  std::string name, kind;
  I cash = 10000000, shares = 500, reservedCash = 0, reservedShares = 0,
    fees = 0, volume = 0, bought = 0;
  double basis = 0, realized = 0, initialEquity = 0, peakEquity = 0,
         maxDrawdown = 0;
  I maxInventory = 0;
  std::vector<std::string> actions;
  void note(std::string s) {
    actions.insert(actions.begin(), s);
    if (actions.size() > 8)
      actions.pop_back();
  }
};
struct Order {
  I id;
  int owner;
  bool buy;
  I price, qty;
};
struct Trade {
  I id, time, price, qty;
  int buyer, seller;
  bool buy;
};
class Exchange {
public:
  std::vector<Account> accounts;
  std::map<I, std::list<I>, std::greater<I>> bids;
  std::map<I, std::list<I>> asks;
  struct Location {
    Order order;
    std::list<I>::iterator it;
  };
  std::unordered_map<I, Location> orders;
  std::vector<Trade> trades;
  I nextOrder = 1, nextTrade = 1, totalFees = 0, totalVolume = 0, last = 10000;
  double feeBps = 1;
  I fee(I p, I q) const {
    return (I)std::ceil((double)p * q * feeBps / 10000.0);
  }
  I unitCost(I p) const { return p + fee(p, 1); }
  void cancel(I id) {
    auto f = orders.find(id);
    if (f == orders.end())
      return;
    auto o = f->second.order;
    auto &a = accounts[o.owner];
    if (o.buy) {
      a.reservedCash -= unitCost(o.price) * o.qty;
      auto l = bids.find(o.price);
      l->second.erase(f->second.it);
      if (l->second.empty())
        bids.erase(l);
    } else {
      a.reservedShares -= o.qty;
      auto l = asks.find(o.price);
      l->second.erase(f->second.it);
      if (l->second.empty())
        asks.erase(l);
    }
    orders.erase(f);
  }
  void cancelAll(int owner) {
    std::vector<I> ids;
    for (auto &[id, l] : orders)
      if (l.order.owner == owner)
        ids.push_back(id);
    std::sort(ids.begin(), ids.end());
    for (auto id : ids)
      cancel(id);
  }
  I submit(int owner, bool buy, I price, I qty, bool market, I time) {
    if (owner < 0 || owner >= (int)accounts.size() || qty <= 0 ||
        (!market && price <= 0))
      return 0;
    auto &a = accounts[owner];
    if (!buy)
      qty = std::min(qty, a.shares - a.reservedShares);
    else if (!market)
      qty = std::min(qty, (a.cash - a.reservedCash) / unitCost(price));
    if (qty <= 0)
      return 0;
    I id = nextOrder++;
    while (qty > 0) {
      I match = 0, p = 0;
      if (buy) {
        if (asks.empty())
          break;
        p = asks.begin()->first;
        if (!market && p > price)
          break;
        match = asks.begin()->second.front();
      } else {
        if (bids.empty())
          break;
        p = bids.begin()->first;
        if (!market && p < price)
          break;
        match = bids.begin()->second.front();
      }
      auto resting = orders.at(match).order;
      if (resting.owner == owner) {
        cancel(match);
        continue;
      } // cancel resting self order, never self-trade
      I q = std::min(qty, resting.qty);
      if (buy)
        q = std::min(q, (a.cash - a.reservedCash) / unitCost(p));
      if (q <= 0)
        break;
      auto &b = accounts[buy ? owner : resting.owner];
      auto &s = accounts[buy ? resting.owner : owner];
      I f = fee(p, q);
      if (resting.buy)
        b.reservedCash -= unitCost(p) * q;
      else
        s.reservedShares -= q;
      b.basis = (b.basis * b.shares + (double)p * q) / (b.shares + q);
      b.cash -= p * q + f;
      b.shares += q;
      b.bought += q;
      b.fees += f;
      b.volume += q;
      s.realized += (p - s.basis) * q;
      s.cash += p * q - f;
      s.shares -= q;
      s.fees += f;
      s.volume += q;
      if (!s.shares)
        s.basis = 0;
      totalFees += 2 * f;
      totalVolume += q;
      last = p;
      trades.push_back({nextTrade++, time, p, q, b.id, s.id, buy});
      auto &loc = orders.at(match);
      loc.order.qty -= q;
      qty -= q;
      if (!loc.order.qty)
        cancel(match);
    }
    if (qty > 0 && !market) {
      if (buy)
        qty = std::min(qty, (a.cash - a.reservedCash) / unitCost(price));
      else
        qty = std::min(qty, a.shares - a.reservedShares);
      if (qty > 0) {
        if (buy) {
          a.reservedCash += unitCost(price) * qty;
          auto &l = bids[price];
          l.push_back(id);
          orders.emplace(
              id, Location{{id, owner, buy, price, qty}, std::prev(l.end())});
        } else {
          a.reservedShares += qty;
          auto &l = asks[price];
          l.push_back(id);
          orders.emplace(
              id, Location{{id, owner, buy, price, qty}, std::prev(l.end())});
        }
      }
    }
    return id;
  }
  void validate(I initialCash, I initialShares) const {
    I cash = totalFees, shares = 0;
    std::vector<I> rc(accounts.size()), rs(accounts.size());
    for (auto &[id, l] : orders) {
      auto &o = l.order;
      if (o.qty <= 0)
        throw std::runtime_error("Nonpositive resting quantity");
      if (o.buy)
        rc[o.owner] += unitCost(o.price) * o.qty;
      else
        rs[o.owner] += o.qty;
    }
    for (auto &a : accounts) {
      cash += a.cash;
      shares += a.shares;
      if (a.cash < 0 || a.shares < 0 || a.reservedCash != rc[a.id] ||
          a.reservedShares != rs[a.id] || a.reservedCash > a.cash ||
          a.reservedShares > a.shares)
        throw std::runtime_error("Account invariant violated");
    }
    if (cash != initialCash || shares != initialShares)
      throw std::runtime_error("Conservation violated");
  }
};
