import { describe, expect, it } from 'vitest'
import Decimal from 'decimal.js'
import fc from 'fast-check'
import { buildPositionView, calculateCounterAmount, weightedAverageAfterPurchase, weightedAverageAfterSale } from './valuation'
import { createLedgerState, seedOpeningBalance } from './ledger'

describe('rates, costing, and valuation', () => {
  it('calculates either side of an AFN/USD rate without binary floating point', () => {
    expect(calculateCounterAmount('10000', '69.1234', 'AFN_PER_UNIT', 2)).toBe('691234.00')
    expect(calculateCounterAmount('691234', '69.1234', 'UNITS_PER_AFN', 4)).toBe('10000.0000')
  })

  it('keeps weighted average cost through multiple purchases and partial sale', () => {
    let position = weightedAverageAfterPurchase(undefined, '10000', '690000')
    position = weightedAverageAfterPurchase(position, '5000', '350000')
    expect(position.quantity.toFixed()).toBe('15000')
    expect(position.carryingCost.div(position.quantity).toFixed(2)).toBe('69.33')
    const sale = weightedAverageAfterSale(position, '6000')
    expect(sale.costRemoved.toFixed(2)).toBe('416000.00')
    expect(sale.position.quantity.toFixed()).toBe('9000')
    expect(sale.position.carryingCost.toFixed(2)).toBe('624000.00')
  })

  it('does not mix realized and unrealized results', () => {
    const state = createLedgerState()
    seedOpeningBalance(state, 'USD', '10000', '690000')
    const view = buildPositionView(state, 'USD', '71', '0', '0', '10000')
    expect(view.currentBaseValue).toBe('710000.000000000000')
    expect(view.unrealizedChange).toBe('20000.000000000000')
    expect(view.realizedProfit).toBe('10000.000000000000')
  })

  it('rejects invalid rates and sale quantities', () => {
    expect(() => calculateCounterAmount('1', '0', 'AFN_PER_UNIT')).toThrow()
    expect(() => weightedAverageAfterSale({ quantity: new Decimal(1), carryingCost: new Decimal(70) }, '2')).toThrow()
  })

  it('preserves quantity and carrying value invariants across randomized purchases and sales', () => {
    fc.assert(fc.property(fc.integer({ min: 1, max: 10000 }), fc.integer({ min: 1, max: 1000000 }), (quantity, unitCost) => {
      const purchased = weightedAverageAfterPurchase(undefined, String(quantity), String(quantity * unitCost))
      const sold = weightedAverageAfterSale(purchased, String(quantity))
      return sold.position.quantity.eq(0) && sold.position.carryingCost.eq(0) && sold.costRemoved.eq(quantity * unitCost)
    }), { numRuns: 50 })
  })
})
