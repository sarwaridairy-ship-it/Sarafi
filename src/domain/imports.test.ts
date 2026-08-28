import { describe, expect, it } from 'vitest'
import { csvTemplate, previewCsvImport } from './imports'

describe('assisted import previews', () => {
  it('provides templates and reconciled dry-run totals', () => {
    expect(csvTemplate('opening_balances')).toBe('currency,amount,base_value,location,branch_id,cashbox_id\n')
    const preview = previewCsvImport('opening_balances', 'currency,amount,base_value,location,branch_id,cashbox_id\nUSD,100,7000,Main Counter,branch-a,cash-a\nAFN,200,200,Main Counter,branch-a,cash-a')
    expect(preview.canCommit).toBe(true)
    expect(preview.totals).toEqual({ amount: '300.000000000000', base_value: '7200.000000000000' })
  })
  it('rejects malformed values and duplicate keys without silent coercion', () => {
    const preview = previewCsvImport('debts', 'counterparty_reference,direction,currency,amount\ncustomer-1,receivable,USD,nope\ncustomer-1,payable,USD,20')
    expect(preview.canCommit).toBe(false)
    expect(preview.duplicates).toEqual(['customer-1'])
    expect(preview.issues.some((issue) => issue.field === 'amount')).toBe(true)
  })
})