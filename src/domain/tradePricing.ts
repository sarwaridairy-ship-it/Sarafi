import Decimal from 'decimal.js'

export function deriveTradeAmounts(side: 'BUY_FX' | 'SELL_FX' | 'EXCHANGE_FX', soldAmount: string, buyRate: string, sellRate: string) {
  const amount = new Decimal(soldAmount)
  const rate = new Decimal(side === 'BUY_FX' ? buyRate : sellRate)
  if (!amount.isFinite() || amount.lte(0) || !rate.isFinite() || rate.lte(0)) throw new Error('Amount and rate must be positive')
  const boughtAmount = side === 'BUY_FX' ? amount.div(rate) : amount.mul(rate)
  const baseValue = side === 'BUY_FX' ? amount : boughtAmount
  return { rate: rate.toFixed(12), boughtAmount: boughtAmount.toFixed(12), soldBaseValue: baseValue.toFixed(12), boughtBaseValue: baseValue.toFixed(12) }
}