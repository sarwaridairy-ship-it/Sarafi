import Decimal from 'decimal.js'
import { createLedgerState, postFxTrade, reverseEntry, type JournalEntry, type LedgerState } from './ledger'

export type OperationKind = 'BUY_FX' | 'SELL_FX' | 'EXCHANGE_FX' | 'RECEIVE_MONEY' | 'PAY_MONEY' | 'CREATE_RECEIVABLE' | 'SETTLE_RECEIVABLE' | 'CREATE_PAYABLE' | 'SETTLE_PAYABLE' | 'TRANSFER_CASH' | 'RECORD_EXPENSE' | 'RECORD_INCOME' | 'OWNER_INVESTMENT' | 'OWNER_WITHDRAWAL' | 'BANK_DEPOSIT' | 'BANK_WITHDRAWAL' | 'CASH_VARIANCE_ADJUSTMENT' | 'HAWALA_SEND' | 'HAWALA_RECEIVE'
export type PaymentPart = { locationId: string; currency: string; amount: string }
export type Person = { id: string; name: string; type: 'walk_in' | 'customer' | 'saraf' | 'hawala_partner' | 'supplier' | 'employee' | 'other'; phone?: string; risk: 'standard' | 'review' | 'blocked' }
export type Debt = { id: string; personId: string; direction: 'receivable' | 'payable'; currency: string; original: string; outstanding: string; dueAt?: string; sourceEntryId: string }
export type Receipt = { number: string; entryId: string; language: 'en' | 'fa-AF' | 'ps-AF'; createdAt: string }
export type HawalaTransfer = { id: string; senderId: string; beneficiaryName: string; origin: string; destination: string; partnerId: string; currency: string; amount: string; fee: string; reference: string; status: 'created' | 'funded' | 'sent' | 'ready' | 'paid' | 'cancelled' }
export type OperationsState = LedgerState & { people: Person[]; debts: Debt[]; receipts: Receipt[]; hawala: HawalaTransfer[]; nextReceipt: number }

export function createOperationsState(): OperationsState { return { ...createLedgerState(), people: [], debts: [], receipts: [], hawala: [], nextReceipt: 1 } }
const positive = (value: string) => { const number = new Decimal(value); if (!number.isFinite() || number.lte(0)) throw new Error('Amount must be greater than zero'); return number }
const receipt = (state: OperationsState, entry: JournalEntry, language: Receipt['language'] = 'en') => { const item = { number: `SAR-${String(state.nextReceipt++).padStart(8, '0')}`, entryId: entry.id, language, createdAt: new Date().toISOString() }; state.receipts.push(item); return item }
const addEntry = (state: OperationsState, kind: OperationKind, organizationId: string, branchId: string, currency: string, amount: string, location: string, memo: string): JournalEntry => {
  const value = positive(amount)
  const debitAccount = kind === 'RECORD_EXPENSE' ? `expense:${memo}` : `${kind}:${location}`
  const entry: JournalEntry = { id: `je_${state.entries.length + 1}`, organizationId, branchId, status: 'posted', sourceType: kind, clientCommandId: `${kind}:${state.entries.length + 1}`, occurredAt: new Date().toISOString(), realizedProfit: '0.000000000000', lines: [
    { account: debitAccount, currency, debit: value.toFixed(12), credit: '0', baseDebit: value.toFixed(12), baseCredit: '0', nativeAmount: value.toFixed(12) },
    { account: kind === 'OWNER_INVESTMENT' ? `equity:owner-capital:${memo}` : `offset:${location}`, currency, debit: '0', credit: value.toFixed(12), baseDebit: '0', baseCredit: value.toFixed(12), nativeAmount: value.toFixed(12) },
  ] }
  state.entries.push(entry); return entry
}

