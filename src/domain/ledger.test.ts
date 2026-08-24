import { describe, expect, it } from 'vitest'
import Decimal from 'decimal.js'
import { createLedgerState, postFxTrade, reverseEntry, seedOpeningBalance, weightedAverageCost } from './ledger'

const command = (overrides: Partial<Parameters<typeof postFxTrade>[1]> = {}) => ({ organizationId: 'org-a', branchId: 'branch-kabul', cashboxId: 'counter-01', clientCommandId: 'cmd-001', side: 'SELL_FX' as const, soldCurrency: 'USD', soldAmount: '10000', boughtCurrency: 'AFN', boughtAmount: '700000', baseCurrency: 'AFN', soldBaseValue: '690000', boughtBaseValue: '700000', ...overrides })

describe('immutable multi-currency ledger', () => {
  it('recognizes only the realized FX profit, not gross proceeds', () => {
    const state = createLedgerState()
    seedOpeningBalance(state, 'USD', '10000', '690000')
    const entry = postFxTrade(state, command())
    expect(entry.realizedProfit).toBe('10000.000000000000')
    expect(state.positions.USD.quantity.toFixed()).toBe('0')
    expect(state.positions.AFN.quantity.toFixed()).toBe('700000')
  })

  it('keeps every posted journal balanced in base currency', () => {
    const state = createLedgerState()
    seedOpeningBalance(state, 'USD', '10000', '690000')
    const entry = postFxTrade(state, command())
    const debit = entry.lines.reduce((total, line) => total.plus(line.baseDebit), new Decimal(0))
    const credit = entry.lines.reduce((total, line) => total.plus(line.baseCredit), new Decimal(0))
    expect(debit.eq(credit)).toBe(true)
  })

  it('updates weighted average cost for later sales', () => {
    const state = createLedgerState()
    seedOpeningBalance(state, 'USD', '10000', '690000')
    postFxTrade(state, command({ clientCommandId: 'buy-001', side: 'BUY_FX', soldCurrency: 'AFN', soldAmount: '345000', boughtCurrency: 'USD', boughtAmount: '5000', soldBaseValue: '345000', boughtBaseValue: '345000' }))
    expect(weightedAverageCost(state, 'USD').toFixed()).toBe('69')
  })

  it('returns the same journal entry for a retried command', () => {
    const state = createLedgerState()
    seedOpeningBalance(state, 'USD', '10000', '690000')
    const first = postFxTrade(state, command())
    const retry = postFxTrade(state, command())
    expect(retry.id).toBe(first.id)
    expect(state.entries).toHaveLength(1)
  })

  it('supports cross-currency exchanges with consistent base values', () => {
    const state = createLedgerState()
    seedOpeningBalance(state, 'USD', '1000', '70000')
    const entry = postFxTrade(state, command({ side: 'EXCHANGE_FX', soldAmount: '1000', soldBaseValue: '70000', boughtCurrency: 'EUR', boughtAmount: '900', boughtBaseValue: '72000' }))
    expect(entry.realizedProfit).toBe('2000.000000000000')
    expect(state.positions.EUR.quantity.toFixed()).toBe('900')
  })

  it('requires a reason and preserves the original as reversed', () => {
    const state = createLedgerState()
    seedOpeningBalance(state, 'USD', '10000', '690000')
    const entry = postFxTrade(state, command())
    const reversal = reverseEntry(state, entry.id, 'Customer trade entered in error')
    expect(state.entries[0].status).toBe('reversed')
    expect(reversal.lines[0].baseDebit).toBe(entry.lines[0].baseCredit)
  })
})
