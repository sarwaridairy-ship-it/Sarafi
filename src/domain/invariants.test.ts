import { describe, it } from 'vitest'
import fc from 'fast-check'
import Decimal from 'decimal.js'
import { createLedgerState, postFxTrade, seedOpeningBalance } from './ledger'

const ids = { organizationId: 'org-a', branchId: 'branch-a', cashboxId: 'cash-a', baseCurrency: 'AFN' }

describe('randomized financial invariants', () => {
  it('keeps posted base debits equal to credits across supported sell sequences', () => {
    fc.assert(fc.property(fc.array(fc.integer({ min: 1, max: 1000 }), { minLength: 1, maxLength: 12 }), (amounts) => {
      const state = createLedgerState()
      seedOpeningBalance(state, 'USD', String(amounts.reduce((sum, amount) => sum + amount, 0)), '700000')
      for (const [index, amount] of amounts.entries()) {
        const entry = postFxTrade(state, { ...ids, clientCommandId: `sequence-${index}`, side: 'SELL_FX', soldCurrency: 'USD', soldAmount: String(amount), boughtCurrency: 'AFN', boughtAmount: String(amount * 71), soldBaseValue: String(amount * 70), boughtBaseValue: String(amount * 71) })
        const debit = entry.lines.reduce((total, line) => total.plus(line.baseDebit), new Decimal(0))
        const credit = entry.lines.reduce((total, line) => total.plus(line.baseCredit), new Decimal(0))
        if (!debit.eq(credit)) return false
      }
      return true
    }))
  })

  it('does not duplicate a command under replay', () => {
    fc.assert(fc.property(fc.integer({ min: 1, max: 10000 }), (amount) => {
      const state = createLedgerState()
      seedOpeningBalance(state, 'USD', String(amount), String(amount * 70))
      const command = { ...ids, clientCommandId: 'replay', side: 'SELL_FX' as const, soldCurrency: 'USD', soldAmount: String(amount), boughtCurrency: 'AFN', boughtAmount: String(amount * 71), soldBaseValue: String(amount * 70), boughtBaseValue: String(amount * 71) }
      const first = postFxTrade(state, command)
      const retry = postFxTrade(state, command)
      return first.id === retry.id && state.entries.length === 1
    }))
  })
})
