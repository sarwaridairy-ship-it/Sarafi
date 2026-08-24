import { describe, expect, it } from 'vitest'
import { bankMovement, buyCurrency, createDebt, createOperationsState, hawalaSend, ownerInvestment, recordExpense, sellCurrency, settleDebt, transferCash } from './operations'

const ids = { organizationId: 'org-a', branchId: 'branch-a', cashboxId: 'cash-a' }

describe('daily Sarafi operations', () => {
  it('records buy and sell trades with stable receipts', () => {
    const state = createOperationsState()
    const bought = buyCurrency(state, { ...ids, receivedCurrency: 'USD', receivedAmount: '10000', paidCurrency: 'AFN', paidAmount: '690000', receivedBaseValue: '690000', paidBaseValue: '690000', clientCommandId: 'buy-1' })
    const sold = sellCurrency(state, { ...ids, givenCurrency: 'USD', givenAmount: '10000', receivedCurrency: 'AFN', receivedAmount: '700000', givenBaseValue: '690000', receivedBaseValue: '700000', clientCommandId: 'sell-1' })
    expect(bought.receipt.number).toBe('SAR-00000001')
    expect(sold.entry.realizedProfit).toBe('10000.000000000000')
    expect(state.entries).toHaveLength(2)
  })

  it('creates and partially settles first-class debt', () => {
    const state = createOperationsState()
    const debt = createDebt(state, { ...ids, personId: 'person-1', direction: 'receivable', currency: 'USD', amount: '3000', location: 'counter-1' })
    const settlement = settleDebt(state, { ...ids, debtId: debt.id, amount: '1250', location: 'counter-1' })
    expect(settlement.debt.outstanding).toBe('1750.000000000000')
    expect(() => settleDebt(state, { ...ids, debtId: debt.id, amount: '2000', location: 'counter-1' })).toThrow('exceeds')
  })

  it('supports non-trade money movements without turning them into revenue', () => {
    const state = createOperationsState()
    expect(recordExpense(state, { ...ids, currency: 'AFN', amount: '5000', category: 'rent', paidFrom: 'cash-a' }).lines[0].account).toContain('expense:')
    expect(ownerInvestment(state, { ...ids, currency: 'USD', amount: '1000', location: 'bank-1', ownerId: 'owner-1' }).lines[0].currency).toBe('USD')
    expect(transferCash(state, { ...ids, currency: 'AFN', amount: '100', from: 'safe-1', to: 'counter-1' }).realizedProfit).toBe('0.000000000000')
    expect(bankMovement(state, { ...ids, currency: 'USD', amount: '100', from: 'cash-a', to: 'bank-a', direction: 'deposit' }).status).toBe('posted')
  })

  it('keeps Hawala behind a feature flag', () => {
    const state = createOperationsState()
    const input = { senderId: 'person-1', beneficiaryName: 'A. Khan', origin: 'Kabul', destination: 'Herat', partnerId: 'partner-1', currency: 'USD', amount: '100', fee: '2', reference: 'H-001' }
    expect(() => hawalaSend(state, { ...input, enabled: false })).toThrow('disabled')
    expect(hawalaSend(state, { ...input, enabled: true }).status).toBe('created')
  })
})
