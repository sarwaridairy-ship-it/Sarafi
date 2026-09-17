import { describe, expect, it } from 'vitest'
import { exactTotal, invalidPostedJournals, readCompletePages } from './reconciliation'

describe('recovery evidence integrity', () => {
  it('reads beyond the API first-page limit even with a smaller server cap', async () => {
    const source = Array.from({ length: 1250 }, (_, id) => ({ id }))
    const rows = await readCompletePages(async (offset) => ({ data: source.slice(offset, offset + 250), count: source.length }))
    expect(rows).toEqual(source)
  })
  it('rejects changing or silently truncated data', async () => {
    await expect(readCompletePages(async (offset) => ({ data: offset ? [] : [1], count: 2 }))).rejects.toThrow('Truncated')
    await expect(readCompletePages(async (offset) => ({ data: [1], count: offset ? 3 : 2 }))).rejects.toThrow('Data changed')
  })
  it('preserves large decimal values and rejects already-rounded numeric inputs', () => {
    expect(exactTotal([{ amount: '999999999999999999.123456789012' }, { amount: '0.000000000001' }], 'amount')).toBe('999999999999999999.123456789013')
    expect(() => exactTotal([{ amount: 0.1 }], 'amount')).toThrow('decimal string')
    expect(() => exactTotal([{ amount: 'NaN' }], 'amount')).toThrow('decimal string')
  })
  it('does not let opposite journal errors cancel into a balanced global total', () => {
    const entries = [{ id: 'a', status: 'posted' }, { id: 'b', status: 'posted' }, { id: 'empty', status: 'posted' }]
    const lines = [
      { id: '1', journal_entry_id: 'a', base_debit: '1', base_credit: '0' },
      { id: '2', journal_entry_id: 'a', base_debit: '0', base_credit: '0.9' },
      { id: '3', journal_entry_id: 'b', base_debit: '0.9', base_credit: '0' },
      { id: '4', journal_entry_id: 'b', base_debit: '0', base_credit: '1' },
    ]
    expect(exactTotal(lines, 'base_debit')).toBe(exactTotal(lines, 'base_credit'))
    expect(invalidPostedJournals(entries, lines)).toEqual(['a', 'b', 'empty'])
  })
})
