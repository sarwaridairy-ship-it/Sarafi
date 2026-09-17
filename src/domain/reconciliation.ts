import Decimal from 'decimal.js'

const Exact = Decimal.clone({ precision: 60 })

export function exactTotal(rows: Record<string, unknown>[], column: string): string {
  return rows.reduce((total, row) => {
    const value = row[column]
    if (typeof value !== 'string' || !new Exact(value).isFinite()) {
      throw new Error(`Expected a finite decimal string for ${column}`)
    }
    return total.plus(value)
  }, new Exact(0)).toFixed()
}

export async function readCompletePages<T>(fetchPage: (offset: number, size: number) => Promise<{
  data: T[] | null; count: number | null; error?: { message: string } | null;
}>): Promise<T[]> {
  const rows: T[] = []
  let total: number | undefined
  while (rows.length <= 1_000_000) {
    const page = await fetchPage(rows.length, 500)
    if (page.error) throw new Error(page.error.message)
    if (page.count === null || !Array.isArray(page.data)) throw new Error('Incomplete reconciliation response')
    if (total !== undefined && page.count !== total) throw new Error('Data changed during reconciliation; use a quiescent target')
    total = page.count
    rows.push(...page.data)
    if (rows.length === total) return rows
    if (rows.length > total || page.data.length === 0) throw new Error('Truncated reconciliation response')
  }
  throw new Error('Reconciliation row limit exceeded; use a server-side snapshot')
}

export function invalidPostedJournals(
  entries: { id: string; status: string }[],
  lines: { id: string; journal_entry_id: string; base_debit: string; base_credit: string }[],
): string[] {
  const byEntry = new Map<string, typeof lines>()
  const seen = new Set<string>()
  for (const line of lines) {
    if (seen.has(line.id)) throw new Error('Duplicate journal line in reconciliation')
    seen.add(line.id)
    const group = byEntry.get(line.journal_entry_id) ?? []
    group.push(line)
    byEntry.set(line.journal_entry_id, group)
  }
  return entries.filter((entry) => {
    if (entry.status !== 'posted') return false
    const group = byEntry.get(entry.id) ?? []
    return group.length < 2 || exactTotal(group, 'base_debit') !== exactTotal(group, 'base_credit')
  }).map((entry) => entry.id)
}
