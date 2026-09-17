import Decimal from 'decimal.js'

// Match the database's decimal arithmetic, including small FX quotes.
const RateDecimal = Decimal.clone({ precision: 50 })

export function positiveRate(value: string | number | null | undefined): boolean {
  try {
    const rate = new RateDecimal(value ?? '')
    return rate.isFinite() && rate.gt(0)
  } catch { return false }
}

export function midpointRate(buy: string | number, sell: string | number): string {
  return new RateDecimal(buy).plus(sell).div(2).toFixed()
}

export function rateOutsideTolerance(entered: string | undefined, approved: string | undefined, tolerance: string | number = 50): boolean {
  if (!positiveRate(entered) || !positiveRate(approved)) return false
  return new RateDecimal(entered!).minus(approved!).abs().times(10000).div(approved!).gt(tolerance)
}