export function buyCurrency(state: OperationsState, input: { organizationId: string; branchId: string; cashboxId: string; receivedCurrency: string; receivedAmount: string; paidCurrency: string; paidAmount: string; receivedBaseValue: string; paidBaseValue: string; clientCommandId: string; language?: Receipt['language'] }) {
  const entry = postFxTrade(state, { organizationId: input.organizationId, branchId: input.branchId, cashboxId: input.cashboxId, clientCommandId: input.clientCommandId, side: 'BUY_FX', soldCurrency: input.paidCurrency, soldAmount: input.paidAmount, boughtCurrency: input.receivedCurrency, boughtAmount: input.receivedAmount, baseCurrency: input.paidCurrency, soldBaseValue: input.paidBaseValue, boughtBaseValue: input.receivedBaseValue })
  return { entry, receipt: receipt(state, entry, input.language) }
}
export function sellCurrency(state: OperationsState, input: { organizationId: string; branchId: string; cashboxId: string; givenCurrency: string; givenAmount: string; receivedCurrency: string; receivedAmount: string; givenBaseValue: string; receivedBaseValue: string; clientCommandId: string; language?: Receipt['language'] }) {
  const entry = postFxTrade(state, { organizationId: input.organizationId, branchId: input.branchId, cashboxId: input.cashboxId, clientCommandId: input.clientCommandId, side: 'SELL_FX', soldCurrency: input.givenCurrency, soldAmount: input.givenAmount, boughtCurrency: input.receivedCurrency, boughtAmount: input.receivedAmount, baseCurrency: input.receivedCurrency, soldBaseValue: input.givenBaseValue, boughtBaseValue: input.receivedBaseValue })
  return { entry, receipt: receipt(state, entry, input.language) }
}
export function exchangeCurrency(state: OperationsState, input: Parameters<typeof sellCurrency>[1]) { return sellCurrency(state, input) }
export function createDebt(state: OperationsState, input: { organizationId: string; branchId: string; personId: string; direction: Debt['direction']; currency: string; amount: string; location: string; dueAt?: string; memo?: string }) {
  const entry = addEntry(state, input.direction === 'receivable' ? 'CREATE_RECEIVABLE' : 'CREATE_PAYABLE', input.organizationId, input.branchId, input.currency, input.amount, input.location, input.memo ?? 'debt')
  const debt = { id: `debt_${state.debts.length + 1}`, personId: input.personId, direction: input.direction, currency: input.currency, original: positive(input.amount).toFixed(12), outstanding: positive(input.amount).toFixed(12), dueAt: input.dueAt, sourceEntryId: entry.id }
  state.debts.push(debt); return debt
}
export function settleDebt(state: OperationsState, input: { organizationId: string; branchId: string; debtId: string; amount: string; location: string }) {
  const debt = state.debts.find((item) => item.id === input.debtId); if (!debt) throw new Error('Debt not found')
  const amount = positive(input.amount); if (amount.gt(debt.outstanding)) throw new Error('Settlement exceeds outstanding debt')
  const entry = addEntry(state, debt.direction === 'receivable' ? 'SETTLE_RECEIVABLE' : 'SETTLE_PAYABLE', input.organizationId, input.branchId, debt.currency, input.amount, input.location, `debt:${debt.id}`)
  debt.outstanding = new Decimal(debt.outstanding).minus(amount).toFixed(12); return { debt, entry }
}
export function transferCash(state: OperationsState, input: { organizationId: string; branchId: string; currency: string; amount: string; from: string; to: string; memo?: string }) { return addEntry(state, 'TRANSFER_CASH', input.organizationId, input.branchId, input.currency, input.amount, `${input.from}->${input.to}`, input.memo ?? 'cash transfer') }
export function recordExpense(state: OperationsState, input: { organizationId: string; branchId: string; currency: string; amount: string; category: string; paidFrom: string; memo?: string }) { return addEntry(state, 'RECORD_EXPENSE', input.organizationId, input.branchId, input.currency, input.amount, input.paidFrom, `expense:${input.category}:${input.memo ?? ''}`) }
export function recordIncome(state: OperationsState, input: { organizationId: string; branchId: string; currency: string; amount: string; category: string; receivedAt: string; memo?: string }) { return addEntry(state, 'RECORD_INCOME', input.organizationId, input.branchId, input.currency, input.amount, input.receivedAt, `income:${input.category}:${input.memo ?? ''}`) }
export function ownerInvestment(state: OperationsState, input: { organizationId: string; branchId: string; currency: string; amount: string; location: string; ownerId: string }) { return addEntry(state, 'OWNER_INVESTMENT', input.organizationId, input.branchId, input.currency, input.amount, input.location, `owner-investment:${input.ownerId}`) }
export function ownerWithdrawal(state: OperationsState, input: { organizationId: string; branchId: string; currency: string; amount: string; location: string; ownerId: string }) { return addEntry(state, 'OWNER_WITHDRAWAL', input.organizationId, input.branchId, input.currency, input.amount, input.location, `owner-withdrawal:${input.ownerId}`) }
export function bankMovement(state: OperationsState, input: { organizationId: string; branchId: string; currency: string; amount: string; from: string; to: string; direction: 'deposit' | 'withdrawal' }) { return addEntry(state, input.direction === 'deposit' ? 'BANK_DEPOSIT' : 'BANK_WITHDRAWAL', input.organizationId, input.branchId, input.currency, input.amount, `${input.from}->${input.to}`, 'bank movement') }
export function hawalaSend(state: OperationsState, input: Omit<HawalaTransfer, 'id' | 'status'> & { enabled: boolean }) { if (!input.enabled) throw new Error('Hawala module is disabled'); positive(input.amount); const item = { ...input, id: `hawala_${state.hawala.length + 1}`, status: 'created' as const }; state.hawala.push(item); addEntry(state, 'HAWALA_SEND', 'hawala', input.origin, input.currency, input.amount, input.origin, `hawala:${input.reference}`); return item }
export function reverseOperation(state: OperationsState, entryId: string, reason: string) { return reverseEntry(state, entryId, reason) }
