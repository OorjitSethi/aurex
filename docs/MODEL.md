# Simulation model and accounting

- One fictional asset, one-cent integer price ticks, integer shares, integer-cent cash balances.
- Orders match by price, then arrival order, at the resting price. Market-order remainders are canceled. Self-crossing cancels the trader's own resting order before continuing; no self-trades occur.
- Ordered price maps, FIFO lists, and an order-ID location index support matching and indexed cancellation.
- All traders start with $100,000 cash and 500 shares, acquired at opening underlying value. No short selling, borrowing, or margin. Buy orders reserve worst-case cash including per-share rounded fees; sell orders reserve shares. Actual fees round upward to cents per side per fill. Cash, inventory, reservations, and fee conservation are validated after every event.
- Event priority is `(simulation milliseconds, sequence number)`. Decisions, order arrivals, cancellations, value changes, samples, and shocks are distinct scheduled events.
- Underlying value is an arithmetic Gaussian process updated once per simulated second with a $1 floor. Volatility is expressed as percent of starting value per square-root minute. A seeded optional shock changes its level halfway through. This is a controlled reference process, not a valuation claim.
- Each actor has its own seeded random stream; underlying value has a separate stream. Strategy comparisons retain the same exogenous value and background random streams, although executions and funding constraints can diverge.
- Information and order delays are each the configured latency. Agents see underlying value no more recent than the delayed observation time. Agent decisions do not access future value draws.
- Fixed-spread market makers quote around delayed value. The inventory-aware maker additionally shifts its center by 0.12 cents per share away from its 500-share inventory target. Quote half-width is 8 + floor(3 × volatility) cents; each side targets 30 shares. These are baseline model parameters, not fitted recommendations.
- Background traders alternate market and patient limit orders with configurable directional bias. Tempo attempts uniform accumulation in one-second slices; delays, liquidity, and finite resources can leave it short of its target at the deadline.
- Net P&L = cash + shares × underlying value − initial equity. Realized P&L uses moving average cost. Realized + unrealized − fees equals net P&L. Midpoint-marked P&L is also provided, with last trade as fallback for a one-sided book. Execution shortfall includes fees and only filled shares; completion is reported separately.
- Spread and depth are sampled once per second. Average spread excludes one-sided books. Maximum drawdown includes both trading and initial-inventory exposure. Experiment intervals use mean ± 1.96 sample standard errors; the difference interval uses within-seed differences. Small samples are exploratory. No automatic parameter tuning or claims of real-market profitability.


## Interpretation and limits

The implementation is an educational experimental environment, not a calibrated model of a particular exchange. It uses a single asset, fixed initial endowments, simple baseline strategies, and one configurable delay shared across agents. There are no auctions, hidden liquidity, borrowing, or margin rules. Floating-point value-process calculations can differ across compiler/platform builds; exact replay is checked against the same engine build.

Display snapshots are sampled and may be thinned for long runs; the saved engine command journal preserves the sequence needed to reproduce events.
