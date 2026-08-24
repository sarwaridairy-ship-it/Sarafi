import Decimal from 'decimal.js'
import type { CurrencyPosition, LedgerState } from './ledger'

Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP })

export type RateConvention = 'AFN_PER_UNIT' | 'UNITS_PER_AFN'
export type RateBoardEntry = { id: string; organizationId: string; branchId?: string; fromCurrency: string; toCurrency: string; buyRate: string; sellRate: string; group: 'retail' | 'wholesale' | 'vip'; effectiveFrom: string; changedBy: string; active: boolean }
export type ValuationRate = { currency: string; baseCurrency: string; rate: string; source: 'owner' | 'reference'; effectiveAt: string; recordedBy: string }
export type PositionView = { currency: string; quantity: string; receivable: string; payable: string; netQuantity: string; carryingBaseValue: string; currentBaseValue: string; unrealizedChange: string; realizedProfit: string }
export type LocationBalance = { location: string; currency: string; quantity: string; kind: 'asset' | 'receivable' | 'payable' }

export function calculateCounterAmount(amount: string, rate: string, convention: RateConvention, precision = 2): string {
  const source = new Decimal(amount)
  const appliedRate = new Decimal(rate)
  if (!source.isFinite() || source.isNegative() || appliedRate.isZero() || appliedRate.isNegative()) throw new Error('Amount and rate must be valid non-negative decimals')
  const result = convention === 'AFN_PER_UNIT' ? source.mul(appliedRate) : source.div(appliedRate)
  return result.toDecimalPlaces(precision, Decimal.ROUND_HALF_UP).toFixed(precision)
}

export function weightedAverageAfterPurchase(position: CurrencyPosition | undefined, quantity: string, baseValue: string): CurrencyPosition {
  const existing = position ?? { quantity: new Decimal(0), carryingCost: new Decimal(0) }
  const purchasedQuantity = new Decimal(quantity)
  const purchasedCost = new Decimal(baseValue)
  if (purchasedQuantity.lte(0) || purchasedCost.lt(0)) throw new Error('Purchase quantity and value are invalid')
  return { quantity: existing.quantity.plus(purchasedQuantity), carryingCost: existing.carryingCost.plus(purchasedCost) }
}

export function weightedAverageAfterSale(position: CurrencyPosition, quantity: string): { position: CurrencyPosition; costRemoved: Decimal } {
  const soldQuantity = new Decimal(quantity)
  if (soldQuantity.lte(0) || soldQuantity.gt(position.quantity)) throw new Error('Sale exceeds available inventory')
  const averageCost = position.quantity.isZero() ? new Decimal(0) : position.carryingCost.div(position.quantity)
  const costRemoved = averageCost.mul(soldQuantity)
  return { position: { quantity: position.quantity.minus(soldQuantity), carryingCost: position.carryingCost.minus(costRemoved) }, costRemoved }
}

export function buildPositionView(state: LedgerState, currency: string, valuationRate?: string, receivable = '0', payable = '0', realizedProfit = '0'): PositionView {
  const position = state.positions[currency] ?? { quantity: new Decimal(0), carryingCost: new Decimal(0) }
  const currentValue = valuationRate ? position.quantity.mul(valuationRate) : new Decimal(0)
  const unrealized = valuationRate ? currentValue.minus(position.carryingCost) : new Decimal(0)
  const net = position.quantity.plus(receivable).minus(payable)
  return { currency, quantity: position.quantity.toFixed(12), receivable: new Decimal(receivable).toFixed(12), payable: new Decimal(payable).toFixed(12), netQuantity: net.toFixed(12), carryingBaseValue: position.carryingCost.toFixed(12), currentBaseValue: currentValue.toFixed(12), unrealizedChange: unrealized.toFixed(12), realizedProfit: new Decimal(realizedProfit).toFixed(12) }
}

export function buildLocationBalances(state: LedgerState): LocationBalance[] {
  return Object.entries(state.positions).map(([currency, position]) => ({ location: 'Ledger assets', currency, quantity: position.quantity.toFixed(12), kind: 'asset' }))
}

export function createDailySnapshot(state: LedgerState, rates: ValuationRate[], snapshotDate: string) {
  return { snapshotDate, createdAt: new Date().toISOString(), balances: buildLocationBalances(state), valuationRates: rates, rebuildSource: 'journal_lines' as const }
}
