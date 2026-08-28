import { describe, expect, it } from 'vitest'
import { createLedgerState, postFxTrade, seedOpeningBalance } from './ledger'
import { summarizeProfit } from './reporting'

describe('synthetic performance budgets', () => {
  it('summarizes 5000 synthetic journal entries within a local budget', () => {
    const state = createLedgerState()
    seedOpeningBalance(state, 'USD', '5000000', '350000000')
    for (let index = 0; index < 5000; index += 1) postFxTrade(state, { organizationId: 'org-a', branchId: 'branch-a', cashboxId: 'cash-a', clientCommandId: `perf-${index}`, side: 'SELL_FX', soldCurrency: 'USD', soldAmount: '100', boughtCurrency: 'AFN', boughtAmount: '7100', baseCurrency: 'AFN', soldBaseValue: '7000', boughtBaseValue: '7100' })
    const started = performance.now()
    const result = summarizeProfit(state.entries, { organizationId: 'org-a' })
    const elapsed = performance.now() - started
    expect(result.transactionCount).toBe(5000)
    expect(elapsed).toBeLessThan(250)
  })

  it('summarizes 50000 synthetic journal entries within an extended budget', () => {
    const entries = Array.from({ length: 50000 }, (_, index) => ({ id: `perf-50k-${index}`, organizationId: 'org-a', branchId: 'branch-a', status: 'posted' as const, sourceType: 'SELL_FX', clientCommandId: `perf-50k-${index}`, occurredAt: new Date(2026, 0, 1 + (index % 28)).toISOString(), realizedProfit: '100.000000000000', lines: [] }))
    const started = performance.now()
    const result = summarizeProfit(entries, { organizationId: 'org-a' })
    const elapsed = performance.now() - started
    expect(result.transactionCount).toBe(50000)
    expect(elapsed).toBeLessThan(2500)
  }, 15000)
})
