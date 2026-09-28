#include "../engine/exchange.hpp"
#include <cassert>
#include <iostream>
Exchange make() {
  Exchange e;
  e.feeBps = 0;
  for (int i = 0; i < 4; i++) {
    Account a;
    a.id = i;
    a.name = "test";
    a.basis = 10000;
    e.accounts.push_back(a);
  }
  return e;
}
int main() {
  {
    auto e = make();
    auto first = e.submit(0, false, 9990, 6, false, 0);
    e.submit(1, false, 9990, 5, false, 1);
    e.submit(2, true, 10000, 10, false, 2);
    assert(e.trades.size() == 2 && e.trades[0].seller == 0 &&
           e.trades[0].qty == 6 && e.trades[1].qty == 4);
    assert(!e.orders.count(first));
    assert(e.asks.begin()->first == 9990);
    e.validate(40000000, 2000);
  }
  {
    auto e = make();
    e.submit(0, false, 9990, 6, false, 0);
    e.submit(1, true, 10000, 10, false, 1);
    assert(e.bids.begin()->first == 10000 &&
           e.orders.at(e.bids.begin()->second.front()).order.qty == 4);
    e.cancelAll(1);
    assert(e.bids.empty() && e.accounts[1].reservedCash == 0);
    e.validate(40000000, 2000);
  }
  {
    auto e = make();
    e.submit(0, false, 10010, 3, false, 0);
    e.submit(1, false, 10000, 2, false, 0);
    e.submit(2, true, 0, 100, true, 1);
    assert(e.trades.size() == 2 && e.trades[0].price == 10000 &&
           e.trades[1].price == 10010 && e.orders.empty());
    e.validate(40000000, 2000);
  }
  {
    auto e = make();
    auto id = e.submit(0, true, 10000, 5000, false, 0);
    assert(e.accounts[0].reservedCash == 10000000);
    assert(e.submit(0, true, 10000, 5, false, 1) == 0);
    e.cancel(id);
    e.cancel(id);
    assert(!e.accounts[0].reservedCash);
    e.submit(1, false, 10000, 600, false, 1);
    assert(e.accounts[1].reservedShares == 500);
    e.validate(40000000, 2000);
  }
  {
    auto e = make();
    e.feeBps = 2;
    e.submit(0, false, 10000, 10, false, 0);
    e.submit(1, true, 0, 10, true, 1);
    assert(e.totalFees == 40 && e.accounts[1].fees == 20);
    e.validate(40000000, 2000);
  }
  {
    auto e = make();
    e.submit(0, false, 10000, 10, false, 0);
    e.submit(0, true, 10000, 10, false, 1);
    assert(e.trades.empty() && e.asks.empty());
    e.validate(40000000, 2000);
  }
  {
    auto e = make();
    e.submit(0, true, 0, 10, true, 0);
    assert(e.orders.empty() && e.trades.empty());
  }
  std::cout << "7 matching, reservation, fee and conservation tests passed\n";
}
