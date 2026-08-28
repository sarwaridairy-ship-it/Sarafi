import { describe, expect, it } from 'vitest'
import { deriveTradeAmounts } from './tradePricing'

describe('trade rate selection', () => {
  it('uses the displayed buy rate for buy calculations', () => {
    expect(deriveTradeAmounts('BUY_FX', '1000', '70', '71')).toMatchObject({ rate: '70.000000000000', boughtAmount: '14.285714285714', soldBaseValue: '1000.000000000000' })
  })
  it('uses the displayed sell rate for sell calculations', () => {
    expect(deriveTradeAmounts('SELL_FX', '10', '70', '71')).toMatchObject({ rate: '71.000000000000', boughtAmount: '710.000000000000', soldBaseValue: '710.000000000000', boughtBaseValue: '710.000000000000' })
  })
})