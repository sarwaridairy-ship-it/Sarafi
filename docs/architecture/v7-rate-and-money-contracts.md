# SARAFI v7 rate and My Money contracts

## Transaction-rate contract

The canonical quote is AFN per one unit of foreign currency and is stored with exact decimal semantics. The browser uses `Decimal.js` for preview only; PostgreSQL `numeric` remains authoritative.

- Buy Currency resolves only the approved shop buy side.
- Sell Currency resolves only the approved shop sell side.
- Exchange resolves the two required AFN legs without changing accounting when the display direction is swapped.
- The compact row displays Auto/manual state, `1 CCY = value AFN`, inverse, update time, and Change.
- Swapping display computes `1 / quote`; it does not mutate side, currency pair, sold/bought amount, rate context, or journal direction.
- Missing/stale rates preserve the draft, open one small exception drawer, require one relevant rate plus reason, and block Review until resolved or approved.
- A transaction-scoped manual rate has `publication_scope = transaction`; it is copied into the event evidence and never changes the public shop-rate list.
- Server validation binds organization, branch, pair, side, effective time, tolerance, and approval. A client preview cannot authorize posting.

## My Money snapshot contract

`get_money_valuation_snapshot` is the read authority. Its scope includes the active organization, permitted locations, snapshot date, comparison currency, and caller capability.

The response keeps these concepts separate:

- native available balances by currency and location;
- current-rate AFN estimated value;
- carrying/book value;
- receivables and payables;
- Hawala partner positions;
- net business position.

Only a `current` valuation rate contributes to the estimated total. A missing/stale currency remains visible with a warning and is excluded from the total. The snapshot stores its input scope, positions, totals, rate evidence, and SHA-256 content hash. A repeated equivalent request can return the same immutable evidence instead of browser-recalculating financial truth.

The inspection fixture proves the required exact example: 2,000 AFN + (2,000 TRY x 1.30) + (100 USD x 64.00) = 11,000 AFN; 11,000 / 64 = 171.875 USD.
