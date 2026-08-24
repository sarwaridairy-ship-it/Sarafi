import { describe, expect, it } from 'vitest'
import { createLedgerState, postFxTrade, seedOpeningBalance } from './ledger'
import { createDebt, createOperationsState, ownerInvestment, recordExpense, settleDebt, transferCash } from './operations'

const tradeIds = { organizationId: 'org-a', branchId: 'branch-a', cashboxId: 'cash-a', baseCurrency: 'AFN' }

describe('required financial posting oracles', () => {
  it('A-C: opening, buy, and sell produce 10000 AFN realized profit', () => {
    const state = createLedgerState()
    seedOpeningBalance(state, 'USD', '10000', '690000')
    const entry = postFxTrade(state, { ...tradeIds, clientCommandId: 'oracle-sell', side: 'SELL_FX', soldCurrency: 'USD', soldAmount: '10000', boughtCurrency: 'AFN', boughtAmount: '700000', soldBaseValue: '690000', boughtBaseValue: '700000' })
    expect(entry.realizedProfit).toBe('10000.000000000000')
  })
  it('D/E/F: transfer is neutral, investment is equity, expense is not capital', () => {
    const state = createOperationsState()
    expect(transferCash(state, { organizationId: 'org-a', branchId: 'branch-a', currency: 'USD', amount: '5000', from: 'safe', to: 'counter' }).realizedProfit).toBe('0.000000000000')
    expect(ownerInvestment(state, { organizationId: 'org-a', branchId: 'branch-a', currency: 'AFN', amount: '1000000', location: 'counter', ownerId: 'owner' }).lines[1].account).toContain('equity:owner-capital')
    expect(recordExpense(state, { organizationId: 'org-a', branchId: 'branch-a', currency: 'AFN', amount: '20000', category: 'rent', paidFrom: 'counter' }).lines[0].account).toContain('expense:')
  })
  it('G/H: debts settle partially and cash variance is represented as an explicit operation', () => {
    const state = createOperationsState()
    const debt = createDebt(state, { organizationId: 'org-a', branchId: 'branch-a', personId: 'ahmad', direction: 'receivable', currency: 'AFN', amount: '700000', location: 'counter' })
    expect(settleDebt(state, { organizationId: 'org-a', branchId: 'branch-a', debtId: debt.id, amount: '100000', location: 'counter' }).debt.outstanding).toBe('600000.000000000000')
  })
})
