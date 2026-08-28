import Decimal from 'decimal.js'

export type ImportKind = 'counterparties' | 'opening_balances' | 'debts'
export type ImportRow = { rowNumber: number; values: Record<string, string> }
export type ImportIssue = { rowNumber: number; field: string; message: string }
export type ImportPreview = { kind: ImportKind; rows: ImportRow[]; issues: ImportIssue[]; duplicates: string[]; totals: Record<string, string>; canCommit: boolean }

const requiredFields: Record<ImportKind, string[]> = {
  counterparties: ['display_name', 'counterparty_type'],
  opening_balances: ['currency', 'amount', 'base_value', 'location', 'branch_id', 'cashbox_id'],
  debts: ['counterparty_reference', 'direction', 'currency', 'amount'],
}
const parseCsvLine = (line: string): string[] => { const values: string[] = []; let value = ''; let quoted = false; for (let index = 0; index < line.length; index += 1) { const character = line[index]; if (character === '"') quoted = !quoted; else if (character === ',' && !quoted) { values.push(value.trim()); value = '' } else value += character } values.push(value.trim()); return values }
export function previewCsvImport(kind: ImportKind, csv: string): ImportPreview {
  const lines = csv.replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim())
  const headers = lines.length ? parseCsvLine(lines[0]).map((header) => header.toLowerCase()) : []
  const issues: ImportIssue[] = []
  for (const field of requiredFields[kind]) if (!headers.includes(field)) issues.push({ rowNumber: 1, field, message: 'Required column is missing' })
  const rows = lines.slice(1).map((line, index) => ({ rowNumber: index + 2, values: Object.fromEntries(parseCsvLine(line).map((value, valueIndex) => [headers[valueIndex] ?? `column_${valueIndex + 1}`, value])) }))
  const keys = rows.map((row) => kind === 'counterparties' ? row.values.display_name?.toLocaleLowerCase() : kind === 'opening_balances' ? `${row.values.currency}:${row.values.location}` : row.values.counterparty_reference)
  const duplicates = [...new Set(keys.filter((key, index) => key && keys.indexOf(key) !== index))]
  for (const duplicate of duplicates) issues.push({ rowNumber: rows.find((row) => (kind === 'counterparties' ? row.values.display_name?.toLocaleLowerCase() : kind === 'opening_balances' ? `${row.values.currency}:${row.values.location}` : row.values.counterparty_reference) === duplicate)?.rowNumber ?? 0, field: 'row', message: `Duplicate import key: ${duplicate}` })
  for (const row of rows) {
    for (const field of requiredFields[kind]) if (!row.values[field]) issues.push({ rowNumber: row.rowNumber, field, message: 'Value is required' })
    if (kind === 'opening_balances' || kind === 'debts') {
      const amount = row.values.amount
      try { if (!new Decimal(amount).isFinite() || new Decimal(amount).lte(0)) throw new Error() } catch { issues.push({ rowNumber: row.rowNumber, field: 'amount', message: 'Must be a positive decimal' }) }
    }
    if (kind === 'opening_balances') {
      try { if (!new Decimal(row.values.base_value).isFinite() || new Decimal(row.values.base_value).lte(0)) throw new Error() } catch { issues.push({ rowNumber: row.rowNumber, field: 'base_value', message: 'Must be a positive decimal' }) }
    }
    if (kind === 'debts' && !['receivable', 'payable'].includes(row.values.direction)) issues.push({ rowNumber: row.rowNumber, field: 'direction', message: 'Must be receivable or payable' })
  }
  const totals: Record<string, string> = {}
  const validTotal = (field: string) => rows.reduce((total, row) => { try { const value = new Decimal(row.values[field] || 0); return value.isFinite() ? total.plus(value) : total } catch { return total } }, new Decimal(0)).toFixed(12)
  if (kind === 'opening_balances' || kind === 'debts') totals.amount = validTotal('amount')
  if (kind === 'opening_balances') totals.base_value = validTotal('base_value')
  return { kind, rows, issues, duplicates, totals, canCommit: rows.length > 0 && issues.length === 0 }
}

export function csvTemplate(kind: ImportKind): string { return `${requiredFields[kind].join(',')}\n` }
