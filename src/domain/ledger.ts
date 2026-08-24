import Decimal from 'decimal.js'

Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP })

export type TradeSide = 'BUY_FX' | 'SELL_FX' | 'EXCHANGE_FX'
export type JournalStatus = 'posted' | 'reversed'

export type FxTradeCommand = {
  organizationId: string
  branchId: string
  cashboxId: string
  clientCommandId: string
  side: TradeSide
  soldCurrency: string
  soldAmount: string
  boughtCurrency: string
  boughtAmount: string
  baseCurrency: string
  soldBaseValue: string
  boughtBaseValue: string
  occurredAt?: string
}

export type JournalLine = {
  account: string
  currency: string
  debit: string
  credit: string
  baseDebit: string
  baseCredit: string
  nativeAmount: string
  rate?: string
}

export type JournalEntry = {
  id: string
  organizationId: string
  branchId: string
  status: JournalStatus
  sourceType: string
  clientCommandId: string
  occurredAt: string
  lines: JournalLine[]
  realizedProfit: string
}

export type CurrencyPosition = { quantity: Decimal; carryingCost: Decimal }
export type LedgerState = {
  entries: JournalEntry[]
  positions: Record<string, CurrencyPosition>
  commandReceipts: Record<string, string>
}

export class LedgerError extends Error {}

const decimal = (value: string) => {
  const parsed = new Decimal(value)
  if (!parsed.isFinite() || parsed.isNegative()) throw new LedgerError('Amounts must be finite and non-negative')
  return parsed
}
const money = (value: Decimal) => value.toFixed(12)
const sum = (lines: JournalLine[], field: 'baseDebit' | 'baseCredit') => lines.reduce((total, line) => total.plus(line[field]), new Decimal(0))

export function createLedgerState(): LedgerState {
  return { entries: [], positions: {}, commandReceipts: {} }
}

export function seedOpeningBalance(state: LedgerState, currency: string, quantity: string, baseValue: string) {
  const amount = decimal(quantity)
  const value = decimal(baseValue)
  const current = state.positions[currency] ?? { quantity: new Decimal(0), carryingCost: new Decimal(0) }
  state.positions[currency] = { quantity: current.quantity.plus(amount), carryingCost: current.carryingCost.plus(value) }
}

export function weightedAverageCost(state: LedgerState, currency: string): Decimal {
  const position = state.positions[currency]
  if (!position || position.quantity.isZero()) return new Decimal(0)
  return position.carryingCost.div(position.quantity)
}

export function postFxTrade(state: LedgerState, command: FxTradeCommand): JournalEntry {
  const existingId = state.commandReceipts[`${command.organizationId}:${command.clientCommandId}`]
  if (existingId) return state.entries.find((entry) => entry.id === existingId) as JournalEntry
  if (command.soldCurrency === command.boughtCurrency) throw new LedgerError('Trade currencies must be different')

  const sold = decimal(command.soldAmount)
  const bought = decimal(command.boughtAmount)
  const soldBase = decimal(command.soldBaseValue)
  const boughtBase = decimal(command.boughtBaseValue)
  if (sold.isZero() || bought.isZero() || soldBase.isZero() || boughtBase.isZero()) throw new LedgerError('Trade amounts must be greater than zero')

  const soldPosition = state.positions[command.soldCurrency] ?? { quantity: new Decimal(0), carryingCost: new Decimal(0) }
  const soldCost = command.side === 'BUY_FX' ? soldBase : weightedAverageCost(state, command.soldCurrency).mul(sold)
  if (command.side !== 'BUY_FX' && soldPosition.quantity.lessThan(sold)) throw new LedgerError(`Insufficient ${command.soldCurrency} inventory`)

  const realizedProfit = command.side === 'BUY_FX' ? new Decimal(0) : boughtBase.minus(soldCost)
  const lines: JournalLine[] = command.side === 'BUY_FX'
    ? [
        { account: `inventory:${command.boughtCurrency}`, currency: command.boughtCurrency, debit: command.boughtAmount, credit: '0', baseDebit: money(boughtBase), baseCredit: '0', nativeAmount: command.boughtAmount, rate: boughtBase.div(bought).toFixed(18) },
        { account: `cashbox:${command.cashboxId}`, currency: command.soldCurrency, debit: '0', credit: command.soldAmount, baseDebit: '0', baseCredit: money(soldBase), nativeAmount: command.soldAmount, rate: soldBase.div(sold).toFixed(18) },
      ]
    : [
        { account: `cashbox:${command.cashboxId}`, currency: command.boughtCurrency, debit: command.boughtAmount, credit: '0', baseDebit: money(boughtBase), baseCredit: '0', nativeAmount: command.boughtAmount, rate: boughtBase.div(bought).toFixed(18) },
        { account: `inventory:${command.soldCurrency}`, currency: command.soldCurrency, debit: '0', credit: command.soldAmount, baseDebit: '0', baseCredit: money(soldCost), nativeAmount: command.soldAmount, rate: soldCost.div(sold).toFixed(18) },
      ]
  if (realizedProfit.greaterThanOrEqualTo(0)) lines.push({ account: 'income:realized-fx-gain', currency: command.baseCurrency, debit: '0', credit: '0', baseDebit: '0', baseCredit: money(realizedProfit), nativeAmount: '0' })
  else lines.push({ account: 'expense:realized-fx-loss', currency: command.baseCurrency, debit: '0', credit: '0', baseDebit: money(realizedProfit.abs()), baseCredit: '0', nativeAmount: '0' })

  const entry: JournalEntry = { id: `je_${state.entries.length + 1}`, organizationId: command.organizationId, branchId: command.branchId, status: 'posted', sourceType: command.side, clientCommandId: command.clientCommandId, occurredAt: command.occurredAt ?? new Date().toISOString(), lines, realizedProfit: money(realizedProfit) }
  if (!sum(lines, 'baseDebit').eq(sum(lines, 'baseCredit'))) throw new LedgerError('Journal entry is not balanced')

  const boughtPosition = state.positions[command.boughtCurrency] ?? { quantity: new Decimal(0), carryingCost: new Decimal(0) }
  state.positions[command.soldCurrency] = { quantity: soldPosition.quantity.minus(sold), carryingCost: soldPosition.carryingCost.minus(soldCost) }
  state.positions[command.boughtCurrency] = { quantity: boughtPosition.quantity.plus(bought), carryingCost: boughtPosition.carryingCost.plus(command.side === 'BUY_FX' ? boughtBase : boughtBase) }
  state.entries.push(entry)
  state.commandReceipts[`${command.organizationId}:${command.clientCommandId}`] = entry.id
  return entry
}

export function reverseEntry(state: LedgerState, entryId: string, reason: string): JournalEntry {
  const original = state.entries.find((entry) => entry.id === entryId)
  if (!original) throw new LedgerError('Original journal entry not found')
  if (original.status === 'reversed') throw new LedgerError('Journal entry is already reversed')
  if (!reason.trim()) throw new LedgerError('A reversal reason is required')
  original.status = 'reversed'
  const reversal: JournalEntry = { ...original, id: `je_${state.entries.length + 1}`, status: 'posted', clientCommandId: `${original.clientCommandId}:reversal`, lines: original.lines.map((line) => ({ ...line, debit: line.credit, credit: line.debit, baseDebit: line.baseCredit, baseCredit: line.baseDebit })), realizedProfit: money(new Decimal(original.realizedProfit).negated()) }
  state.entries.push(reversal)
  return reversal
}
